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

        var addStatements = buildWorkflow.Body.Statements
            .OfType<ExpressionStatementSyntax>()
            .Where(s => s.Expression is InvocationExpressionSyntax invocation && IsAddCall(invocation))
            .ToList();

        var allNodes = new List<DiagramNodeV2>();
        var happyPathNodes = new List<DiagramNodeV2>();
        var edges = new List<DiagramEdgeV2>();
        int edgeCounter = 1;
        int nodeIndexCounter = 0;

        for (var i = 0; i < addStatements.Count; i++)
        {
            var stmt = addStatements[i];
            var invocation = (InvocationExpressionSyntax)stmt.Expression;
            var creation = invocation.ArgumentList.Arguments.FirstOrDefault()?.Expression as ObjectCreationExpressionSyntax;
            if (creation is null) continue;
            var node = ParseNode(creation, nodeIndexCounter++);

            if (node.Type == "ParallelActivity")
            {
                var triviaText = stmt.GetLeadingTrivia().ToFullString();
                var branchMatch = System.Text.RegularExpressions.Regex.Match(triviaText, @"//\s*branches:\s*(.+)");
                if (branchMatch.Success)
                {
                    var bText = branchMatch.Groups[1].Value.Trim();
                    node.Data["branches"] = bText;
                    node.Data["branchCount"] = bText.Split(new[] { '|' }, StringSplitOptions.RemoveEmptyEntries).Length.ToString();
                }
            }

            happyPathNodes.Add(node);
            allNodes.Add(node);

            // Check for OnExceptionActivity in creation initializer
            foreach (var (key, value) in InitializerAssignments(creation))
            {
                if (key == "OnExceptionActivity" && value is ObjectCreationExpressionSyntax excCreation)
                {
                    var excNodes = ParseExceptionBranch(excCreation, ref nodeIndexCounter);
                    if (excNodes.Count > 0)
                    {
                        for (int k = 0; k < excNodes.Count; k++)
                        {
                            excNodes[k].X = node.X + (k * 240);
                            excNodes[k].Y = node.Y + 160;
                            allNodes.Add(excNodes[k]);
                        }

                        edges.Add(new DiagramEdgeV2
                        {
                            Id = $"e{edgeCounter++}",
                            From = new DiagramEndpointV2 { Node = node.Id, Port = $"{node.Id}-exc" },
                            To = new DiagramEndpointV2 { Node = excNodes[0].Id, Port = $"{excNodes[0].Id}-in" }
                        });

                        for (int k = 0; k < excNodes.Count - 1; k++)
                        {
                            edges.Add(new DiagramEdgeV2
                            {
                                Id = $"e{edgeCounter++}",
                                From = new DiagramEndpointV2 { Node = excNodes[k].Id, Port = $"{excNodes[k].Id}-out" },
                                To = new DiagramEndpointV2 { Node = excNodes[k + 1].Id, Port = $"{excNodes[k + 1].Id}-in" }
                            });
                        }
                    }
                }
            }
        }

        for (var i = 0; i < happyPathNodes.Count - 1; i++)
        {
            edges.Add(new DiagramEdgeV2
            {
                Id = $"e{edgeCounter++}",
                From = new DiagramEndpointV2 { Node = happyPathNodes[i].Id, Port = $"{happyPathNodes[i].Id}-out" },
                To = new DiagramEndpointV2 { Node = happyPathNodes[i + 1].Id, Port = $"{happyPathNodes[i + 1].Id}-in" },
            });
        }

        return new DiagramDocumentV2 { Nodes = allNodes, Edges = edges };
    }

    private static List<DiagramNodeV2> ParseExceptionBranch(ObjectCreationExpressionSyntax excCreation, ref int nodeIndexCounter)
    {
        var list = new List<DiagramNodeV2>();
        var rawTypeName = excCreation.Type.ToString();
        var typeName = rawTypeName.Contains('<')
            ? rawTypeName[..rawTypeName.IndexOf('<')].Trim()
            : rawTypeName;

        if (typeName == "CompositeActivity")
        {
            var args = excCreation.ArgumentList?.Arguments;
            if (args != null && args.Value.Count > 1)
            {
                var secondArg = args.Value[1].Expression;
                if (secondArg is ArrayCreationExpressionSyntax arrayCreation && arrayCreation.Initializer != null)
                {
                    foreach (var element in arrayCreation.Initializer.Expressions.OfType<ObjectCreationExpressionSyntax>())
                    {
                        list.Add(ParseNode(element, nodeIndexCounter++));
                    }
                }
                else if (secondArg is ImplicitArrayCreationExpressionSyntax impArray && impArray.Initializer != null)
                {
                    foreach (var element in impArray.Initializer.Expressions.OfType<ObjectCreationExpressionSyntax>())
                    {
                        list.Add(ParseNode(element, nodeIndexCounter++));
                    }
                }
            }
        }
        else
        {
            list.Add(ParseNode(excCreation, nodeIndexCounter++));
        }

        return list;
    }

    private static bool IsAddCall(InvocationExpressionSyntax invocation) =>
        invocation.Expression is IdentifierNameSyntax { Identifier.Text: "Add" };

    private static DiagramNodeV2 ParseNode(ObjectCreationExpressionSyntax creation, int index)
    {
        var rawTypeName = creation.Type.ToString();
        var typeName = rawTypeName.Contains('<')
            ? rawTypeName[..rawTypeName.IndexOf('<')].Trim()
            : rawTypeName;
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
                    data["message"] = ParseSimpleActivityMessage(positionalArgs[1].Expression) ?? "";
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
                    data["topicToTrigger"] = StringLiteralValue(positionalArgs[1].Expression) ?? "";
                }
                if (namedArgs.TryGetValue("waitForCompletion", out var waitExpr))
                {
                    data["waitForCompletion"] = LiteralValueAsString(waitExpr);
                }
                break;

            case "QuickAnswerActivity":
                id = StringLiteralValue(positionalArgs.ElementAtOrDefault(0)?.Expression) ?? $"node-{index}";
                if (positionalArgs.Count > 1)
                {
                    data["question"] = StringLiteralValue(positionalArgs[1].Expression) ?? "";
                }
                if (positionalArgs.Count > 2)
                {
                    var answersArg = positionalArgs[2].Expression;
                    if (answersArg is ArrayCreationExpressionSyntax arrSyntax && arrSyntax.Initializer != null)
                    {
                        var items = arrSyntax.Initializer.Expressions
                            .Select(e => StringLiteralValue(e) ?? "")
                            .Where(s => !string.IsNullOrEmpty(s));
                        data["answers"] = string.Join(" | ", items);
                        data["optionsMode"] = "static";
                    }
                    else if (answersArg is ImplicitArrayCreationExpressionSyntax impArr && impArr.Initializer != null)
                    {
                        var items = impArr.Initializer.Expressions
                            .Select(e => StringLiteralValue(e) ?? "")
                            .Where(s => !string.IsNullOrEmpty(s));
                        data["answers"] = string.Join(" | ", items);
                        data["optionsMode"] = "static";
                    }
                    else if (StringLiteralValue(answersArg) is string varName)
                    {
                        data["answersVariable"] = varName;
                        data["optionsMode"] = "variable";
                    }
                }
                if (namedArgs.TryGetValue("answersVariableKey", out var awk))
                {
                    data["answersVariable"] = StringLiteralValue(awk) ?? "";
                    data["optionsMode"] = "variable";
                }
                if (namedArgs.TryGetValue("outputVariable", out var outVar))
                {
                    data["outputVariable"] = StringLiteralValue(outVar) ?? "";
                }
                else if (positionalArgs.Count > 6)
                {
                    data["outputVariable"] = StringLiteralValue(positionalArgs[6].Expression) ?? "";
                }
                if (namedArgs.TryGetValue("isRequired", out var isReqExpr))
                {
                    data["required"] = LiteralValueAsString(isReqExpr);
                }
                else if (positionalArgs.Count > 5)
                {
                    data["required"] = LiteralValueAsString(positionalArgs[5].Expression);
                }
                foreach (var (key, value) in InitializerAssignments(creation))
                {
                    if (key == "IsRequired") data["required"] = LiteralValueAsString(value);
                }
                break;

            case "AdaptiveCardActivity":
                id = StringLiteralValue(positionalArgs.ElementAtOrDefault(0)?.Expression) ?? $"node-{index}";
                if (namedArgs.TryGetValue("modelContextKey", out var mck))
                {
                    data["submissionContextKey"] = StringLiteralValue(mck) ?? "";
                }
                foreach (var (key, value) in InitializerAssignments(creation))
                {
                    if (key == "IsRequired") data["required"] = LiteralValueAsString(value);
                }
                break;

            case "PublishHostNotificationActivity":
                id = StringLiteralValue(positionalArgs.ElementAtOrDefault(0)?.Expression) ?? $"node-{index}";
                if (positionalArgs.Count > 1)
                {
                    data["eventName"] = StringLiteralValue(positionalArgs[1].Expression) ?? "";
                }
                break;



            case "InvokeToolActivity":
                id = StringLiteralValue(positionalArgs.ElementAtOrDefault(0)?.Expression) ?? $"node-{index}";
                if (positionalArgs.Count > 1)
                {
                    data["toolId"] = StringLiteralValue(positionalArgs[1].Expression) ?? "";
                }
                if (positionalArgs.Count > 5)
                {
                    data["resultContextKey"] = StringLiteralValue(positionalArgs[5].Expression) ?? "";
                }
                else if (namedArgs.TryGetValue("resultContextKey", out var rck))
                {
                    data["resultContextKey"] = StringLiteralValue(rck) ?? "";
                }
                break;

            case "SetVariableActivity":
                id = StringLiteralValue(positionalArgs.ElementAtOrDefault(0)?.Expression) ?? $"node-{index}";
                if (positionalArgs.Count > 1)
                {
                    data["variableName"] = StringLiteralValue(positionalArgs[1].Expression) ?? "";
                }
                if (positionalArgs.Count > 2)
                {
                    data["value"] = StringLiteralValue(positionalArgs[2].Expression) ?? "";
                }
                if (positionalArgs.Count > 5)
                {
                    data["isGlobal"] = LiteralValueAsString(positionalArgs[5].Expression);
                }
                else if (namedArgs.TryGetValue("isGlobal", out var isGlobArg))
                {
                    data["isGlobal"] = LiteralValueAsString(isGlobArg);
                }
                else
                {
                    data["isGlobal"] = "true";
                }
                data["validateNaming"] = "true";
                foreach (var (key, value) in InitializerAssignments(creation))
                {
                    if (key == "ValidateGlobalNaming" || key == "ValidateNaming")
                    {
                        data["validateNaming"] = LiteralValueAsString(value);
                    }
                    else if (key == "VariableName")
                    {
                        data["variableName"] = StringLiteralValue(value) ?? "";
                    }
                    else if (key == "Value")
                    {
                        data["value"] = StringLiteralValue(value) ?? "";
                    }
                    else if (key == "IsGlobal")
                    {
                        data["isGlobal"] = LiteralValueAsString(value);
                    }
                }
                break;

            case "SwitchActivity":
                id = StringLiteralValue(positionalArgs.ElementAtOrDefault(0)?.Expression) ?? $"node-{index}";
                if (positionalArgs.Count > 1)
                {
                    data["valueContextKey"] = StringLiteralValue(positionalArgs[1].Expression) ?? "";
                }
                if (positionalArgs.ElementAtOrDefault(2)?.Expression is ObjectCreationExpressionSyntax dictCreation &&
                    dictCreation.Initializer is not null)
                {
                    var keys = new List<string>();
                    foreach (var expr in dictCreation.Initializer.Expressions)
                    {
                        if (expr is AssignmentExpressionSyntax assign &&
                            assign.Left is ImplicitElementAccessSyntax elemAccess &&
                            elemAccess.ArgumentList.Arguments.FirstOrDefault()?.Expression is ExpressionSyntax keyArg)
                        {
                            var k = StringLiteralValue(keyArg);
                            if (!string.IsNullOrEmpty(k)) keys.Add(k);
                        }
                    }
                    if (keys.Count > 0)
                    {
                        data["caseKeys"] = string.Join(" | ", keys);
                    }
                }
                if (positionalArgs.Count > 3 && positionalArgs[3].Expression is not LiteralExpressionSyntax { RawKind: (int)SyntaxKind.NullLiteralExpression })
                {
                    if (positionalArgs[3].Expression is ObjectCreationExpressionSyntax defaultObj &&
                        defaultObj.ArgumentList?.Arguments.Count > 1)
                    {
                        data["defaultCase"] = StringLiteralValue(defaultObj.ArgumentList.Arguments[1].Expression) ?? "Default";
                    }
                    else
                    {
                        data["defaultCase"] = "Default";
                    }
                }
                else
                {
                    data["defaultCase"] = "";
                }
                data["loopAfterCase"] = "false";
                foreach (var (key, value) in InitializerAssignments(creation))
                {
                    if (key == "LoopAfterCase")
                    {
                        data["loopAfterCase"] = LiteralValueAsString(value);
                    }
                    else if (key == "ValueContextKey")
                    {
                        data["valueContextKey"] = StringLiteralValue(value) ?? "";
                    }
                    else if (key == "CaseKeys")
                    {
                        data["caseKeys"] = StringLiteralValue(value) ?? "";
                    }
                    else if (key == "DefaultCase")
                    {
                        data["defaultCase"] = StringLiteralValue(value) ?? "";
                    }
                }
                break;

            case "ParallelActivity":
                id = StringLiteralValue(positionalArgs.ElementAtOrDefault(0)?.Expression) ?? $"node-{index}";
                data.TryAdd("branches", "Branch 1 | Branch 2");
                data.TryAdd("branchCount", "2");
                if (positionalArgs.ElementAtOrDefault(1)?.Expression is ArrayCreationExpressionSyntax arrCreation &&
                    arrCreation.Initializer is not null)
                {
                    var branchNames = new List<string>();
                    foreach (var expr in arrCreation.Initializer.Expressions)
                    {
                        if (expr is ObjectCreationExpressionSyntax childCreation)
                        {
                            var childId = StringLiteralValue(childCreation.ArgumentList?.Arguments.FirstOrDefault()?.Expression);
                            if (!string.IsNullOrEmpty(childId))
                            {
                                var label = childId.StartsWith($"{id}_") ? childId.Substring(id.Length + 1) : childId;
                                branchNames.Add(label);
                            }
                        }
                    }
                    if (branchNames.Count > 0)
                    {
                        data["branches"] = string.Join(" | ", branchNames);
                        data["branchCount"] = branchNames.Count.ToString();
                    }
                }
                data["continueOnError"] = "false";
                data["completeMessage"] = "";
                foreach (var (key, value) in InitializerAssignments(creation))
                {
                    if (key == "ContinueOnError")
                    {
                        data["continueOnError"] = LiteralValueAsString(value);
                    }
                    else if (key == "CompleteMessage")
                    {
                        data["completeMessage"] = StringLiteralValue(value) ?? "";
                    }
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
            Ports = BuildPortsForParsedNode(id, typeName, data),
        };
    }

    private static List<DiagramPortV2> BuildPortsForParsedNode(string id, string typeName, Dictionary<string, string> data)
    {
        return
        [
            new DiagramPortV2 { Id = $"{id}-in", Name = "Input", Direction = DiagramPortDirectionV2.Input, Role = DiagramPortRoleV2.Main, Type = "flow", Position = DiagramPortSideV2.Left },
            new DiagramPortV2 { Id = $"{id}-out", Name = "Output", Direction = DiagramPortDirectionV2.Output, Role = DiagramPortRoleV2.Main, Type = "flow", Position = DiagramPortSideV2.Right },
            new DiagramPortV2 { Id = $"{id}-exc", Name = "Exception", Direction = DiagramPortDirectionV2.Output, Role = DiagramPortRoleV2.Exception, Type = "flow", Position = DiagramPortSideV2.Bottom },
        ];
    }

    private static string Slugify(string label)
    {
        var lower = label.ToLowerInvariant();
        var cleaned = System.Text.RegularExpressions.Regex.Replace(lower, @"[^a-z0-9]+", "-");
        return cleaned.Trim('-');
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

    private static string? ParseSimpleActivityMessage(ExpressionSyntax? expression)
    {
        if (expression == null) return null;
        if (StringLiteralValue(expression) is { } literal) return literal;

        if (expression is LambdaExpressionSyntax lambda)
        {
            var body = lambda.Body switch
            {
                BlockSyntax block => block.Statements.OfType<ReturnStatementSyntax>().FirstOrDefault()?.Expression,
                ExpressionSyntax expr => expr,
                _ => null
            };

            while (body is CastExpressionSyntax cast)
            {
                body = cast.Expression;
            }

            if (body is InterpolatedStringExpressionSyntax interpolated)
            {
                var sb = new System.Text.StringBuilder();
                foreach (var content in interpolated.Contents)
                {
                    if (content is InterpolatedStringTextSyntax text)
                    {
                        sb.Append(text.TextToken.ValueText);
                    }
                    else if (content is InterpolationSyntax interpolation)
                    {
                        var varName = ExtractVariableName(interpolation.Expression);
                        if (varName != null)
                        {
                            sb.Append('{').Append(varName).Append('}');
                        }
                        else
                        {
                            sb.Append('{').Append(interpolation.Expression.ToString()).Append('}');
                        }
                    }
                }
                return sb.ToString();
            }
        }

        return null;
    }

    private static string? ExtractVariableName(ExpressionSyntax? expr)
    {
        while (expr is ParenthesizedExpressionSyntax paren)
        {
            expr = paren.Expression;
        }

        if (expr is ConditionalExpressionSyntax cond)
        {
            return ExtractVariableName(cond.WhenFalse) ?? ExtractVariableName(cond.WhenTrue);
        }

        if (expr is InvocationExpressionSyntax inv)
        {
            var arg = inv.ArgumentList.Arguments.FirstOrDefault()?.Expression;
            if (StringLiteralValue(arg) is { } name)
            {
                return name;
            }
        }

        return null;
    }


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
