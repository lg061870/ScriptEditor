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
/// </summary>
public static class CSharpToJsonParser
{
    public static DiagramDocumentV2 Parse(string code)
    {
        var tree = CSharpSyntaxTree.ParseText(code);
        var root = tree.GetRoot();

        var classDeclaration = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault();
        if (classDeclaration is null)
        {
            throw new FormatException("No class declaration found.");
        }

        var buildWorkflow = classDeclaration.Members
            .OfType<MethodDeclarationSyntax>()
            .FirstOrDefault(m => m.Identifier.Text == "BuildWorkflow");
        if (buildWorkflow?.Body is null)
        {
            throw new FormatException("No BuildWorkflow() method body found.");
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
                    data["message"] = StringLiteralValue(positionalArgs[1].Expression) ?? "";
                }
                break;

            case "DelayActivity":
                id = StringLiteralValue(positionalArgs.ElementAtOrDefault(0)?.Expression) ?? $"node-{index}";
                if (positionalArgs.Count > 1 && TryParseTimeSpanFromSecondsCall(positionalArgs[1].Expression, out var seconds))
                {
                    data["durationSec"] = seconds;
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

    private static bool TryParseTimeSpanFromSecondsCall(ExpressionSyntax expression, out string seconds)
    {
        if (expression is InvocationExpressionSyntax
            {
                Expression: MemberAccessExpressionSyntax { Expression: IdentifierNameSyntax { Identifier.Text: "TimeSpan" }, Name.Identifier.Text: "FromSeconds" },
                ArgumentList.Arguments: [var arg, ..],
            } && arg.Expression is LiteralExpressionSyntax literal)
        {
            seconds = literal.Token.ValueText;
            return true;
        }
        seconds = "";
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
}
