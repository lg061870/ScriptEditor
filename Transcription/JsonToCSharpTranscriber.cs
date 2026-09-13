using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ScriptEditor.Models.Schema;
using static Microsoft.CodeAnalysis.CSharp.SyntaxFactory;

namespace ScriptEditor.Transcription;

/// <summary>
/// Phase 3.1: replaces the Phase 2.4 frontend string-template stub.
///
/// Decision: built via Roslyn <see cref="SyntaxFactory"/> (a real
/// <see cref="CompilationUnitSyntax"/> tree, rendered with
/// <c>NormalizeWhitespace().ToFullString()</c>), not string concatenation.
/// Chosen because (a) it guarantees syntactically valid C# by construction,
/// and (b) it keeps this transcriber and Phase 3.2's parser symmetric: both
/// operate on Roslyn's C# object model, rather than one side using Roslyn
/// and the other regex-matching generated text.
///
/// "Compilable" (this task's acceptance criteria) is only achievable for
/// activity types whose real constructor takes plain literal arguments --
/// four of the six prototype-seeded types (SimpleActivity, EndActivity,
/// DelayActivity, TriggerTopicActivity), verified against their actual
/// signatures in Activities/*.cs, get real per-type generation below.
/// The other two seeded types (PromptActivity, QuickAnswerActivity) and
/// AdaptiveCardActivity all require constructor-injected framework
/// dependencies with no literal representation in our JSON schema:
/// PromptActivity needs a live Microsoft.SemanticKernel.Kernel instance;
/// QuickAnswerActivity and AdaptiveCardActivity both need a
/// TopicWorkflowContext AND a typed ILogger&lt;T&gt;, and
/// AdaptiveCardActivity additionally needs compile-time generic type
/// arguments (TCard/TModel) and a card-factory lambda -- none of which
/// exist as data anywhere in DiagramNodeV2. These fall back to a
/// best-effort generic form, explicitly commented as such in the
/// generated output itself, not silently passed off as correct. Fixing
/// this for real is CONCEPT_OF_OPERATIONS.md §4.3's "Dynamic ConversaCore
/// Reflection Catalog" (or an equivalent per-type constructor/property
/// map) -- out of scope here, and flagged rather than glossed over.
///
/// Does not yet order statements by the edge graph (topological/branch
/// order) -- BuildWorkflow() emits one Add(...) per DiagramNodeV2 in
/// array order; real graph-aware ordering is separate work.
/// </summary>
public static class JsonToCSharpTranscriber
{
    public static string Transcribe(DiagramDocumentV2 document, string className = "MainConversation")
    {
        var statements = document.Nodes.Select(BuildAddStatement).ToArray();

        // BuildWorkflow() is NOT a virtual/abstract member of the real
        // ConversaCore.TopicFlow.TopicFlow base class -- verified against
        // the base class itself and a real subclass (SampleTopic.cs): it's
        // just a private convention method the derived class defines and
        // calls from its own constructor. `protected override` (what the
        // Phase 0.5 stub and CONCEPT_OF_OPERATIONS.md's prose both assumed)
        // does not compile -- CS0115, no suitable method to override.
        var buildWorkflowMethod = MethodDeclaration(PredefinedType(Token(SyntaxKind.VoidKeyword)), "BuildWorkflow")
            .AddModifiers(Token(SyntaxKind.PrivateKeyword))
            .WithBody(Block(statements));

        // TopicFlow's constructor is (TopicWorkflowContext context, ILogger
        // logger, string name = "TopicFlow") -- the derived class's own
        // constructor forwards context/logger and calls BuildWorkflow(),
        // again matching SampleTopic.cs's real pattern, not a parameterless
        // constructor (TopicFlow has none).
        var constructorParams = ParameterList(SeparatedList(new[]
        {
            Parameter(Identifier("context")).WithType(IdentifierName("TopicWorkflowContext")),
            Parameter(Identifier("logger")).WithType(IdentifierName("ILogger")),
        }));

        var baseCall = ConstructorInitializer(SyntaxKind.BaseConstructorInitializer)
            .WithArgumentList(ArgumentList(SeparatedList(new[]
            {
                Argument(IdentifierName("context")),
                Argument(IdentifierName("logger")),
                Argument(StringLiteral(className)),
            })));

        var constructor = ConstructorDeclaration(className)
            .AddModifiers(Token(SyntaxKind.PublicKeyword))
            .WithParameterList(constructorParams)
            .WithInitializer(baseCall)
            .WithBody(Block(ExpressionStatement(InvocationExpression(IdentifierName("BuildWorkflow")))));

        var classDeclaration = ClassDeclaration(className)
            .AddModifiers(Token(SyntaxKind.PublicKeyword), Token(SyntaxKind.PartialKeyword))
            .AddBaseListTypes(SimpleBaseType(IdentifierName("TopicFlow")))
            .AddMembers(constructor, buildWorkflowMethod);

        var compilationUnit = CompilationUnit().AddMembers(classDeclaration);

        return compilationUnit.NormalizeWhitespace().ToFullString().TrimEnd() + "\n";
    }

    private static readonly HashSet<string> VerifiedCompilableTypes =
        ["SimpleActivity", "EndActivity", "DelayActivity", "TriggerTopicActivity"];

    private static StatementSyntax BuildAddStatement(DiagramNodeV2 node)
    {
        var id = node.Name ?? node.Id;

        ExpressionSyntax objectCreation = node.Type switch
        {
            "SimpleActivity" => BuildSimpleActivity(id, node.Data),
            "EndActivity" => BuildEndActivity(id, node.Data),
            "DelayActivity" => BuildDelayActivity(id, node.Data),
            "TriggerTopicActivity" => BuildTriggerTopicActivity(id, node.Data),
            _ => BuildGenericFallback(node.Type, id, node.Data),
        };

        var addInvocation = InvocationExpression(IdentifierName("Add"))
            .WithArgumentList(ArgumentList(SingletonSeparatedList(Argument(objectCreation))));

        StatementSyntax statement = ExpressionStatement(addInvocation);

        if (!VerifiedCompilableTypes.Contains(node.Type))
        {
            statement = statement.WithLeadingTrivia(
                Comment($"// best-effort: {node.Type}'s real constructor/properties aren't modeled yet, this may not compile"),
                LineFeed);
        }

        return statement;
    }

    /// <summary>Real signature: SimpleActivity(string id, string message).</summary>
    private static ExpressionSyntax BuildSimpleActivity(string id, Dictionary<string, string> data)
    {
        var message = data.GetValueOrDefault("message", "");
        return ObjectCreationExpression(IdentifierName("SimpleActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(new[]
            {
                Argument(StringLiteral(id)),
                Argument(StringLiteral(message)),
            })));
    }

    /// <summary>Real signature: EndActivity(string id, string? message = null).</summary>
    private static ExpressionSyntax BuildEndActivity(string id, Dictionary<string, string> data)
    {
        var args = new List<ArgumentSyntax> { Argument(StringLiteral(id)) };
        if (data.TryGetValue("message", out var message) && !string.IsNullOrEmpty(message))
        {
            args.Add(Argument(StringLiteral(message)));
        }
        return ObjectCreationExpression(IdentifierName("EndActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(args)));
    }

    /// <summary>
    /// Real signature: DelayActivity(string id, TimeSpan delay), with a
    /// real settable ShowTypingIndicator property (not "ShowTyping" --
    /// the schema field's key doesn't match the real property name, this
    /// generator corrects for that explicitly).
    /// </summary>
    private static ExpressionSyntax BuildDelayActivity(string id, Dictionary<string, string> data)
    {
        var seconds = data.TryGetValue("durationSec", out var raw) && double.TryParse(raw, out var parsed) ? parsed : 1.0;

        var timeSpanCall = InvocationExpression(
                MemberAccessExpression(SyntaxKind.SimpleMemberAccessExpression, IdentifierName("TimeSpan"), IdentifierName("FromSeconds")))
            .WithArgumentList(ArgumentList(SingletonSeparatedList(
                Argument(LiteralExpression(SyntaxKind.NumericLiteralExpression, Literal(seconds))))));

        ExpressionSyntax creation = ObjectCreationExpression(IdentifierName("DelayActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(new[] { Argument(StringLiteral(id)), Argument(timeSpanCall) })));

        if (data.TryGetValue("showTyping", out var showTyping) && !string.IsNullOrEmpty(showTyping))
        {
            var literal = showTyping == "true"
                ? LiteralExpression(SyntaxKind.TrueLiteralExpression)
                : LiteralExpression(SyntaxKind.FalseLiteralExpression);
            var assignment = AssignmentExpression(SyntaxKind.SimpleAssignmentExpression, IdentifierName("ShowTypingIndicator"), literal);
            creation = ((ObjectCreationExpressionSyntax)creation).WithInitializer(
                InitializerExpression(SyntaxKind.ObjectInitializerExpression, SingletonSeparatedList((ExpressionSyntax)assignment)));
        }

        return creation;
    }

    /// <summary>
    /// Real signature: TriggerTopicActivity(string id, string
    /// topicToTrigger, ILogger? logger = null, bool waitForCompletion =
    /// false, IConversationContext? conversationContext = null). Skips
    /// the optional `logger`/`conversationContext` params (no literal
    /// representation) via a named argument for waitForCompletion.
    /// </summary>
    private static ExpressionSyntax BuildTriggerTopicActivity(string id, Dictionary<string, string> data)
    {
        var topic = data.GetValueOrDefault("subTopicName", "");
        var args = new List<ArgumentSyntax>
        {
            Argument(StringLiteral(id)),
            Argument(StringLiteral(topic)),
        };

        if (data.TryGetValue("waitForCompletion", out var wait) && !string.IsNullOrEmpty(wait))
        {
            var literal = wait == "true"
                ? LiteralExpression(SyntaxKind.TrueLiteralExpression)
                : LiteralExpression(SyntaxKind.FalseLiteralExpression);
            args.Add(Argument(literal).WithNameColon(NameColon("waitForCompletion")));
        }

        return ObjectCreationExpression(IdentifierName("TriggerTopicActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(args)));
    }

    /// <summary>
    /// Best-effort form for every activity type not covered above --
    /// including PromptActivity/QuickAnswerActivity/AdaptiveCardActivity
    /// (need constructor-injected Kernel/Context/ILogger&lt;T&gt; this
    /// schema has no representation for) and the ~30 catalog shapes with
    /// no per-type generator written yet. NOT verified to compile --
    /// marked with an explicit comment in the generated code itself so a
    /// developer reading the preview isn't misled into thinking it's real.
    /// </summary>
    private static ExpressionSyntax BuildGenericFallback(string type, string id, Dictionary<string, string> data)
    {
        var properties = data
            .Where(entry => !string.IsNullOrEmpty(entry.Value))
            .Select(entry => (ExpressionSyntax)AssignmentExpression(
                SyntaxKind.SimpleAssignmentExpression,
                IdentifierName(Capitalize(entry.Key)),
                ValueLiteral(entry.Value)))
            .ToArray();

        ExpressionSyntax creation = ObjectCreationExpression(IdentifierName(type))
            .WithArgumentList(ArgumentList(SingletonSeparatedList(Argument(StringLiteral(id)))));

        if (properties.Length > 0)
        {
            creation = ((ObjectCreationExpressionSyntax)creation).WithInitializer(
                InitializerExpression(SyntaxKind.ObjectInitializerExpression, SeparatedList(properties)));
        }

        return creation;
    }

    private static ExpressionSyntax ValueLiteral(string value)
    {
        if (value == "true") return LiteralExpression(SyntaxKind.TrueLiteralExpression);
        if (value == "false") return LiteralExpression(SyntaxKind.FalseLiteralExpression);
        if (int.TryParse(value, out var intValue))
        {
            return LiteralExpression(SyntaxKind.NumericLiteralExpression, Literal(intValue));
        }
        if (double.TryParse(value, out var doubleValue) && value.Contains('.'))
        {
            return LiteralExpression(SyntaxKind.NumericLiteralExpression, Literal(doubleValue));
        }
        return StringLiteral(value);
    }

    private static ExpressionSyntax StringLiteral(string value) =>
        LiteralExpression(SyntaxKind.StringLiteralExpression, Literal(value));

    private static string Capitalize(string key) =>
        key.Length == 0 ? key : char.ToUpperInvariant(key[0]) + key[1..];
}
