using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ScriptEditor.Models.Schema;

namespace ScriptEditor.Transcription;

/// <summary>
/// Phase 3.2: given C# text, walks the BuildWorkflow() method's Add(...)
/// calls via CSharpSyntaxTree/AST and reconstructs a DiagramDocumentV2.
/// Inverts JsonToCSharpTranscriber's per-type generation for the same 4
/// verified-compilable types (SimpleActivity, EndActivity, DelayActivity,
/// TriggerTopicActivity), and its generic fallback shape for everything
/// else -- needed for a real JSON -&gt; C# -&gt; JSON round trip, not just
/// "parses something."
///
/// Real, load-bearing limitation, not a parser bug: `Add(new X(...))`
/// calls carry no connectivity information at all -- ConversaCore's
/// TopicFlow.Add() just appends to an ordered activity list. The text
/// format has no way to express which node's output wires to which
/// node's input, let alone branching. So this parser reconstructs edges
/// as a simple sequential chain (node[i] -&gt; node[i+1], via each node's
/// default `{id}-out` -&gt; `{id}-in` main ports, the same port convention
/// canvas-app/src/actions/createNode.ts uses for a freshly-created node)
/// -- the only connectivity the text itself implies. A round trip
/// through this format is therefore only "equivalent" for documents
/// whose edges were already a plain sequential chain to begin with; real
/// branching topology cannot survive a C#-text round-trip until ports
/// are represented in the generated code (a Phase 4+ concern).
///
/// Phase 3.5: CSharpSyntaxTree.ParseText never throws on its own -- it is
/// error-tolerant by design and always returns a (possibly malformed)
/// tree, even for garbage input. Without an explicit check, a real syntax
/// error (a stray brace, a missing semicolon) would silently fall through
/// to whatever partial/wrong AST shape the error-recovery parser produced
/// instead of failing loudly -- exactly the "corrupt the last-valid JSON
/// document" failure mode CONCEPT_OF_OPERATIONS.md line 333 warns against.
/// So the first thing this does is ask the tree itself for its
/// diagnostics and fail before attempting any semantic extraction.
/// </summary>
public static class CSharpToJsonParser
{
    public static DiagramDocumentV2 Parse(string code)
    {
        var tree = CSharpSyntaxTree.ParseText(code);

        var syntaxErrors = tree.GetDiagnostics()
            .Where(d => d.Severity == DiagnosticSeverity.Error)
            .Select(ToParseDiagnostic)
            .ToList();
        if (syntaxErrors.Count > 0)
        {
            throw new CSharpParseException(syntaxErrors);
        }

        var root = tree.GetRoot();

        var classDeclaration = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault();
        if (classDeclaration is null)
        {
            throw new CSharpParseException([new ParseDiagnostic("Error", "No class declaration found.", null)]);
        }

        var buildWorkflow = classDeclaration.Members
            .OfType<MethodDeclarationSyntax>()
            .FirstOrDefault(m => m.Identifier.Text == "BuildWorkflow");
        if (buildWorkflow?.Body is null)
        {
            throw new CSharpParseException([new ParseDiagnostic("Error", "No BuildWorkflow() method body found.", null)]);
        }

        var addCalls = buildWorkflow.Body.Statements
            .OfType<ExpressionStatementSyntax>()
            .Select(s => s.Expression)
            .OfType<InvocationExpressionSyntax>()
            .Where(IsAddCall)
            .ToList();

        var nodes = new List<DiagramNodeV2>();
        for (var i = 0; i < addCalls.Count; i++)
        {
            var creation = addCalls[i].ArgumentList.Arguments.FirstOrDefault()?.Expression as ObjectCreationExpressionSyntax;
            if (creation is null) continue;
            nodes.Add(ParseNode(creation, i));
        }

        var edges = new List<DiagramEdgeV2>();
        for (var i = 0; i < nodes.Count - 1; i++)
        {
            edges.Add(new DiagramEdgeV2
            {
                Id = $"e{i + 1}",
                From = new DiagramEndpointV2 { Node = nodes[i].Id, Port = $"{nodes[i].Id}-out" },
                To = new DiagramEndpointV2 { Node = nodes[i + 1].Id, Port = $"{nodes[i + 1].Id}-in" },
            });
        }

        return new DiagramDocumentV2 { Nodes = nodes, Edges = edges };
    }

    private static bool IsAddCall(InvocationExpressionSyntax invocation) =>
        invocation.Expression is IdentifierNameSyntax { Identifier.Text: "Add" };

    private static DiagramNodeV2 ParseNode(ObjectCreationExpressionSyntax creation, int index)
    {
        var typeName = creation.Type.ToString();
        var positionalArgs = creation.ArgumentList?.Arguments.Where(a => a.NameColon is null).ToList() ?? [];
        var namedArgs = creation.ArgumentList?.Arguments.Where(a => a.NameColon is not null)
            .ToDictionary(a => a.NameColon!.Name.Identifier.Text, a => a.Expression) ?? [];

        var data = new Dictionary<string, string>();
        string id;

        switch (typeName)
        {
            case "SimpleActivity":
                id = StringLiteralValue(positionalArgs.ElementAtOrDefault(0)?.Expression) ?? $"node-{index}";
                if (positionalArgs.Count > 1)
                {
                    data["message"] = StringLiteralValue(positionalArgs[1].Expression) ?? "";
                }
                break;

            case "EndActivity":
                id = StringLiteralValue(positionalArgs.ElementAtOrDefault(0)?.Expression) ?? $"node-{index}";
                if (positionalArgs.Count > 1)
                {
                    data["endMessage"] = StringLiteralValue(positionalArgs[1].Expression) ?? "";
                }
                break;

            case "DelayActivity":
                id = StringLiteralValue(positionalArgs.ElementAtOrDefault(0)?.Expression) ?? $"node-{index}";
                if (positionalArgs.Count > 1 && TryParseTimeSpanFromMillisecondsCall(positionalArgs[1].Expression, out var milliseconds))
                {
                    data["durationMs"] = milliseconds;
                }
                foreach (var (key, value) in InitializerAssignments(creation))
                {
                    if (key == "ShowTypingIndicator") data["showTyping"] = LiteralValueAsString(value);
                }
                break;

            case "TriggerTopicActivity":
                id = StringLiteralValue(positionalArgs.ElementAtOrDefault(0)?.Expression) ?? $"node-{index}";
                if (positionalArgs.Count > 1)
                {
                    data["subTopicName"] = StringLiteralValue(positionalArgs[1].Expression) ?? "";
                }
                if (namedArgs.TryGetValue("waitForCompletion", out var waitExpr))
                {
                    data["waitForCompletion"] = LiteralValueAsString(waitExpr);
                }
                break;

            default:
                // Generic fallback (inverts JsonToCSharpTranscriber.BuildGenericFallback):
                // first positional arg is the id; every object-initializer
                // assignment is a data entry, key un-capitalized to invert
                // Capitalize().
                id = StringLiteralValue(positionalArgs.ElementAtOrDefault(0)?.Expression) ?? $"node-{index}";
                foreach (var (key, value) in InitializerAssignments(creation))
                {
                    data[Uncapitalize(key)] = LiteralValueAsString(value);
                }
                break;
        }

        return new DiagramNodeV2
        {
            Id = id,
            Name = id,
            Type = typeName,
            X = index * 260,
            Y = 0,
            Data = data,
            Ports =
            [
                new DiagramPortV2 { Id = $"{id}-in", Name = "Input", Direction = DiagramPortDirectionV2.Input, Role = DiagramPortRoleV2.Main, Type = "flow", Position = DiagramPortSideV2.Left },
                new DiagramPortV2 { Id = $"{id}-out", Name = "Output", Direction = DiagramPortDirectionV2.Output, Role = DiagramPortRoleV2.Main, Type = "flow", Position = DiagramPortSideV2.Right },
            ],
        };
    }

    private static IEnumerable<(string Key, ExpressionSyntax Value)> InitializerAssignments(ObjectCreationExpressionSyntax creation)
    {
        if (creation.Initializer is null) yield break;
        foreach (var expr in creation.Initializer.Expressions)
        {
            if (expr is AssignmentExpressionSyntax { Left: IdentifierNameSyntax left } assignment)
            {
                yield return (left.Identifier.Text, assignment.Right);
            }
        }
    }

    private static bool TryParseTimeSpanFromMillisecondsCall(ExpressionSyntax expression, out string milliseconds)
    {
        if (expression is InvocationExpressionSyntax
            {
                Expression: MemberAccessExpressionSyntax { Expression: IdentifierNameSyntax { Identifier.Text: "TimeSpan" }, Name.Identifier.Text: "FromMilliseconds" },
                ArgumentList.Arguments: [var arg, ..],
            } && arg.Expression is LiteralExpressionSyntax literal)
        {
            milliseconds = literal.Token.ValueText;
            return true;
        }
        milliseconds = "";
        return false;
    }

    private static string? StringLiteralValue(ExpressionSyntax? expression) =>
        expression is LiteralExpressionSyntax { Token.RawKind: (int)SyntaxKind.StringLiteralToken } literal
            ? literal.Token.ValueText
            : null;

    private static string LiteralValueAsString(ExpressionSyntax expression) => expression switch
    {
        LiteralExpressionSyntax { RawKind: (int)SyntaxKind.TrueLiteralExpression } => "true",
        LiteralExpressionSyntax { RawKind: (int)SyntaxKind.FalseLiteralExpression } => "false",
        LiteralExpressionSyntax literal => literal.Token.ValueText,
        _ => expression.ToString(),
    };

    private static string Uncapitalize(string key) =>
        key.Length == 0 ? key : char.ToLowerInvariant(key[0]) + key[1..];

    private static ParseDiagnostic ToParseDiagnostic(Diagnostic d)
    {
        var span = d.Location.GetLineSpan();
        int? line = span.IsValid ? span.StartLinePosition.Line + 1 : null;
        return new ParseDiagnostic(d.Severity.ToString(), d.GetMessage(), line);
    }
}

/// <summary>One diagnostic to surface in the code editor gutter (Phase 3.5
/// / CONCEPT_OF_OPERATIONS.md line 333). Line is 1-based to match editor
/// conventions (Roslyn's own LinePosition is 0-based); null when a
/// diagnostic isn't tied to a specific source location (e.g. "no
/// BuildWorkflow() method found").</summary>
public sealed record ParseDiagnostic(string Severity, string Message, int? Line);

/// <summary>Thrown instead of returning a malformed/partial document --
/// carries every diagnostic Parse found, not just the first, so the editor
/// can surface all of them at once rather than round-tripping one syntax
/// error at a time.</summary>
public sealed class CSharpParseException(List<ParseDiagnostic> diagnostics)
    : Exception(diagnostics.FirstOrDefault()?.Message ?? "C# parse error")
{
    public List<ParseDiagnostic> Diagnostics { get; } = diagnostics;
}
