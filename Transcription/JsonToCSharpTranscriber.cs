using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ScriptEditor.Models.Schema;
using static Microsoft.CodeAnalysis.CSharp.SyntaxFactory;

namespace ScriptEditor.Transcription;

/// <summary>
/// Roslyn-based transcription from DiagramDocumentV2 to C# source code.
/// 
/// Generates a compilable derived TopicFlow class matching ConversaCore architecture.
/// For activities requiring lambdas or factories (e.g. PublishHostNotificationActivity,
/// InvokeToolActivity), named factory methods with documentation and NotImplementedException
/// scaffolding are generated directly on the class.
/// For AdaptiveCardActivity, generated models inherit from BaseCardModel which automatically
/// update the TopicWorkflowContext with all form fields upon submission.
/// </summary>
public static class JsonToCSharpTranscriber
{
    private static readonly HashSet<string> VerifiedCompilableTypes =
    [
        "SimpleActivity",
        "EndActivity",
        "DelayActivity",
        "TriggerTopicActivity",
        "AdaptiveCardActivity",
        "PublishHostNotificationActivity",
        "InvokeToolActivity",
        "CompositeActivity",
        "PromptActivity",
        "SetVariableActivity",
        "GlobalVariableActivity",
        "DumpCtxActivity",
        "ResetActivity",
        "SwitchActivity",
        "ParallelActivity",
        "QuickAnswerActivity",
        "ConditionalActivity",
        "RepeatActivity",
        "RepeatLoopActivity",
        "ForEachActivity",
    ];

    public static string Transcribe(DiagramDocumentV2 document, string className = "MainConversation")
    {
        var statements = new List<StatementSyntax>();
        var classMembers = new List<MemberDeclarationSyntax>();
        var auxiliaryTypes = new List<MemberDeclarationSyntax>();
        var generatedAuxiliaryNames = new HashSet<string>();

        bool needsOutputDispatcher = false;
        bool needsSession = false;
        bool needsToolExecutor = false;
        bool needsConversationContext = false;

        var nodeGuards = new Dictionary<string, List<ExpressionSyntax[]>>(StringComparer.Ordinal);
        var routerNodeIds = new HashSet<string>(StringComparer.Ordinal);
        var nodeLoopIds = new Dictionary<string, string>(StringComparer.Ordinal);
        var repeatLoopNodes = new Dictionary<string, List<DiagramNodeV2>>(StringComparer.Ordinal);
        var nestedNodeIds = new HashSet<string>(StringComparer.Ordinal);
        var freeFloatingIds = new HashSet<string>(document.FreeFloatingNodeIds ?? [], StringComparer.Ordinal);

        // Pre-scan all nodes to register exception branch nodes in nestedNodeIds
        // and branching router nodes (ConditionalActivity, SwitchActivity) in nodeGuards
        foreach (var n in document.Nodes)
        {
            var excNodes = FindExceptionBranchNodes(n, document);
            foreach (var excNode in excNodes)
            {
                nestedNodeIds.Add(excNode.Id);
            }

            if (n.Type is "RepeatActivity" or "RepeatLoopActivity" or "ForEachActivity")
            {
                var (loopBodyNodes, _) = FindRepeatLoopBranches(n, document);
                if (loopBodyNodes.Count > 0)
                {
                    var repeatId = n.Name ?? n.Id;
                    foreach (var bn in loopBodyNodes)
                    {
                        nodeLoopIds[bn.Id] = repeatId;
                    }
                    repeatLoopNodes[n.Id] = loopBodyNodes;
                }
            }

            if (n.Type == "ConditionalActivity")
            {
                var (trueB, falseB) = FindConditionalBranches(n, document);
                if (trueB.Count > 0 || falseB.Count > 0)
                {
                    routerNodeIds.Add(n.Id);
                    var (trueGuard, falseGuard) = ResolveBranchGuards(n, document);

                    foreach (var node in trueB)
                    {
                        if (!nodeGuards.TryGetValue(node.Id, out var guards))
                        {
                            guards = [];
                            nodeGuards[node.Id] = guards;
                        }
                        guards.Add(new[] { trueGuard });
                    }

                    foreach (var node in falseB)
                    {
                        if (!nodeGuards.TryGetValue(node.Id, out var guards))
                        {
                            guards = [];
                            nodeGuards[node.Id] = guards;
                        }
                        guards.Add(new[] { falseGuard });
                    }
                }
            }
            else if (n.Type == "SwitchActivity")
            {
                var switchBranches = FindSwitchBranches(n, document);
                if (switchBranches.Any(b => b.Nodes.Count > 0))
                {
                    routerNodeIds.Add(n.Id);
                    var valKey = n.Data?.GetValueOrDefault("valueContextKey", "SwitchKey")?.Trim() ?? "SwitchKey";
                    var declaredCases = (n.Data?.GetValueOrDefault("caseKeys", "") ?? "")
                        .Split(new[] { '|', ',' }, StringSplitOptions.RemoveEmptyEntries)
                        .Select(s => s.Trim())
                        .Where(s => !string.IsNullOrEmpty(s))
                        .ToList();

                    foreach (var branch in switchBranches)
                    {
                        ExpressionSyntax[] guardArgs;
                        if (branch.IsDefault)
                        {
                            var casesArraySyntax = string.Join(", ", declaredCases.Select(c => $"\"{c.Replace("\\", "\\\\").Replace("\"", "\\\"")}\""));
                            ExpressionSyntax guardExpr;
                            if (!string.IsNullOrWhiteSpace(valKey) && !valKey.Equals("LastAnswer", StringComparison.OrdinalIgnoreCase) && !valKey.Equals("_LastAnswer", StringComparison.OrdinalIgnoreCase))
                            {
                                guardExpr = ParseExpression($"ctx => !new[] {{ {casesArraySyntax} }}.Contains((_conversationContext != null && _conversationContext.HasValue(\"{valKey}\") ? _conversationContext.GetValue<object?>(\"{valKey}\", null)?.ToString() : ctx.GetValue<object?>(\"{valKey}\")?.ToString()) ?? \"\", StringComparer.OrdinalIgnoreCase)");
                            }
                            else
                            {
                                guardExpr = ParseExpression($"ctx => !new[] {{ {casesArraySyntax} }}.Contains((_conversationContext != null && _conversationContext.HasValue(TopicWorkflowContext.LastAnswerKey) ? _conversationContext.GetValue<object?>(TopicWorkflowContext.LastAnswerKey, null)?.ToString() : ctx.GetValue<object?>(TopicWorkflowContext.LastAnswerKey)?.ToString()) ?? \"\", StringComparer.OrdinalIgnoreCase)");
                            }
                            guardArgs = new[] { guardExpr };
                        }
                        else
                        {
                            if (!string.IsNullOrWhiteSpace(valKey) && !valKey.Equals("LastAnswer", StringComparison.OrdinalIgnoreCase) && !valKey.Equals("_LastAnswer", StringComparison.OrdinalIgnoreCase))
                            {
                                guardArgs = new ExpressionSyntax[] { StringLiteral(valKey), StringLiteral(branch.CaseKey) };
                            }
                            else
                            {
                                guardArgs = new ExpressionSyntax[] { StringLiteral(branch.CaseKey) };
                            }
                        }

                        foreach (var node in branch.Nodes)
                        {
                            if (!nodeGuards.TryGetValue(node.Id, out var guards))
                            {
                                guards = [];
                                nodeGuards[node.Id] = guards;
                            }
                            guards.Add(guardArgs);
                        }
                    }
                }
            }
        }

        // If FreeFloatingNodeIds is not populated, infer from StartNode if present
        var startNode = document.Nodes.FirstOrDefault(n => n.Type is "StartNode" or "StartActivity");
        if (startNode != null && freeFloatingIds.Count == 0)
        {
            var reachable = new HashSet<string>(StringComparer.Ordinal) { startNode.Id };
            var queue = new Queue<string>();
            queue.Enqueue(startNode.Id);
            var outgoing = document.Edges
                .Where(e => e.From != null && e.To != null && !string.IsNullOrEmpty(e.To.Node))
                .GroupBy(e => e.From.Node, StringComparer.Ordinal)
                .ToDictionary(g => g.Key, g => g.Select(e => e.To.Node).ToList(), StringComparer.Ordinal);

            while (queue.Count > 0)
            {
                var curr = queue.Dequeue();
                if (outgoing.TryGetValue(curr, out var nextList))
                {
                    foreach (var next in nextList)
                    {
                        if (reachable.Add(next))
                        {
                            queue.Enqueue(next);
                        }
                    }
                }
            }

            foreach (var n in document.Nodes)
            {
                if (!reachable.Contains(n.Id))
                {
                    freeFloatingIds.Add(n.Id);
                }
            }
        }

        var sortedNodes = TopologicallySortNodes(document);

        // Group branch nodes together sequentially immediately where the router node was
        if (routerNodeIds.Count > 0 || repeatLoopNodes.Count > 0)
        {
            var ordered = new List<DiagramNodeV2>();
            var processedBranchNodes = new HashSet<string>(StringComparer.Ordinal);

            foreach (var node in sortedNodes)
            {
                if (processedBranchNodes.Contains(node.Id))
                    continue;

                if (routerNodeIds.Contains(node.Id))
                {
                    if (node.Type == "ConditionalActivity")
                    {
                        var (trueB, falseB) = FindConditionalBranches(node, document);
                        foreach (var bn in trueB)
                        {
                            if (processedBranchNodes.Add(bn.Id))
                                ordered.Add(bn);
                        }
                        foreach (var bn in falseB)
                        {
                            if (processedBranchNodes.Add(bn.Id))
                                ordered.Add(bn);
                        }
                    }
                    else if (node.Type == "SwitchActivity")
                    {
                        var switchBranches = FindSwitchBranches(node, document);
                        foreach (var branch in switchBranches)
                        {
                            foreach (var bn in branch.Nodes)
                            {
                                if (processedBranchNodes.Add(bn.Id))
                                    ordered.Add(bn);
                            }
                        }
                    }
                    continue;
                }

                ordered.Add(node);

                if (repeatLoopNodes.TryGetValue(node.Id, out var bodyNodes))
                {
                    foreach (var bn in bodyNodes)
                    {
                        if (processedBranchNodes.Add(bn.Id))
                            ordered.Add(bn);
                    }
                }
            }
            sortedNodes = ordered;
        }

        foreach (var node in sortedNodes)
        {
            if (node.Type is "StartNode" or "StartActivity")
                continue;

            if (freeFloatingIds.Contains(node.Id))
                continue;

            if (routerNodeIds.Contains(node.Id))
                continue;

            var id = node.Name ?? node.Id;
            if (node.Type is "SetVariableActivity" or "GlobalVariableActivity" || (node.Data != null && node.Data.Values.Any(v => System.Text.RegularExpressions.Regex.IsMatch(v, @"\{[a-zA-Z0-9_]+\}"))))
            {
                needsConversationContext = true;
            }

            if (nestedNodeIds.Contains(node.Id))
                continue;

            StatementSyntax statement;
            switch (node.Type)
            {
                case "AdaptiveCardActivity":
                    statement = BuildAdaptiveCardActivity(id, node.Data, auxiliaryTypes, generatedAuxiliaryNames);
                    break;
                case "PublishHostNotificationActivity":
                    needsOutputDispatcher = true;
                    needsSession = true;
                    statement = BuildPublishHostNotificationActivity(id, node.Data, classMembers, auxiliaryTypes, generatedAuxiliaryNames);
                    break;
                case "InvokeToolActivity":
                    needsToolExecutor = true;
                    needsSession = true;
                    statement = BuildInvokeToolActivity(id, node.Data, classMembers, auxiliaryTypes, generatedAuxiliaryNames);
                    break;
                default:
                    statement = BuildAddStatement(node, document, nestedNodeIds);
                    break;
            }

            if (nodeGuards.TryGetValue(node.Id, out var guardArgsList))
            {
                foreach (var guardArgs in guardArgsList)
                {
                    statement = AttachGuard(statement, guardArgs);
                }
            }

            if (nodeLoopIds.TryGetValue(node.Id, out var loopId))
            {
                statement = AttachInLoop(statement, loopId);
            }

            statements.Add(statement);
        }

        var buildWorkflowMethod = MethodDeclaration(PredefinedType(Token(SyntaxKind.VoidKeyword)), "BuildWorkflow")
            .AddModifiers(Token(SyntaxKind.PrivateKeyword))
            .WithBody(Block(statements));

        var members = new List<MemberDeclarationSyntax>
        {
            ParseMemberDeclaration("private readonly ILogger _logger;")!
        };

        if (needsOutputDispatcher)
        {
            members.Add(ParseMemberDeclaration("private readonly IConversationOutputDispatcher? _outputDispatcher;")!);
        }
        if (needsSession)
        {
            members.Add(ParseMemberDeclaration("private readonly IConversationSession? _conversationSession;")!);
        }
        if (needsToolExecutor)
        {
            members.Add(ParseMemberDeclaration("private readonly IToolExecutor? _toolExecutor;")!);
        }
        if (needsConversationContext)
        {
            members.Add(ParseMemberDeclaration("private readonly IConversationContext _conversationContext;")!);
        }

        var constructorParams = new List<ParameterSyntax>
        {
            Parameter(Identifier("context")).WithType(IdentifierName("TopicWorkflowContext")),
            Parameter(Identifier("logger")).WithType(IdentifierName("ILogger")),
        };

        var constructorAssignments = new List<StatementSyntax>
        {
            ParseStatement("_logger = logger;"),
        };
        if (needsOutputDispatcher)
        {
            constructorParams.Add(Parameter(Identifier("outputDispatcher"))
                .WithType(NullableType(IdentifierName("IConversationOutputDispatcher")))
                .WithDefault(EqualsValueClause(LiteralExpression(SyntaxKind.NullLiteralExpression))));
            constructorAssignments.Add(ParseStatement("_outputDispatcher = outputDispatcher;"));
        }
        if (needsSession)
        {
            constructorParams.Add(Parameter(Identifier("conversationSession"))
                .WithType(NullableType(IdentifierName("IConversationSession")))
                .WithDefault(EqualsValueClause(LiteralExpression(SyntaxKind.NullLiteralExpression))));
            constructorAssignments.Add(ParseStatement("_conversationSession = conversationSession;"));
        }
        if (needsToolExecutor)
        {
            constructorParams.Add(Parameter(Identifier("toolExecutor"))
                .WithType(NullableType(IdentifierName("IToolExecutor")))
                .WithDefault(EqualsValueClause(LiteralExpression(SyntaxKind.NullLiteralExpression))));
            constructorAssignments.Add(ParseStatement("_toolExecutor = toolExecutor;"));
        }
        if (needsConversationContext)
        {
            constructorParams.Add(Parameter(Identifier("conversationContext"))
                .WithType(NullableType(IdentifierName("IConversationContext")))
                .WithDefault(EqualsValueClause(LiteralExpression(SyntaxKind.NullLiteralExpression))));
            constructorAssignments.Add(ParseStatement("_conversationContext = conversationContext ?? new ConversationContext(Guid.NewGuid().ToString(), \"user\");"));
        }

        constructorAssignments.Add(ExpressionStatement(InvocationExpression(IdentifierName("BuildWorkflow"))));

        var baseCall = ConstructorInitializer(SyntaxKind.BaseConstructorInitializer)
            .WithArgumentList(ArgumentList(SeparatedList(new[]
            {
                Argument(IdentifierName("context")),
                Argument(IdentifierName("logger")),
                Argument(StringLiteral(className)),
            })));

        var constructor = ConstructorDeclaration(className)
            .AddModifiers(Token(SyntaxKind.PublicKeyword))
            .WithParameterList(ParameterList(SeparatedList(constructorParams)))
            .WithInitializer(baseCall)
            .WithBody(Block(constructorAssignments));

        members.Add(constructor);
        members.Add(buildWorkflowMethod);
        members.AddRange(classMembers);

        var classDeclaration = ClassDeclaration(className)
            .AddModifiers(Token(SyntaxKind.PublicKeyword), Token(SyntaxKind.PartialKeyword))
            .AddBaseListTypes(SimpleBaseType(IdentifierName("TopicFlow")))
            .WithMembers(List(members));

        var compilationUnit = CompilationUnit()
            .AddMembers(classDeclaration)
            .AddMembers(auxiliaryTypes.ToArray());

        return compilationUnit.NormalizeWhitespace().ToFullString().TrimEnd() + "\n";
    }

    private static StatementSyntax BuildAddStatement(DiagramNodeV2 node, DiagramDocumentV2 document, HashSet<string> nestedNodeIds)
    {
        ExpressionSyntax objectCreation = BuildActivityExpression(node, document, nestedNodeIds);

        var addInvocation = InvocationExpression(IdentifierName("Add"))
            .WithArgumentList(ArgumentList(SingletonSeparatedList(Argument(objectCreation))));

        StatementSyntax statement = ExpressionStatement(addInvocation);

        if (node.Type == "ParallelActivity" && node.Data.TryGetValue("branches", out var branchesVal) && !string.IsNullOrWhiteSpace(branchesVal))
        {
            statement = statement.WithLeadingTrivia(
                Comment($"// branches: {branchesVal}"),
                LineFeed);
        }
        else if (!VerifiedCompilableTypes.Contains(node.Type))
        {
            statement = statement.WithLeadingTrivia(
                Comment($"// best-effort: {node.Type}'s real constructor/properties aren't modeled yet, this may not compile"),
                LineFeed);
        }

        return statement;
    }

    private static StatementSyntax AttachGuard(StatementSyntax statement, params ExpressionSyntax[] guardArgs)
    {
        if (guardArgs.Length == 0) return statement;

        if (statement is ExpressionStatementSyntax exprStmt &&
            exprStmt.Expression is InvocationExpressionSyntax inv)
        {
            var whenInvocation = InvocationExpression(
                MemberAccessExpression(
                    SyntaxKind.SimpleMemberAccessExpression,
                    inv,
                    IdentifierName("When")))
                .WithArgumentList(ArgumentList(SeparatedList(guardArgs.Select(Argument))));

            return exprStmt.WithExpression(whenInvocation);
        }

        return statement;
    }

    private static StatementSyntax AttachInLoop(StatementSyntax statement, string loopId)
    {
        if (string.IsNullOrEmpty(loopId)) return statement;

        if (statement is ExpressionStatementSyntax exprStmt &&
            exprStmt.Expression is InvocationExpressionSyntax inv)
        {
            var inLoopInvocation = InvocationExpression(
                MemberAccessExpression(
                    SyntaxKind.SimpleMemberAccessExpression,
                    inv,
                    IdentifierName("InLoop")))
                .WithArgumentList(ArgumentList(SingletonSeparatedList(Argument(LiteralExpression(SyntaxKind.StringLiteralExpression, Literal(loopId))))));

            return exprStmt.WithExpression(inLoopInvocation);
        }

        return statement;
    }

    private static ExpressionSyntax BuildActivityExpression(DiagramNodeV2 node, DiagramDocumentV2 document, HashSet<string> nestedNodeIds)
    {
        var id = node.Name ?? node.Id;

        ExpressionSyntax objectCreation = node.Type switch
        {
            "SimpleActivity" => BuildSimpleActivity(id, node.Data),
            "EndActivity" => BuildEndActivity(id, node.Data),
            "DelayActivity" => BuildDelayActivity(id, node.Data),
            "TriggerTopicActivity" => BuildTriggerTopicActivity(id, node.Data),
            "CompositeActivity" => BuildCompositeActivity(id, node.Data),
            "PromptActivity" => BuildPromptActivity(id, node.Data),
            "QuickAnswerActivity" => BuildQuickAnswerActivity(id, node.Data),
            "SetVariableActivity" => BuildSetVariableActivity(id, node.Data),
            "GlobalVariableActivity" => BuildGlobalVariableActivity(id, node.Data),
            "DumpCtxActivity" => BuildDumpCtxActivity(id, node.Data),
            "ResetActivity" => BuildResetActivity(id, node.Data),
            "SwitchActivity" => BuildSwitchActivity(id, node.Data),
            "ConditionalActivity" => BuildConditionalActivity(node, document, nestedNodeIds),
            "ParallelActivity" => BuildParallelActivity(node, document, nestedNodeIds),
            "RepeatActivity" or "RepeatLoopActivity" or "ForEachActivity" => BuildRepeatLoopActivity(node),
            _ => BuildGenericFallback(node.Type, id, node.Data),
        };

        return AttachExceptionHandling(node, objectCreation, document, nestedNodeIds);
    }

    private static ExpressionSyntax AttachExceptionHandling(
        DiagramNodeV2 node,
        ExpressionSyntax objectCreation,
        DiagramDocumentV2 document,
        HashSet<string> nestedNodeIds)
    {
        var excBranch = FindExceptionBranchNodes(node, document);
        if (excBranch.Count == 0)
            return objectCreation;

        ExpressionSyntax excHandlerExpr;
        if (excBranch.Count == 1)
        {
            var singleChild = excBranch[0];
            nestedNodeIds.Add(singleChild.Id);
            excHandlerExpr = BuildActivityExpression(singleChild, document, nestedNodeIds);
        }
        else
        {
            var childExprs = new List<ExpressionSyntax>();
            foreach (var child in excBranch)
            {
                nestedNodeIds.Add(child.Id);
                childExprs.Add(BuildActivityExpression(child, document, nestedNodeIds));
            }

            var compositeId = $"{node.Name ?? node.Id}_ExceptionFlow";
            var arrayCreation = ArrayCreationExpression(
                ArrayType(IdentifierName("TopicFlowActivity"))
                    .WithRankSpecifiers(SingletonList(ArrayRankSpecifier(SingletonSeparatedList<ExpressionSyntax>(OmittedArraySizeExpression())))))
                .WithInitializer(InitializerExpression(SyntaxKind.ArrayInitializerExpression, SeparatedList(childExprs)));

            var compositeArgs = new List<ArgumentSyntax>
            {
                Argument(StringLiteral(compositeId)),
                Argument(arrayCreation)
            };

            excHandlerExpr = ObjectCreationExpression(IdentifierName("CompositeActivity"))
                .WithArgumentList(ArgumentList(SeparatedList(compositeArgs)));
        }

        var assignment = AssignmentExpression(
            SyntaxKind.SimpleAssignmentExpression,
            IdentifierName("OnExceptionActivity"),
            excHandlerExpr);

        if (objectCreation is ObjectCreationExpressionSyntax creationExpr)
        {
            if (creationExpr.Initializer == null)
            {
                return creationExpr.WithInitializer(
                    InitializerExpression(SyntaxKind.ObjectInitializerExpression, SingletonSeparatedList<ExpressionSyntax>(assignment)));
            }
            else
            {
                var existing = creationExpr.Initializer.Expressions.ToList();
                existing.Add(assignment);
                return creationExpr.WithInitializer(
                    InitializerExpression(SyntaxKind.ObjectInitializerExpression, SeparatedList(existing)));
            }
        }

        return objectCreation;
    }

    private static List<DiagramNodeV2> FindExceptionBranchNodes(DiagramNodeV2 node, DiagramDocumentV2 document)
    {
        var branch = new List<DiagramNodeV2>();
        if (document.Edges == null || document.Edges.Count == 0)
            return branch;

        var nodeById = document.Nodes.ToDictionary(n => n.Id, StringComparer.Ordinal);

        var excEdge = document.Edges.FirstOrDefault(e =>
            e.From != null && e.From.Node == node.Id && e.To != null && !string.IsNullOrEmpty(e.To.Node) &&
            IsExceptionPort(node, e.From.Port));

        if (excEdge == null || !nodeById.TryGetValue(excEdge.To.Node, out var current))
            return branch;

        var visited = new HashSet<string>(StringComparer.Ordinal);
        while (current != null && visited.Add(current.Id))
        {
            branch.Add(current);
            if (current.Type == "EndActivity")
                break;

            var nextEdge = document.Edges.FirstOrDefault(e =>
                e.From != null && e.From.Node == current.Id && e.To != null && !string.IsNullOrEmpty(e.To.Node) &&
                !IsExceptionPort(current, e.From.Port));

            current = (nextEdge != null && nodeById.TryGetValue(nextEdge.To.Node, out var nextNode))
                ? nextNode
                : null;
        }

        return branch;
    }

    private static bool IsExceptionPort(DiagramNodeV2 node, string? portId)
    {
        if (string.IsNullOrEmpty(portId)) return false;
        var port = node.Ports.FirstOrDefault(p => p.Id == portId);
        if (port != null && port.Role == DiagramPortRoleV2.Exception)
            return true;
        return portId.EndsWith("-exc", StringComparison.OrdinalIgnoreCase) ||
               portId.Contains("exception", StringComparison.OrdinalIgnoreCase);
    }

    private static StatementSyntax BuildAdaptiveCardActivity(
        string id,
        Dictionary<string, string> data,
        List<MemberDeclarationSyntax> auxiliaryTypes,
        HashSet<string> generatedAuxiliaryNames)
    {
        var sanitized = SanitizeIdentifier(id);
        var cardType = data.GetValueOrDefault("cardType", $"{sanitized}Card");
        var modelType = data.GetValueOrDefault("modelType", $"{sanitized}Model");
        var submissionKey = data.GetValueOrDefault("submissionContextKey", $"{sanitized.ToLowerInvariant()}_submission");
        var isRequired = data.TryGetValue("required", out var req) && req == "true";

        var lambda = SimpleLambdaExpression(
            Parameter(Identifier("c")),
            InvocationExpression(MemberAccessExpression(SyntaxKind.SimpleMemberAccessExpression, IdentifierName("c"), IdentifierName("Create"))));

        var args = new List<ArgumentSyntax>
        {
            Argument(StringLiteral(id)),
            Argument(IdentifierName("Context")),
            Argument(lambda).WithNameColon(NameColon("cardFactory")),
            Argument(StringLiteral(submissionKey)).WithNameColon(NameColon("modelContextKey")),
        };

        var genericType = GenericName(Identifier("AdaptiveCardActivity"))
            .WithTypeArgumentList(TypeArgumentList(SeparatedList<TypeSyntax>(new[]
            {
                IdentifierName(cardType),
                IdentifierName(modelType),
            })));

        var creation = ObjectCreationExpression(genericType)
            .WithArgumentList(ArgumentList(SeparatedList(args)))
            .WithInitializer(InitializerExpression(
                SyntaxKind.ObjectInitializerExpression,
                SingletonSeparatedList<ExpressionSyntax>(
                    AssignmentExpression(
                        SyntaxKind.SimpleAssignmentExpression,
                        IdentifierName("IsRequired"),
                        isRequired ? LiteralExpression(SyntaxKind.TrueLiteralExpression) : LiteralExpression(SyntaxKind.FalseLiteralExpression)))));

        var statement = ExpressionStatement(InvocationExpression(IdentifierName("Add"))
            .WithArgumentList(ArgumentList(SingletonSeparatedList(Argument(creation)))));

        var cardFieldsRaw = data.GetValueOrDefault("cardFields");
        var (fields, cardJson) = ParseCardFieldsData(cardFieldsRaw, id);

        if (generatedAuxiliaryNames.Add(cardType))
        {
            var escapedJson = SymbolDisplay.FormatLiteral(cardJson, true);
            var cardCode = $$"""
            /// <summary>
            /// Adaptive card definition for <c>{{id}}</c>.
            /// </summary>
            public class {{cardType}}
            {
                public string Create() => {{escapedJson}};
            }
            """;
            auxiliaryTypes.Add(ParseMemberDeclaration(cardCode)!);
        }

        if (generatedAuxiliaryNames.Add(modelType))
        {
            var propsCode = GenerateModelProperties(fields);
            var modelCode = $$"""
            /// <summary>
            /// Form model for <c>{{id}}</c>.
            /// Inherits from <see cref="BaseCardModel"/> which automatically updates
            /// <see cref="TopicWorkflowContext"/> with all model fields via <c>UpdateContext</c>.
            /// </summary>
            public class {{modelType}} : BaseCardModel
            {
            {{propsCode}}
            }
            """;
            auxiliaryTypes.Add(ParseMemberDeclaration(modelCode)!);
        }

        return statement;
    }

    private static StatementSyntax BuildPublishHostNotificationActivity(
        string id,
        Dictionary<string, string> data,
        List<MemberDeclarationSyntax> classMembers,
        List<MemberDeclarationSyntax> auxiliaryTypes,
        HashSet<string> generatedAuxiliaryNames)
    {
        var sanitized = SanitizeIdentifier(id);
        var eventName = data.GetValueOrDefault("eventName", sanitized.ToLowerInvariant());
        var payloadType = data.GetValueOrDefault("payloadType", $"{sanitized}Payload");
        var methodName = $"Create{sanitized}Payload";

        var genericType = GenericName(Identifier("PublishHostNotificationActivity"))
            .WithTypeArgumentList(TypeArgumentList(SingletonSeparatedList<TypeSyntax>(IdentifierName(payloadType))));

        var args = new[]
        {
            Argument(StringLiteral(id)),
            Argument(StringLiteral(eventName)),
            Argument(LiteralExpression(SyntaxKind.NumericLiteralExpression, Literal(1))),
            Argument(IdentifierName(methodName)),
            Argument(PostfixUnaryExpression(SyntaxKind.SuppressNullableWarningExpression, IdentifierName("_outputDispatcher"))),
            Argument(PostfixUnaryExpression(SyntaxKind.SuppressNullableWarningExpression, IdentifierName("_conversationSession"))),
        };

        var creation = ObjectCreationExpression(genericType)
            .WithArgumentList(ArgumentList(SeparatedList(args)));

        var statement = ExpressionStatement(InvocationExpression(IdentifierName("Add"))
            .WithArgumentList(ArgumentList(SingletonSeparatedList(Argument(creation)))));

        var methodCode = $$"""
        /// <summary>
        /// Constructs the notification payload for <c>{{id}}</c>.
        /// Extract necessary data from <paramref name="context"/> and return the initialized payload instance.
        /// </summary>
        /// <param name="context">The active topic workflow context.</param>
        /// <returns>An instance of <see cref="{{payloadType}}"/>.</returns>
        private {{payloadType}} {{methodName}}(TopicWorkflowContext context)
        {
            // TODO: Populate payload from context
            // Example:
            // var val = context.GetValue<string>("my_key");
            // return new {{payloadType}}(val);
            throw new NotImplementedException("Provide payload factory logic for {{id}}");
        }
        """;
        classMembers.Add(ParseMemberDeclaration(methodCode)!);

        if (generatedAuxiliaryNames.Add(payloadType))
        {
            var payloadCode = $$"""
            public class {{payloadType}}
            {
            }
            """;
            auxiliaryTypes.Add(ParseMemberDeclaration(payloadCode)!);
        }

        return statement;
    }

    private static StatementSyntax BuildInvokeToolActivity(
        string id,
        Dictionary<string, string> data,
        List<MemberDeclarationSyntax> classMembers,
        List<MemberDeclarationSyntax> auxiliaryTypes,
        HashSet<string> generatedAuxiliaryNames)
    {
        var sanitized = SanitizeIdentifier(id);
        var toolId = data.GetValueOrDefault("toolId", $"{sanitized}Tool");
        var toolType = data.GetValueOrDefault("toolType", $"{sanitized}Tool");
        var requestType = data.GetValueOrDefault("requestType", $"{sanitized}Request");
        var resultType = data.GetValueOrDefault("resultType", $"{sanitized}Result");
        var resultContextKey = data.GetValueOrDefault("resultContextKey", $"{sanitized.ToLowerInvariant()}_result");

        var requestMethod = $"Create{sanitized}Request";
        var contextMethod = $"Create{sanitized}ExecutionContext";

        var genericType = GenericName(Identifier("InvokeToolActivity"))
            .WithTypeArgumentList(TypeArgumentList(SeparatedList<TypeSyntax>(new[]
            {
                IdentifierName(toolType),
                IdentifierName(requestType),
                IdentifierName(resultType),
            })));

        var args = new[]
        {
            Argument(StringLiteral(id)),
            Argument(StringLiteral(toolId)),
            Argument(PostfixUnaryExpression(SyntaxKind.SuppressNullableWarningExpression, IdentifierName("_toolExecutor"))),
            Argument(IdentifierName(requestMethod)),
            Argument(IdentifierName(contextMethod)),
            Argument(StringLiteral(resultContextKey)),
        };

        var creation = ObjectCreationExpression(genericType)
            .WithArgumentList(ArgumentList(SeparatedList(args)));

        var statement = ExpressionStatement(InvocationExpression(IdentifierName("Add"))
            .WithArgumentList(ArgumentList(SingletonSeparatedList(Argument(creation)))));

        var reqMethodCode = $$"""
        /// <summary>
        /// Creates the request payload for the <c>{{id}}</c> tool invocation.
        /// Extract necessary arguments from <paramref name="context"/>.
        /// </summary>
        /// <param name="context">The active topic workflow context.</param>
        /// <returns>An instance of <see cref="{{requestType}}"/>.</returns>
        private {{requestType}} {{requestMethod}}(TopicWorkflowContext context)
        {
            // TODO: Construct and return {{requestType}} using context data
            throw new NotImplementedException("Provide request factory logic for {{id}}");
        }
        """;
        classMembers.Add(ParseMemberDeclaration(reqMethodCode)!);

        var ctxMethodCode = $$"""
        /// <summary>
        /// Creates the tool execution context for <c>{{id}}</c>.
        /// </summary>
        /// <param name="context">The active topic workflow context.</param>
        /// <returns>An instance of <see cref="ToolExecutionContext"/>.</returns>
        private ToolExecutionContext {{contextMethod}}(TopicWorkflowContext context)
        {
            return new ToolExecutionContext
            {
                ConversationId = _conversationSession?.ConversationId ?? "default-conversation",
                Subject = _conversationSession?.Subject ?? "system",
                CorrelationId = Guid.NewGuid().ToString("N"),
                Services = null!,
                AllowedToolIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "{{toolId}}" }
            };
        }
        """;
        classMembers.Add(ParseMemberDeclaration(ctxMethodCode)!);

        if (generatedAuxiliaryNames.Add(requestType))
        {
            auxiliaryTypes.Add(ParseMemberDeclaration($"public class {requestType} {{ }}")!);
        }

        if (generatedAuxiliaryNames.Add(resultType))
        {
            auxiliaryTypes.Add(ParseMemberDeclaration($"public class {resultType} {{ }}")!);
        }

        if (generatedAuxiliaryNames.Add(toolType))
        {
            var toolCode = $$"""
            public class {{toolType}} : IConversaTool<{{requestType}}, {{resultType}}>
            {
                public ToolDescriptor Descriptor => new("{{toolId}}", "1.0", "{{toolId}}", "Scaffolded tool descriptor", typeof({{requestType}}), typeof({{resultType}}));

                public ValueTask<ToolResult<{{resultType}}>> ExecuteAsync(
                    {{requestType}} request,
                    ToolExecutionContext context,
                    CancellationToken cancellationToken = default)
                {
                    throw new NotImplementedException("Provide tool execution logic for {{toolId}}");
                }
            }
            """;
            auxiliaryTypes.Add(ParseMemberDeclaration(toolCode)!);
        }

        return statement;
    }

    private static string SanitizeIdentifier(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "Activity";
        var sb = new StringBuilder();
        bool capitalizeNext = true;
        foreach (var c in name)
        {
            if (char.IsLetterOrDigit(c))
            {
                sb.Append(capitalizeNext ? char.ToUpperInvariant(c) : c);
                capitalizeNext = false;
            }
            else
            {
                capitalizeNext = true;
            }
        }
        var result = sb.ToString();
        if (result.Length == 0 || !char.IsLetter(result[0]))
        {
            result = "A" + result;
        }
        return result;
    }

    private static ExpressionSyntax BuildSimpleActivity(string id, Dictionary<string, string> data)
    {
        var message = data.GetValueOrDefault("message", "");
        var varMatches = System.Text.RegularExpressions.Regex.Matches(message, @"\{([a-zA-Z0-9_]+)\}");
        if (varMatches.Count == 0)
        {
            return ObjectCreationExpression(IdentifierName("SimpleActivity"))
                .WithArgumentList(ArgumentList(SeparatedList(new[]
                {
                    Argument(StringLiteral(id)),
                    Argument(StringLiteral(message)),
                })));
        }

        var sb = new StringBuilder("$\"");
        int lastIndex = 0;
        foreach (System.Text.RegularExpressions.Match match in varMatches)
        {
            var textBefore = message.Substring(lastIndex, match.Index - lastIndex);
            sb.Append(EscapeInterpolatedContent(textBefore));
            var varName = match.Groups[1].Value;
            sb.Append("{(_conversationContext != null && _conversationContext.HasValue(\"")
              .Append(varName)
              .Append("\") ? _conversationContext.GetValue<object?>(\"")
              .Append(varName)
              .Append("\", null) : ctx.GetValue<object?>(\"")
              .Append(varName)
              .Append("\"))}");
            lastIndex = match.Index + match.Length;

        }
        var textAfter = message.Substring(lastIndex);
        sb.Append(EscapeInterpolatedContent(textAfter));
        sb.Append('"');

        var lambdaCode = $"async (ctx, _) => (object?){sb}";
        var lambdaExpr = ParseExpression(lambdaCode);

        return ObjectCreationExpression(IdentifierName("SimpleActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(new[]
            {
                Argument(StringLiteral(id)),
                Argument(lambdaExpr),
            })));
    }

    private static string EscapeInterpolatedContent(string text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        return text
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("{", "{{")
            .Replace("}", "}}")
            .Replace("\r", "\\r")
            .Replace("\n", "\\n");
    }

    private static ExpressionSyntax BuildEndActivity(string id, Dictionary<string, string> data)
    {
        var args = new List<ArgumentSyntax> { Argument(StringLiteral(id)) };
        if (data.TryGetValue("endMessage", out var message) && !string.IsNullOrEmpty(message))
        {
            args.Add(Argument(StringLiteral(message)));
        }
        return ObjectCreationExpression(IdentifierName("EndActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(args)));
    }

    private static ExpressionSyntax BuildDelayActivity(string id, Dictionary<string, string> data)
    {
        var milliseconds = data.TryGetValue("durationMs", out var raw) && double.TryParse(raw, out var parsed) ? parsed : 1000.0;

        var timeSpanCall = InvocationExpression(
                MemberAccessExpression(SyntaxKind.SimpleMemberAccessExpression, IdentifierName("TimeSpan"), IdentifierName("FromMilliseconds")))
            .WithArgumentList(ArgumentList(SingletonSeparatedList(
                Argument(LiteralExpression(SyntaxKind.NumericLiteralExpression, Literal(milliseconds))))));

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

    private static ExpressionSyntax BuildTriggerTopicActivity(string id, Dictionary<string, string> data)
    {
        var topic = data.GetValueOrDefault("topicToTrigger", "");
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

    private static ExpressionSyntax BuildPromptActivity(string id, Dictionary<string, string> data)
    {
        var kernelExpr = ObjectCreationExpression(IdentifierName("Kernel"))
            .WithArgumentList(ArgumentList());

        var args = new[]
        {
            Argument(StringLiteral(id)),
            Argument(kernelExpr),
            Argument(IdentifierName("_logger")),
        };

        var initializers = new List<ExpressionSyntax>();

        var systemPrompt = data.GetValueOrDefault("systemPrompt");
        if (!string.IsNullOrWhiteSpace(systemPrompt))
        {
            initializers.Add(AssignmentExpression(
                SyntaxKind.SimpleAssignmentExpression,
                IdentifierName("SystemPrompt"),
                StringLiteral(systemPrompt)));
        }

        var userPrompt = data.GetValueOrDefault("userPromptTemplate") ?? data.GetValueOrDefault("message");
        if (!string.IsNullOrWhiteSpace(userPrompt))
        {
            initializers.Add(AssignmentExpression(
                SyntaxKind.SimpleAssignmentExpression,
                IdentifierName("UserPromptTemplate"),
                StringLiteral(userPrompt)));
        }

        if (data.TryGetValue("temperature", out var tempStr) && float.TryParse(tempStr, System.Globalization.CultureInfo.InvariantCulture, out var tempVal))
        {
            initializers.Add(AssignmentExpression(
                SyntaxKind.SimpleAssignmentExpression,
                IdentifierName("Temperature"),
                LiteralExpression(SyntaxKind.NumericLiteralExpression, Literal(tempVal))));
        }

        var creation = ObjectCreationExpression(IdentifierName("PromptActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(args)));

        if (initializers.Count > 0)
        {
            creation = creation.WithInitializer(
                InitializerExpression(SyntaxKind.ObjectInitializerExpression, SeparatedList(initializers)));
        }

        return creation;
    }

    private static ExpressionSyntax BuildQuickAnswerActivity(string id, Dictionary<string, string> data)
    {
        var question = data.GetValueOrDefault("question", "Please select an option:");
        var isRequired = data.TryGetValue("required", out var req) && req == "true";
        var optionsMode = data.GetValueOrDefault("optionsMode", "static");
        var answersVariable = data.GetValueOrDefault("answersVariable", "");
        var outputVariable = data.GetValueOrDefault("outputVariable", "");

        var isVariableMode = optionsMode == "variable" || (!string.IsNullOrWhiteSpace(answersVariable) && optionsMode != "static");

        var args = new List<ArgumentSyntax>
        {
            Argument(StringLiteral(id)),
            Argument(StringLiteral(question)),
        };

        if (isVariableMode)
        {
            args.Add(Argument(StringLiteral(answersVariable)));
        }
        else
        {
            var rawAnswers = data.GetValueOrDefault("answers", "");
            var answerList = rawAnswers
                .Split(new[] { '|', '\n', ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(a => a.Trim())
                .Where(a => !string.IsNullOrEmpty(a))
                .ToList();

            if (answerList.Count == 0)
            {
                answerList.Add("Option 1");
                answerList.Add("Option 2");
            }

            var arrayExpressions = answerList.Select(StringLiteral).ToArray();
            var arrayCreation = ArrayCreationExpression(
                ArrayType(PredefinedType(Token(SyntaxKind.StringKeyword)), SingletonList(ArrayRankSpecifier())),
                InitializerExpression(SyntaxKind.ArrayInitializerExpression, SeparatedList<ExpressionSyntax>(arrayExpressions)));

            args.Add(Argument(arrayCreation));
        }

        args.Add(Argument(IdentifierName("Context")));
        args.Add(Argument(LiteralExpression(SyntaxKind.NullLiteralExpression)).WithNameColon(NameColon("logger")));
        args.Add(Argument(isRequired ? LiteralExpression(SyntaxKind.TrueLiteralExpression) : LiteralExpression(SyntaxKind.FalseLiteralExpression)).WithNameColon(NameColon("isRequired")));

        if (!string.IsNullOrWhiteSpace(outputVariable))
        {
            args.Add(Argument(StringLiteral(outputVariable)).WithNameColon(NameColon("outputVariable")));
        }

        return ObjectCreationExpression(IdentifierName("QuickAnswerActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(args)));
    }

    private static ExpressionSyntax BuildCompositeActivity(string id, Dictionary<string, string> data)
    {
        var childCreations = new List<ExpressionSyntax>();

        if (data.TryGetValue("steps", out var stepsJson) && !string.IsNullOrWhiteSpace(stepsJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(stepsJson);
                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in doc.RootElement.EnumerateArray())
                    {
                        var stepType = item.TryGetProperty("type", out var t) ? t.GetString() ?? "SimpleActivity" : "SimpleActivity";
                        var stepName = item.TryGetProperty("name", out var n) ? n.GetString() ?? $"{id}_Step" : $"{id}_Step";
                        var stepData = new Dictionary<string, string>();
                        if (item.TryGetProperty("data", out var d) && d.ValueKind == JsonValueKind.Object)
                        {
                            foreach (var prop in d.EnumerateObject())
                            {
                                stepData[prop.Name] = prop.Value.GetString() ?? prop.Value.ToString();
                            }
                        }

                        ExpressionSyntax stepCreation = stepType switch
                        {
                            "SimpleActivity" => BuildSimpleActivity(stepName, stepData),
                            "DelayActivity" => BuildDelayActivity(stepName, stepData),
                            "EndActivity" => BuildEndActivity(stepName, stepData),
                            "TriggerTopicActivity" => BuildTriggerTopicActivity(stepName, stepData),
                            "PromptActivity" => BuildPromptActivity(stepName, stepData),
                            _ => BuildGenericFallback(stepType, stepName, stepData),
                        };
                        childCreations.Add(stepCreation);
                    }
                }
            }
            catch
            {
                // ignore parsing errors and fall back to default step
            }
        }

        if (childCreations.Count == 0)
        {
            childCreations.Add(BuildSimpleActivity($"{id}_Step1", new Dictionary<string, string> { ["message"] = "Composite step 1" }));
        }

        var arrayType = ArrayType(IdentifierName("TopicFlowActivity"))
            .WithRankSpecifiers(SingletonList(ArrayRankSpecifier(SingletonSeparatedList<ExpressionSyntax>(OmittedArraySizeExpression()))));

        var arrayInitializer = InitializerExpression(
            SyntaxKind.ArrayInitializerExpression,
            SeparatedList(childCreations));

        var arrayCreation = ArrayCreationExpression(arrayType, arrayInitializer);

        var args = new[]
        {
            Argument(StringLiteral(id)),
            Argument(arrayCreation),
        };

        var initializers = new List<ExpressionSyntax>();

        if (data.TryGetValue("isolateContext", out var isolateVal) && isolateVal.Equals("true", StringComparison.OrdinalIgnoreCase))
        {
            initializers.Add(AssignmentExpression(
                SyntaxKind.SimpleAssignmentExpression,
                IdentifierName("IsolateContext"),
                LiteralExpression(SyntaxKind.TrueLiteralExpression)));
        }

        if (data.TryGetValue("completeMessage", out var msgVal) && !string.IsNullOrWhiteSpace(msgVal))
        {
            initializers.Add(AssignmentExpression(
                SyntaxKind.SimpleAssignmentExpression,
                IdentifierName("CompleteMessage"),
                StringLiteral(msgVal)));
        }

        var creation = ObjectCreationExpression(IdentifierName("CompositeActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(args)));

        if (initializers.Count > 0)
        {
            creation = creation.WithInitializer(
                InitializerExpression(SyntaxKind.ObjectInitializerExpression, SeparatedList(initializers)));
        }

        return creation;
    }

    private static ExpressionSyntax BuildSetVariableActivity(string id, Dictionary<string, string> data)
    {
        var variableName = data.GetValueOrDefault("variableName", "Global_Example");
        var value = data.GetValueOrDefault("value", "");
        var isGlobal = !data.TryGetValue("isGlobal", out var isGlobStr) || isGlobStr.Equals("true", StringComparison.OrdinalIgnoreCase);
        var validateNaming = !data.TryGetValue("validateNaming", out var valNamStr) || valNamStr.Equals("true", StringComparison.OrdinalIgnoreCase);

        var nullLoggerExpr = MemberAccessExpression(
            SyntaxKind.SimpleMemberAccessExpression,
            GenericName(Identifier("NullLogger"))
                .WithTypeArgumentList(TypeArgumentList(SingletonSeparatedList<TypeSyntax>(IdentifierName("SetVariableActivity")))),
            IdentifierName("Instance"));

        ExpressionSyntax valueExpr;
        var trimmed = value.Trim();

        // If the user typed an assignment in the value box (e.g. "{count} = {count} + 1" or "count = {count} + 1"), strip the left side
        var assignMatch = System.Text.RegularExpressions.Regex.Match(trimmed, @"^\{?[a-zA-Z0-9_]+\}?\s*=\s*(.+)$");
        if (assignMatch.Success && !trimmed.Contains("=="))
        {
            trimmed = assignMatch.Groups[1].Value.Trim();
        }

        var varMatches = System.Text.RegularExpressions.Regex.Matches(trimmed, @"\{([a-zA-Z0-9_]+)\}");

        // 1. Range syntax: e.g. 1..5, 0..10, {start}..{end}, 1..{count}
        var rangeMatch = System.Text.RegularExpressions.Regex.Match(trimmed, @"^(?<start>\d+|\{[a-zA-Z0-9_]+\})\s*\.\.\s*(?<end>\d+|\{[a-zA-Z0-9_]+\})$");
        if (rangeMatch.Success)
        {
            var startRaw = rangeMatch.Groups["start"].Value;
            var endRaw = rangeMatch.Groups["end"].Value;

            string BuildIntOperand(string raw)
            {
                if (raw.StartsWith("{") && raw.EndsWith("}"))
                {
                    var v = raw.Substring(1, raw.Length - 2);
                    return $"System.Convert.ToInt32(_conversationContext != null && _conversationContext.HasValue(\"{v}\") ? _conversationContext.GetValue<object?>(\"{v}\", null) : ctx.GetValue<object?>(\"{v}\"))";
                }
                return raw;
            }

            var startExprCode = BuildIntOperand(startRaw);
            var endExprCode = BuildIntOperand(endRaw);
            var lambdaCode = $"ctx => (object?)((Func<int, int, System.Collections.Generic.List<object?>>)((s, e) => System.Linq.Enumerable.Range(s, System.Math.Max(0, e - s + 1)).Cast<object?>().ToList()))({startExprCode}, {endExprCode})";
            valueExpr = ParseExpression(lambdaCode);
        }
        // 2. Bracketed list literal: e.g. ["apple", "banana", "cherry"], [1, 2, 3], ["item", {count}, 42]
        else if (trimmed.StartsWith("[") && trimmed.EndsWith("]"))
        {
            var inner = trimmed.Substring(1, trimmed.Length - 2).Trim();
            if (string.IsNullOrWhiteSpace(inner))
            {
                valueExpr = ParseExpression("ctx => (object?)new System.Collections.Generic.List<object?>()");
            }
            else
            {
                var items = SplitListElements(inner);
                var itemExprs = new List<string>();
                foreach (var item in items)
                {
                    var it = item.Trim();
                    if (it.StartsWith("{") && it.EndsWith("}"))
                    {
                        var v = it.Substring(1, it.Length - 2);
                        itemExprs.Add($"(_conversationContext != null && _conversationContext.HasValue(\"{v}\") ? _conversationContext.GetValue<object?>(\"{v}\", null) : ctx.GetValue<object?>(\"{v}\"))");
                    }
                    else if ((it.StartsWith("\"") && it.EndsWith("\"")) || (it.StartsWith("'") && it.EndsWith("'")))
                    {
                        var content = it.Substring(1, it.Length - 2);
                        itemExprs.Add($"\"{EscapeInterpolatedContent(content)}\"");
                    }
                    else if (bool.TryParse(it, out var b))
                    {
                        itemExprs.Add(b ? "true" : "false");
                    }
                    else if (double.TryParse(it, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out _))
                    {
                        itemExprs.Add(it);
                    }
                    else
                    {
                        itemExprs.Add($"\"{EscapeInterpolatedContent(it)}\"");
                    }
                }
                var elementsCode = string.Join(", ", itemExprs);
                var lambdaCode = $"ctx => (object?)new System.Collections.Generic.List<object?> {{ {elementsCode} }}";
                valueExpr = ParseExpression(lambdaCode);
            }
        }
        // 3. Single variable pass-through: e.g. {count}
        else if (varMatches.Count == 1 && trimmed == $"{{{varMatches[0].Groups[1].Value}}}")
        {
            var tokenVar = varMatches[0].Groups[1].Value;
            var lambdaCode = $"ctx => (_conversationContext != null && _conversationContext.HasValue(\"{tokenVar}\") ? _conversationContext.GetValue<object?>(\"{tokenVar}\", null) : ctx.GetValue<object?>(\"{tokenVar}\"))";
            valueExpr = ParseExpression(lambdaCode);
        }
        // 4. Arithmetic expression: e.g. {count} + 1, {count} * {noofpeople}, ({price} * {qty}) * 1.15
        else if (IsArithmeticExpression(trimmed))
        {
            var evalCode = BuildArithmeticEvaluationCode(trimmed, varMatches);
            var lambdaCode = $"ctx => ((Func<double, object?>)(res => (res % 1 == 0 && res >= int.MinValue && res <= int.MaxValue) ? (object?)(int)res : (object?)res))({evalCode})";
            valueExpr = ParseExpression(lambdaCode);
        }
        // 5. String template with variables: e.g. "Iteration {count}"
        else if (varMatches.Count > 0)
        {
            var sb = new StringBuilder("$\"");
            int lastIndex = 0;
            foreach (System.Text.RegularExpressions.Match match in varMatches)
            {
                var textBefore = trimmed.Substring(lastIndex, match.Index - lastIndex);
                sb.Append(EscapeInterpolatedContent(textBefore));
                var varName = match.Groups[1].Value;
                sb.Append("{(_conversationContext != null && _conversationContext.HasValue(\"")
                  .Append(varName)
                  .Append("\") ? _conversationContext.GetValue<object?>(\"")
                  .Append(varName)
                  .Append("\", null) : ctx.GetValue<object?>(\"")
                  .Append(varName)
                  .Append("\"))}");
                lastIndex = match.Index + match.Length;
            }
            var textAfter = trimmed.Substring(lastIndex);
            sb.Append(EscapeInterpolatedContent(textAfter));
            sb.Append('"');

            var lambdaCode = $"ctx => (object?){sb}";
            valueExpr = ParseExpression(lambdaCode);
        }
        // 6. Static string literal
        else
        {
            valueExpr = StringLiteral(value);
        }

        var args = new List<ArgumentSyntax>
        {
            Argument(StringLiteral(id)),
            Argument(StringLiteral(variableName)),
            Argument(valueExpr),
            Argument(IdentifierName("_conversationContext")),
            Argument(nullLoggerExpr),
            Argument(LiteralExpression(isGlobal ? SyntaxKind.TrueLiteralExpression : SyntaxKind.FalseLiteralExpression))
        };

        var creation = ObjectCreationExpression(IdentifierName("SetVariableActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(args)));

        if (!validateNaming)
        {
            var assignment = AssignmentExpression(
                SyntaxKind.SimpleAssignmentExpression,
                IdentifierName("ValidateGlobalNaming"),
                LiteralExpression(SyntaxKind.FalseLiteralExpression));

            creation = creation.WithInitializer(
                InitializerExpression(SyntaxKind.ObjectInitializerExpression, SingletonSeparatedList<ExpressionSyntax>(assignment)));
        }

        return creation;
    }

    private static List<string> SplitListElements(string input)
    {
        var list = new List<string>();
        var sb = new StringBuilder();
        bool inDoubleQuotes = false;
        bool inSingleQuotes = false;

        for (int i = 0; i < input.Length; i++)
        {
            char c = input[i];
            if (c == '"' && !inSingleQuotes)
            {
                inDoubleQuotes = !inDoubleQuotes;
                sb.Append(c);
            }
            else if (c == '\'' && !inDoubleQuotes)
            {
                inSingleQuotes = !inSingleQuotes;
                sb.Append(c);
            }
            else if (c == ',' && !inDoubleQuotes && !inSingleQuotes)
            {
                if (!string.IsNullOrWhiteSpace(sb.ToString()))
                {
                    list.Add(sb.ToString().Trim());
                    sb.Clear();
                }
            }
            else
            {
                sb.Append(c);
            }
        }
        if (!string.IsNullOrWhiteSpace(sb.ToString()))
        {
            list.Add(sb.ToString().Trim());
        }
        return list;
    }

    private static bool IsArithmeticExpression(string expr)
    {
        if (string.IsNullOrWhiteSpace(expr)) return false;
        // Strip out all {varName} tokens
        var remainder = System.Text.RegularExpressions.Regex.Replace(expr, @"\{[a-zA-Z0-9_]+\}", "").Trim();
        if (string.IsNullOrEmpty(remainder)) return false;

        // Remainder must consist ONLY of digits, dots, whitespace, parens, and math operators
        if (!System.Text.RegularExpressions.Regex.IsMatch(remainder, @"^[\s0-9\.\+\-\*\/\%\(\)]+$"))
            return false;

        // Must contain at least one arithmetic operator
        if (!System.Text.RegularExpressions.Regex.IsMatch(remainder, @"[\+\-\*\/\%]"))
            return false;

        return true;
    }

    private static string BuildArithmeticEvaluationCode(string expr, System.Text.RegularExpressions.MatchCollection varMatches)
    {
        var sb = new StringBuilder();
        int lastIndex = 0;
        foreach (System.Text.RegularExpressions.Match match in varMatches)
        {
            var textBefore = expr.Substring(lastIndex, match.Index - lastIndex);
            sb.Append(textBefore);
            var varName = match.Groups[1].Value;
            sb.Append($"System.Convert.ToDouble(_conversationContext != null && _conversationContext.HasValue(\"{varName}\") ? _conversationContext.GetValue<object?>(\"{varName}\", null) : ctx.GetValue<object?>(\"{varName}\"))");
            lastIndex = match.Index + match.Length;
        }
        var textAfter = expr.Substring(lastIndex);
        sb.Append(textAfter);
        return sb.ToString();
    }

    private static ExpressionSyntax BuildGlobalVariableActivity(string id, Dictionary<string, string>? data)
    {
        var promotionMode = data?.GetValueOrDefault("promotionMode", "all")?.ToLowerInvariant() ?? "all";
        var sourceKey = data?.GetValueOrDefault("sourceKey", "")?.Trim() ?? "";
        var globalKey = data?.GetValueOrDefault("globalKey", "")?.Trim() ?? "";

        // If specific mode is selected or a source key is provided, use the typed single-variable promoter
        if ((promotionMode == "specific" || !string.IsNullOrWhiteSpace(sourceKey)) && !string.IsNullOrWhiteSpace(sourceKey))
        {
            var targetGlobalKey = string.IsNullOrWhiteSpace(globalKey) || globalKey == "Global_<Key>"
                ? (sourceKey.StartsWith("Global_") ? sourceKey : $"Global_{sourceKey}")
                : globalKey;

            var nullLoggerExpr = MemberAccessExpression(
                SyntaxKind.SimpleMemberAccessExpression,
                GenericName(Identifier("NullLogger"))
                    .WithTypeArgumentList(TypeArgumentList(SingletonSeparatedList<TypeSyntax>(
                        GenericName(Identifier("GlobalVariableActivity"))
                            .WithTypeArgumentList(TypeArgumentList(SingletonSeparatedList<TypeSyntax>(PredefinedType(Token(SyntaxKind.ObjectKeyword)))))))),
                IdentifierName("Instance"));

            var args = new List<ArgumentSyntax>
            {
                Argument(StringLiteral(id)),
                Argument(StringLiteral(sourceKey)),
                Argument(IdentifierName("_conversationContext")),
                Argument(nullLoggerExpr),
                Argument(StringLiteral(targetGlobalKey))
            };

            return ObjectCreationExpression(
                GenericName(Identifier("GlobalVariableActivity"))
                    .WithTypeArgumentList(TypeArgumentList(SingletonSeparatedList<TypeSyntax>(PredefinedType(Token(SyntaxKind.ObjectKeyword))))))
                .WithArgumentList(ArgumentList(SeparatedList(args)));
        }
        else
        {
            var nullLoggerExpr = MemberAccessExpression(
                SyntaxKind.SimpleMemberAccessExpression,
                GenericName(Identifier("NullLogger"))
                    .WithTypeArgumentList(TypeArgumentList(SingletonSeparatedList<TypeSyntax>(IdentifierName("GlobalVariableActivity")))),
                IdentifierName("Instance"));

            var args = new List<ArgumentSyntax>
            {
                Argument(StringLiteral(id)),
                Argument(IdentifierName("_conversationContext")),
                Argument(nullLoggerExpr)
            };

            return ObjectCreationExpression(IdentifierName("GlobalVariableActivity"))
                .WithArgumentList(ArgumentList(SeparatedList(args)));
        }
    }

    private static ExpressionSyntax BuildDumpCtxActivity(string id, Dictionary<string, string>? data)
    {
        bool isDevelopment = true;
        if (data != null && data.TryGetValue("developmentMode", out var devStr) && bool.TryParse(devStr, out var devParsed))
        {
            isDevelopment = devParsed;
        }

        var args = new List<ArgumentSyntax>
        {
            Argument(StringLiteral(id)),
            Argument(LiteralExpression(isDevelopment ? SyntaxKind.TrueLiteralExpression : SyntaxKind.FalseLiteralExpression))
        };

        return ObjectCreationExpression(IdentifierName("DumpCtxActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(args)));
    }

    private static ExpressionSyntax BuildResetActivity(string id, Dictionary<string, string>? data)
    {
        var message = data?.GetValueOrDefault("resetMessage", "Session reset completed") ?? "Session reset completed";

        var args = new List<ArgumentSyntax>
        {
            Argument(StringLiteral(id)),
            Argument(StringLiteral(message))
        };

        return ObjectCreationExpression(IdentifierName("ResetActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(args)));
    }

    private static ExpressionSyntax BuildSwitchActivity(string id, Dictionary<string, string> data)
    {
        var valueContextKey = data.GetValueOrDefault("valueContextKey", "SwitchKey");
        var caseKeysRaw = data.GetValueOrDefault("caseKeys", "");
        var defaultCaseRaw = data.GetValueOrDefault("defaultCase", "");

        var caseKeys = caseKeysRaw
            .Split(new[] { '|', ',' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(k => k.Trim())
            .Where(k => !string.IsNullOrEmpty(k))
            .ToList();

        var dictType = GenericName(Identifier("Dictionary"))
            .WithTypeArgumentList(TypeArgumentList(SeparatedList<TypeSyntax>(new TypeSyntax[]
            {
                PredefinedType(Token(SyntaxKind.StringKeyword)),
                IdentifierName("TopicFlowActivity")
            })));

        var dictElements = new List<ExpressionSyntax>();
        foreach (var key in caseKeys)
        {
            var sanitized = SanitizeIdentifier(key);
            var childCreation = BuildSimpleActivity($"{id}_{sanitized}", new Dictionary<string, string> { ["message"] = key });
            var keyExpr = ImplicitElementAccess()
                .WithArgumentList(BracketedArgumentList(SingletonSeparatedList(Argument(StringLiteral(key)))));
            dictElements.Add(AssignmentExpression(SyntaxKind.SimpleAssignmentExpression, keyExpr, childCreation));
        }

        ExpressionSyntax dictCreation = ObjectCreationExpression(dictType)
            .WithArgumentList(ArgumentList());

        if (dictElements.Count > 0)
        {
            dictCreation = ObjectCreationExpression(dictType)
                .WithInitializer(InitializerExpression(SyntaxKind.ObjectInitializerExpression, SeparatedList(dictElements)));
        }

        ExpressionSyntax defaultActivityExpr;
        if (!string.IsNullOrWhiteSpace(defaultCaseRaw))
        {
            defaultActivityExpr = BuildSimpleActivity($"{id}_Default", new Dictionary<string, string> { ["message"] = defaultCaseRaw });
        }
        else
        {
            defaultActivityExpr = LiteralExpression(SyntaxKind.NullLiteralExpression);
        }

        var args = new List<ArgumentSyntax>
        {
            Argument(StringLiteral(id)),
            Argument(StringLiteral(valueContextKey)),
            Argument(dictCreation),
            Argument(defaultActivityExpr)
        };

        var initializers = new List<ExpressionSyntax>();
        if (data.TryGetValue("loopAfterCase", out var loopVal) && loopVal.Equals("true", StringComparison.OrdinalIgnoreCase))
        {
            initializers.Add(AssignmentExpression(
                SyntaxKind.SimpleAssignmentExpression,
                IdentifierName("LoopAfterCase"),
                LiteralExpression(SyntaxKind.TrueLiteralExpression)));
        }

        var switchCreation = ObjectCreationExpression(IdentifierName("SwitchActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(args)));

        if (initializers.Count > 0)
        {
            switchCreation = switchCreation.WithInitializer(
                InitializerExpression(SyntaxKind.ObjectInitializerExpression, SeparatedList(initializers)));
        }

        return switchCreation;
    }

    private static ExpressionSyntax BuildRepeatLoopActivity(DiagramNodeV2 node)
    {
        var id = node.Name ?? node.Id;
        var data = node.Data ?? new Dictionary<string, string>();
        var loopMode = data.GetValueOrDefault("loopMode", "fixed_count")?.ToLowerInvariant();
        ObjectCreationExpressionSyntax creation;

        if (node.Type == "ForEachActivity" || loopMode is "collection" or "for_each" || (!string.IsNullOrWhiteSpace(data.GetValueOrDefault("collectionKey")) && loopMode != "fixed_count" && loopMode != "while_condition" && loopMode != "user_prompt"))
        {
            var collKey = data.GetValueOrDefault("collectionKey", "Items");
            var itemKey = data.GetValueOrDefault("itemKey", "item");
            var indexKey = data.GetValueOrDefault("indexKey", "index");
            creation = ObjectCreationExpression(IdentifierName("RepeatLoopActivity"))
                .WithArgumentList(ArgumentList(SeparatedList(new[]
                {
                    Argument(StringLiteral(id)),
                    Argument(StringLiteral(collKey)),
                    Argument(StringLiteral(itemKey)),
                    Argument(StringLiteral(indexKey))
                })));
        }
        else if (loopMode == "user_prompt" || (!string.IsNullOrWhiteSpace(data.GetValueOrDefault("continuePrompt")) && loopMode != "fixed_count" && loopMode != "while_condition"))
        {
            var prompt = data.GetValueOrDefault("continuePrompt", "Would you like to continue?");
            creation = ObjectCreationExpression(IdentifierName("RepeatLoopActivity"))
                .WithArgumentList(ArgumentList(SeparatedList(new[]
                {
                    Argument(StringLiteral(id)),
                    Argument(StringLiteral(prompt)).WithNameColon(NameColon("continuePrompt"))
                })));
        }
        else if (loopMode == "while_condition" && data.TryGetValue("condition", out var cond) && !string.IsNullOrWhiteSpace(cond))
        {
            var inner = cond.Contains("=>") ? cond.Substring(cond.IndexOf("=>", StringComparison.Ordinal) + 2).Trim() : cond.Trim();
            var condExpr = ParseExpression($"ctx => ctx.GetValue<int>(\"{id}_Iteration\") <= 50 && ({inner})");
            creation = ObjectCreationExpression(IdentifierName("RepeatLoopActivity"))
                .WithArgumentList(ArgumentList(SeparatedList(new[]
                {
                    Argument(StringLiteral(id)),
                    Argument(condExpr)
                })));
        }
        else
        {
            int iterations = 3;
            if (data.TryGetValue("iterations", out var itStr) && int.TryParse(itStr, out var itParsed) && itParsed > 0)
            {
                iterations = itParsed;
            }
            creation = ObjectCreationExpression(IdentifierName("RepeatLoopActivity"))
                .WithArgumentList(ArgumentList(SeparatedList(new[]
                {
                    Argument(StringLiteral(id)),
                    Argument(LiteralExpression(SyntaxKind.NumericLiteralExpression, Literal(iterations)))
                })));
        }

        if (data.TryGetValue("iterationVariable", out var iterVar) && !string.IsNullOrWhiteSpace(iterVar) && iterVar.Trim() != "count")
        {
            creation = creation.WithInitializer(InitializerExpression(
                SyntaxKind.ObjectInitializerExpression,
                SingletonSeparatedList<ExpressionSyntax>(
                    AssignmentExpression(
                        SyntaxKind.SimpleAssignmentExpression,
                        IdentifierName("IterationKey"),
                        StringLiteral(iterVar.Trim())))));
        }

        return creation;
    }

    private static ExpressionSyntax BuildConditionalActivity(
        DiagramNodeV2 node,
        DiagramDocumentV2 document,
        HashSet<string> nestedNodeIds)
    {
        var id = node.Name ?? node.Id;
        return ObjectCreationExpression(IdentifierName("ConditionalActivity"))
            .WithArgumentList(ArgumentList(SingletonSeparatedList(Argument(StringLiteral(id)))));
    }

    private static (DiagramEdgeV2? TrueEdge, DiagramEdgeV2? FalseEdge) FindTrueAndFalseEdges(
        DiagramNodeV2 condNode,
        DiagramDocumentV2 document)
    {
        if (document.Edges == null || document.Edges.Count == 0 || document.Nodes == null)
            return (null, null);

        var outgoingEdges = document.Edges
            .Where(e => e.From != null && e.From.Node == condNode.Id && e.To != null && !string.IsNullOrEmpty(e.To.Node) && !IsExceptionPort(condNode, e.From.Port))
            .ToList();

        if (outgoingEdges.Count == 0)
            return (null, null);

        DiagramEdgeV2? trueEdge = null;
        DiagramEdgeV2? falseEdge = null;

        foreach (var edge in outgoingEdges)
        {
            var port = condNode.Ports?.FirstOrDefault(p => p.Id == edge.From.Port);
            var portId = edge.From.Port ?? "";
            var portName = port?.Name ?? "";
            var position = port?.Position;

            bool isTruePort = position == DiagramPortSideV2.Right ||
                              portName.Equals("Yes", StringComparison.OrdinalIgnoreCase) ||
                              portName.Equals("True", StringComparison.OrdinalIgnoreCase) ||
                              portId.EndsWith("case-yes", StringComparison.OrdinalIgnoreCase) ||
                              portId.EndsWith("case-0", StringComparison.OrdinalIgnoreCase) ||
                              portId.EndsWith("case-true", StringComparison.OrdinalIgnoreCase);

            bool isFalsePort = position == DiagramPortSideV2.Bottom ||
                               portName.Equals("No", StringComparison.OrdinalIgnoreCase) ||
                               portName.Equals("False", StringComparison.OrdinalIgnoreCase) ||
                               portId.EndsWith("case-no", StringComparison.OrdinalIgnoreCase) ||
                               portId.EndsWith("case-1", StringComparison.OrdinalIgnoreCase) ||
                               portId.EndsWith("case-false", StringComparison.OrdinalIgnoreCase);

            if (isTruePort && trueEdge == null)
            {
                trueEdge = edge;
            }
            else if (isFalsePort && falseEdge == null)
            {
                falseEdge = edge;
            }
        }

        if (trueEdge == null && outgoingEdges.Count > 0)
        {
            trueEdge = outgoingEdges[0];
        }
        if (falseEdge == null && outgoingEdges.Count > 1 && outgoingEdges[1] != trueEdge)
        {
            falseEdge = outgoingEdges[1];
        }

        return (trueEdge, falseEdge);
    }

    private static (ExpressionSyntax TrueGuard, ExpressionSyntax FalseGuard) ResolveBranchGuards(
        DiagramNodeV2 condNode,
        DiagramDocumentV2 document)
    {
        var data = condNode.Data ?? new Dictionary<string, string>();
        var (trueEdge, falseEdge) = FindTrueAndFalseEdges(condNode, document);

        string? trueLabel = null;
        string? falseLabel = null;

        if (trueEdge != null)
        {
            var port = condNode.Ports?.FirstOrDefault(p => p.Id == trueEdge.From?.Port);
            var portName = port?.Name;
            if (!string.IsNullOrWhiteSpace(portName))
            {
                trueLabel = portName.Trim();
            }
        }

        if (falseEdge != null)
        {
            var port = condNode.Ports?.FirstOrDefault(p => p.Id == falseEdge.From?.Port);
            var portName = port?.Name;
            if (!string.IsNullOrWhiteSpace(portName))
            {
                falseLabel = portName.Trim();
            }
        }

        if (data.TryGetValue("cases", out var casesRaw) && !string.IsNullOrWhiteSpace(casesRaw))
        {
            var parts = casesRaw.Split(new[] { '|', ',' }, StringSplitOptions.RemoveEmptyEntries)
                                .Select(s => s.Trim())
                                .ToList();
            if (parts.Count > 0 && string.IsNullOrEmpty(trueLabel))
                trueLabel = parts[0];
            if (parts.Count > 1 && string.IsNullOrEmpty(falseLabel))
                falseLabel = parts[1];
        }

        var selectorKey = data.GetValueOrDefault("selectorKey", data.GetValueOrDefault("expression", "")).Trim();
        var left = data.GetValueOrDefault("leftOperand", "").Trim();
        var op = data.GetValueOrDefault("operator", "").Trim();
        var right = data.GetValueOrDefault("rightOperand", "").Trim();

        if (string.IsNullOrWhiteSpace(left) && !string.IsNullOrWhiteSpace(selectorKey))
        {
            var match = System.Text.RegularExpressions.Regex.Match(
                selectorKey,
                @"^\s*([a-zA-Z0-9_]+)\s*(==|!=|>=|<=|>|<|contains)\s*(.+)\s*$",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            if (match.Success)
            {
                left = match.Groups[1].Value;
                op = match.Groups[2].Value;
                right = match.Groups[3].Value.Trim();
            }
        }

        if ((op == "==" || op == "=" || string.IsNullOrEmpty(op)) && !string.IsNullOrWhiteSpace(right))
        {
            var cleanRight = right.Trim('"', '\'');
            if (string.IsNullOrEmpty(trueLabel))
                trueLabel = cleanRight;
            if (string.IsNullOrEmpty(falseLabel) && (cleanRight.Equals("Yes", StringComparison.OrdinalIgnoreCase) || cleanRight.Equals("True", StringComparison.OrdinalIgnoreCase)))
                falseLabel = cleanRight.Equals("Yes", StringComparison.OrdinalIgnoreCase) ? "No" : "False";
        }

        if (!string.IsNullOrEmpty(trueLabel) || !string.IsNullOrEmpty(falseLabel))
        {
            trueLabel ??= "Yes";
            falseLabel ??= "No";

            return (StringLiteral(trueLabel), StringLiteral(falseLabel));
        }

        var trueLambda = BuildConditionLambda(data);
        var falseLambda = BuildInvertedConditionLambda(data);
        return (trueLambda, falseLambda);
    }

    private static ExpressionSyntax BuildInvertedConditionLambda(Dictionary<string, string> data)
    {
        var invertedData = new Dictionary<string, string>(data);
        var op = data.GetValueOrDefault("operator", "").Trim();
        if (op == "==" || op == "=" || string.IsNullOrEmpty(op))
        {
            invertedData["operator"] = "!=";
            return BuildConditionLambda(invertedData);
        }
        if (op == "!=")
        {
            invertedData["operator"] = "==";
            return BuildConditionLambda(invertedData);
        }
        if (op == "is_true")
        {
            invertedData["operator"] = "is_false";
            return BuildConditionLambda(invertedData);
        }
        if (op == "is_false")
        {
            invertedData["operator"] = "is_true";
            return BuildConditionLambda(invertedData);
        }

        var directExpr = BuildConditionLambda(data);
        var exprStr = directExpr.ToString();
        var lambdaPrefix = "ctx => ";
        if (exprStr.StartsWith(lambdaPrefix))
        {
            return ParseExpression($"ctx => !({exprStr.Substring(lambdaPrefix.Length)})");
        }
        return ParseExpression($"ctx => !({exprStr})");
    }

    private static (List<DiagramNodeV2> TrueBranch, List<DiagramNodeV2> FalseBranch) FindConditionalBranches(
        DiagramNodeV2 condNode,
        DiagramDocumentV2 document)
    {
        var (trueEdge, falseEdge) = FindTrueAndFalseEdges(condNode, document);
        if (trueEdge == null && falseEdge == null)
            return ([], []);

        var nodeById = document.Nodes.ToDictionary(n => n.Id, StringComparer.Ordinal);

        var blocked = new HashSet<string>(StringComparer.Ordinal) { condNode.Id };
        var trueReachable = (trueEdge != null && !string.IsNullOrEmpty(trueEdge.To?.Node) && nodeById.ContainsKey(trueEdge.To.Node))
            ? GetReachableNodes(trueEdge.To.Node, document, blocked)
            : [];
        var falseReachable = (falseEdge != null && !string.IsNullOrEmpty(falseEdge.To?.Node) && nodeById.ContainsKey(falseEdge.To.Node))
            ? GetReachableNodes(falseEdge.To.Node, document, blocked)
            : [];

        var shared = new HashSet<string>(trueReachable, StringComparer.Ordinal);
        shared.IntersectWith(falseReachable);

        var trueExclusive = trueReachable.Where(id => !shared.Contains(id)).ToHashSet(StringComparer.Ordinal);
        var falseExclusive = falseReachable.Where(id => !shared.Contains(id)).ToHashSet(StringComparer.Ordinal);

        // Prune nodes that have outside incoming edges (not dominated by branch)
        bool removed = true;
        while (removed)
        {
            removed = false;
            foreach (var id in trueExclusive.ToList())
            {
                var hasOutsideIncoming = document.Edges.Any(e =>
                    e.To != null && e.To.Node == id &&
                    e.From != null && e.From.Node != condNode.Id && !trueExclusive.Contains(e.From.Node));
                if (hasOutsideIncoming)
                {
                    trueExclusive.Remove(id);
                    removed = true;
                }
            }
        }

        removed = true;
        while (removed)
        {
            removed = false;
            foreach (var id in falseExclusive.ToList())
            {
                var hasOutsideIncoming = document.Edges.Any(e =>
                    e.To != null && e.To.Node == id &&
                    e.From != null && e.From.Node != condNode.Id && !falseExclusive.Contains(e.From.Node));
                if (hasOutsideIncoming)
                {
                    falseExclusive.Remove(id);
                    removed = true;
                }
            }
        }

        var sortedAll = TopologicallySortNodes(document);
        var trueBranch = sortedAll.Where(n => trueExclusive.Contains(n.Id)).ToList();
        var falseBranch = sortedAll.Where(n => falseExclusive.Contains(n.Id)).ToList();

        return (trueBranch, falseBranch);
    }

    private sealed class SwitchBranchInfo
    {
        public string CaseKey { get; set; } = string.Empty;
        public bool IsDefault { get; set; }
        public List<DiagramNodeV2> Nodes { get; set; } = [];
    }

    private static List<SwitchBranchInfo> FindSwitchBranches(
        DiagramNodeV2 switchNode,
        DiagramDocumentV2 document)
    {
        var data = switchNode.Data ?? new Dictionary<string, string>();
        var caseKeysRaw = data.GetValueOrDefault("caseKeys", "");

        var declaredCases = caseKeysRaw
            .Split(new[] { '|', ',' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(k => k.Trim())
            .Where(k => !string.IsNullOrEmpty(k))
            .ToList();

        var outgoingEdges = document.Edges
            .Where(e => e.From != null && e.From.Node == switchNode.Id && e.To != null && !string.IsNullOrEmpty(e.To.Node))
            .ToList();

        if (outgoingEdges.Count == 0)
            return [];

        var branches = new List<(string CaseKey, bool IsDefault, DiagramEdgeV2 Edge)>();
        var usedEdges = new HashSet<string>(StringComparer.Ordinal);

        foreach (var edge in outgoingEdges)
        {
            var port = switchNode.Ports?.FirstOrDefault(p => p.Id == edge.From?.Port);
            var portName = port?.Name?.Trim();
            var portId = edge.From?.Port ?? "";

            if (portId.EndsWith("case-default", StringComparison.OrdinalIgnoreCase) ||
                (portName != null && portName.Equals("Default", StringComparison.OrdinalIgnoreCase)))
            {
                branches.Add(("Default", true, edge));
                usedEdges.Add(edge.Id);
                continue;
            }

            string? matchedCase = null;
            for (int i = 0; i < declaredCases.Count; i++)
            {
                var c = declaredCases[i];
                var slug = Slugify(c);
                if ((portName != null && portName.Equals(c, StringComparison.OrdinalIgnoreCase)) ||
                    portId.EndsWith($"case-{slug}", StringComparison.OrdinalIgnoreCase) ||
                    portId.EndsWith($"case-{i}", StringComparison.OrdinalIgnoreCase))
                {
                    matchedCase = c;
                    break;
                }
            }

            if (matchedCase != null)
            {
                branches.Add((matchedCase, false, edge));
                usedEdges.Add(edge.Id);
            }
        }

        var remainingEdges = outgoingEdges.Where(e => !usedEdges.Contains(e.Id)).ToList();
        var remainingCases = declaredCases.Where(c => !branches.Any(b => !b.IsDefault && b.CaseKey.Equals(c, StringComparison.OrdinalIgnoreCase))).ToList();

        for (int i = 0; i < remainingEdges.Count; i++)
        {
            if (i < remainingCases.Count)
            {
                branches.Add((remainingCases[i], false, remainingEdges[i]));
            }
            else
            {
                branches.Add(($"Case_{i + 1}", false, remainingEdges[i]));
            }
        }

        if (branches.Count == 0)
            return [];

        var nodeById = document.Nodes.ToDictionary(n => n.Id, StringComparer.Ordinal);
        var blocked = new HashSet<string>(StringComparer.Ordinal) { switchNode.Id };

        var branchReachable = new List<HashSet<string>>();
        foreach (var b in branches)
        {
            var targetNodeId = b.Edge.To?.Node;
            if (targetNodeId != null && nodeById.ContainsKey(targetNodeId))
            {
                branchReachable.Add(GetReachableNodes(targetNodeId, document, blocked));
            }
            else
            {
                branchReachable.Add([]);
            }
        }

        var shared = new HashSet<string>(StringComparer.Ordinal);
        for (int i = 0; i < branchReachable.Count; i++)
        {
            for (int j = i + 1; j < branchReachable.Count; j++)
            {
                var intersect = new HashSet<string>(branchReachable[i], StringComparer.Ordinal);
                intersect.IntersectWith(branchReachable[j]);
                shared.UnionWith(intersect);
            }
        }

        var sortedAll = TopologicallySortNodes(document);
        var result = new List<SwitchBranchInfo>();

        for (int i = 0; i < branches.Count; i++)
        {
            var b = branches[i];
            var exclusive = branchReachable[i].Where(id => !shared.Contains(id)).ToHashSet(StringComparer.Ordinal);

            bool removed = true;
            while (removed)
            {
                removed = false;
                foreach (var id in exclusive.ToList())
                {
                    var hasOutsideIncoming = document.Edges.Any(e =>
                        e.To != null && e.To.Node == id &&
                        e.From != null && e.From.Node != switchNode.Id && !exclusive.Contains(e.From.Node));
                    if (hasOutsideIncoming)
                    {
                        exclusive.Remove(id);
                        removed = true;
                    }
                }
            }

            var branchNodes = sortedAll.Where(n => exclusive.Contains(n.Id)).ToList();
            result.Add(new SwitchBranchInfo
            {
                CaseKey = b.CaseKey,
                IsDefault = b.IsDefault,
                Nodes = branchNodes
            });
        }

        return result;
    }

    private static (List<DiagramNodeV2> LoopBody, List<DiagramNodeV2> Done) FindRepeatLoopBranches(
        DiagramNodeV2 repeatNode,
        DiagramDocumentV2 document)
    {
        var nodeById = document.Nodes.ToDictionary(n => n.Id, StringComparer.Ordinal);
        var outgoingEdges = document.Edges
            .Where(e => e.From != null && e.From.Node == repeatNode.Id && e.To != null && !string.IsNullOrEmpty(e.To.Node))
            .ToList();

        if (outgoingEdges.Count == 0)
            return ([], []);

        var blocked = new HashSet<string>(StringComparer.Ordinal) { repeatNode.Id };

        var doneEdges = outgoingEdges.Where(e =>
        {
            var port = repeatNode.Ports?.FirstOrDefault(p => p.Id == e.From?.Port);
            var portId = e.From?.Port ?? "";
            var portName = port?.Name?.Trim() ?? "";
            return portId.EndsWith("loop-done", StringComparison.OrdinalIgnoreCase) ||
                   portName.Equals("Done", StringComparison.OrdinalIgnoreCase);
        }).ToList();

        var bodyEdges = outgoingEdges.Where(e =>
        {
            var port = repeatNode.Ports?.FirstOrDefault(p => p.Id == e.From?.Port);
            var portId = e.From?.Port ?? "";
            var portName = port?.Name?.Trim() ?? "";
            return portId.EndsWith("loop-body", StringComparison.OrdinalIgnoreCase) ||
                   portName.Equals("Loop Body", StringComparison.OrdinalIgnoreCase) ||
                   portName.Equals("Body", StringComparison.OrdinalIgnoreCase);
        }).ToList();

        if (bodyEdges.Count == 0 && outgoingEdges.Count > 0)
        {
            bodyEdges = [outgoingEdges[0]];
            if (outgoingEdges.Count > 1 && doneEdges.Count == 0)
            {
                doneEdges = outgoingEdges.Skip(1).ToList();
            }
        }

        var doneReachable = new HashSet<string>(StringComparer.Ordinal);
        foreach (var edge in doneEdges)
        {
            if (edge.To?.Node != null && nodeById.ContainsKey(edge.To.Node))
            {
                doneReachable.UnionWith(GetReachableNodes(edge.To.Node, document, blocked));
            }
        }

        var bodyReachable = new HashSet<string>(StringComparer.Ordinal);
        foreach (var edge in bodyEdges)
        {
            if (edge.To?.Node != null && nodeById.ContainsKey(edge.To.Node))
            {
                var bodyBlocked = new HashSet<string>(blocked, StringComparer.Ordinal);
                bodyBlocked.UnionWith(doneReachable);
                bodyReachable.UnionWith(GetReachableNodes(edge.To.Node, document, bodyBlocked));
            }
        }

        var sortedAll = TopologicallySortNodes(document);

        var loopBodyNodes = sortedAll.Where(n => bodyReachable.Contains(n.Id)).ToList();
        var doneNodes = sortedAll.Where(n => doneReachable.Contains(n.Id)).ToList();

        return (loopBodyNodes, doneNodes);
    }

    private static string Slugify(string label)
    {
        return System.Text.RegularExpressions.Regex.Replace(label.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
    }

    private static HashSet<string> GetReachableNodes(
        string startNodeId,
        DiagramDocumentV2 document,
        HashSet<string> blockedNodeIds)
    {
        var reachable = new HashSet<string>(StringComparer.Ordinal);
        if (blockedNodeIds.Contains(startNodeId)) return reachable;

        var nodeById = document.Nodes.ToDictionary(n => n.Id, StringComparer.Ordinal);
        var queue = new Queue<string>();
        queue.Enqueue(startNodeId);
        reachable.Add(startNodeId);

        var outgoing = document.Edges
            .Where(e => e.From != null && e.To != null && !string.IsNullOrEmpty(e.To.Node) &&
                        nodeById.ContainsKey(e.From.Node) &&
                        !IsExceptionPort(nodeById[e.From.Node], e.From.Port))
            .GroupBy(e => e.From.Node, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.Select(e => e.To!.Node).ToList(), StringComparer.Ordinal);

        while (queue.Count > 0)
        {
            var curr = queue.Dequeue();
            if (nodeById.TryGetValue(curr, out var currNode) && currNode.Type == "EndActivity")
            {
                continue;
            }

            if (outgoing.TryGetValue(curr, out var nextList))
            {
                foreach (var next in nextList)
                {
                    if (!blockedNodeIds.Contains(next) && reachable.Add(next))
                    {
                        queue.Enqueue(next);
                    }
                }
            }
        }

        return reachable;
    }

    private static ExpressionSyntax BuildConditionLambda(Dictionary<string, string> data)
    {
        var left = data.GetValueOrDefault("leftOperand", "").Trim();
        var op = data.GetValueOrDefault("operator", "").Trim();
        var right = data.GetValueOrDefault("rightOperand", "").Trim();
        var selectorKey = data.GetValueOrDefault("selectorKey", data.GetValueOrDefault("expression", "")).Trim();

        if (string.IsNullOrWhiteSpace(left) && !string.IsNullOrWhiteSpace(selectorKey))
        {
            var match = System.Text.RegularExpressions.Regex.Match(
                selectorKey,
                @"^\s*([a-zA-Z0-9_]+)\s*(==|!=|>=|<=|>|<|contains)\s*(.+)\s*$",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            if (match.Success)
            {
                left = match.Groups[1].Value;
                op = match.Groups[2].Value;
                right = match.Groups[3].Value.Trim();
            }
        }

        if (!string.IsNullOrWhiteSpace(left))
        {
            var cleanRight = right.Trim('"', '\'');
            var escapedRight = cleanRight.Replace("\\", "\\\\").Replace("\"", "\\\"");

            if (op == "==" || op == "=" || string.IsNullOrEmpty(op))
            {
                return ParseExpression($"ctx => string.Equals((_conversationContext != null && _conversationContext.HasValue(\"{left}\") ? _conversationContext.GetValue<object?>(\"{left}\", null)?.ToString() : ctx.GetValue<object?>(\"{left}\")?.ToString()), \"{escapedRight}\", StringComparison.OrdinalIgnoreCase)");
            }
            if (op == "!=")
            {
                return ParseExpression($"ctx => !string.Equals((_conversationContext != null && _conversationContext.HasValue(\"{left}\") ? _conversationContext.GetValue<object?>(\"{left}\", null)?.ToString() : ctx.GetValue<object?>(\"{left}\")?.ToString()), \"{escapedRight}\", StringComparison.OrdinalIgnoreCase)");
            }
            if (op.Equals("contains", StringComparison.OrdinalIgnoreCase))
            {
                return ParseExpression($"ctx => ((_conversationContext != null && _conversationContext.HasValue(\"{left}\") ? _conversationContext.GetValue<object?>(\"{left}\", null)?.ToString() : ctx.GetValue<object?>(\"{left}\")?.ToString()) ?? \"\").Contains(\"{escapedRight}\", StringComparison.OrdinalIgnoreCase)");
            }
            if (op == "is_true")
            {
                return ParseExpression($"ctx => bool.TryParse((_conversationContext != null && _conversationContext.HasValue(\"{left}\") ? _conversationContext.GetValue<object?>(\"{left}\", null)?.ToString() : ctx.GetValue<object?>(\"{left}\")?.ToString()), out var b) && b");
            }
            if (op == "is_false")
            {
                return ParseExpression($"ctx => bool.TryParse((_conversationContext != null && _conversationContext.HasValue(\"{left}\") ? _conversationContext.GetValue<object?>(\"{left}\", null)?.ToString() : ctx.GetValue<object?>(\"{left}\")?.ToString()), out var b) && !b");
            }
            if (op == "is_null")
            {
                return ParseExpression($"ctx => (_conversationContext != null && _conversationContext.HasValue(\"{left}\") ? _conversationContext.GetValue<object?>(\"{left}\", null) : ctx.GetValue<object?>(\"{left}\")) == null");
            }
            if (op is ">" or "<" or ">=" or "<=" && double.TryParse(cleanRight, System.Globalization.CultureInfo.InvariantCulture, out var num))
            {
                return ParseExpression($"ctx => double.TryParse((_conversationContext != null && _conversationContext.HasValue(\"{left}\") ? _conversationContext.GetValue<object?>(\"{left}\", null)?.ToString() : ctx.GetValue<object?>(\"{left}\")?.ToString()), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var v) && v {op} {num}");
            }
        }

        if (!string.IsNullOrWhiteSpace(selectorKey))
        {
            var cleanKey = selectorKey.Trim();
            if (System.Text.RegularExpressions.Regex.IsMatch(cleanKey, @"^[a-zA-Z0-9_]+$"))
            {
                return ParseExpression($"ctx => ctx.GetValue<bool>(\"{cleanKey}\")");
            }
        }

        return ParseExpression("ctx => ctx.GetValue<bool>(\"ConditionResult\")");
    }

    private static ExpressionSyntax BuildParallelActivity(DiagramNodeV2 node, DiagramDocumentV2 document, HashSet<string> nestedNodeIds)
    {
        var id = node.Name ?? node.Id;
        var data = node.Data;
        var childCreations = new List<ExpressionSyntax>();

        if (document.Edges != null && document.Edges.Count > 0)
        {
            var nodeById = document.Nodes.ToDictionary(n => n.Id, StringComparer.Ordinal);
            var branchEdges = document.Edges
                .Where(e => e.From != null && e.From.Node == node.Id && e.To != null && !string.IsNullOrEmpty(e.To.Node))
                .Where(e => e.From.Port != null && (e.From.Port.Contains("branch-", StringComparison.OrdinalIgnoreCase) || e.From.Port.Contains("Branch", StringComparison.OrdinalIgnoreCase)) && !e.From.Port.Contains("branch-done", StringComparison.OrdinalIgnoreCase))
                .OrderBy(e => e.From.Port, StringComparer.Ordinal)
                .ToList();

            foreach (var edge in branchEdges)
            {
                if (nodeById.TryGetValue(edge.To.Node, out var targetNode))
                {
                    var targetId = targetNode.Name ?? targetNode.Id;
                    ExpressionSyntax? childExpr = targetNode.Type switch
                    {
                        "SimpleActivity" => BuildSimpleActivity(targetId, targetNode.Data),
                        "EndActivity" => BuildEndActivity(targetId, targetNode.Data),
                        "DelayActivity" => BuildDelayActivity(targetId, targetNode.Data),
                        "TriggerTopicActivity" => BuildTriggerTopicActivity(targetId, targetNode.Data),
                        "CompositeActivity" => BuildCompositeActivity(targetId, targetNode.Data),
                        "PromptActivity" => BuildPromptActivity(targetId, targetNode.Data),
                        "SetVariableActivity" => BuildSetVariableActivity(targetId, targetNode.Data),
                        "GlobalVariableActivity" => BuildGlobalVariableActivity(targetId, targetNode.Data),
                        "DumpCtxActivity" => BuildDumpCtxActivity(targetId, targetNode.Data),
                        "ResetActivity" => BuildResetActivity(targetId, targetNode.Data),
                        "SwitchActivity" => BuildSwitchActivity(targetId, targetNode.Data),
                        _ => BuildGenericFallback(targetNode.Type, targetId, targetNode.Data),
                    };

                    if (childExpr != null)
                    {
                        childCreations.Add(childExpr);
                        nestedNodeIds.Add(targetNode.Id);
                    }
                }
            }
        }

        var arrayType = ArrayType(IdentifierName("TopicFlowActivity"))
            .WithRankSpecifiers(SingletonList(ArrayRankSpecifier(SingletonSeparatedList<ExpressionSyntax>(OmittedArraySizeExpression()))));

        var arrayInitializer = InitializerExpression(
            SyntaxKind.ArrayInitializerExpression,
            SeparatedList(childCreations));

        var arrayCreation = ArrayCreationExpression(arrayType, arrayInitializer);

        var args = new[]
        {
            Argument(StringLiteral(id)),
            Argument(arrayCreation),
        };

        var initializers = new List<ExpressionSyntax>();

        if (data.TryGetValue("continueOnError", out var contVal) && contVal.Equals("true", StringComparison.OrdinalIgnoreCase))
        {
            initializers.Add(AssignmentExpression(
                SyntaxKind.SimpleAssignmentExpression,
                IdentifierName("ContinueOnError"),
                LiteralExpression(SyntaxKind.TrueLiteralExpression)));
        }

        if (data.TryGetValue("completeMessage", out var msgVal) && !string.IsNullOrWhiteSpace(msgVal))
        {
            initializers.Add(AssignmentExpression(
                SyntaxKind.SimpleAssignmentExpression,
                IdentifierName("CompleteMessage"),
                StringLiteral(msgVal)));
        }

        var creation = ObjectCreationExpression(IdentifierName("ParallelActivity"))
            .WithArgumentList(ArgumentList(SeparatedList(args)));

        if (initializers.Count > 0)
        {
            creation = creation.WithInitializer(
                InitializerExpression(SyntaxKind.ObjectInitializerExpression, SeparatedList(initializers)));
        }

        return creation;
    }

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

    private record CardFieldItem(string Id, string Type, string Label, bool Required, string? Placeholder);

    private static (List<CardFieldItem> Fields, string CardJson) ParseCardFieldsData(string? cardFieldsRaw, string id)
    {
        var fields = new List<CardFieldItem>();
        if (string.IsNullOrWhiteSpace(cardFieldsRaw))
        {
            return (fields, "{}");
        }

        try
        {
            using var doc = JsonDocument.Parse(cardFieldsRaw);
            JsonElement fieldsArray;
            string title = $"{id} Form";
            string desc = "";
            string submitText = "Submit";

            if (doc.RootElement.ValueKind == JsonValueKind.Object)
            {
                if (doc.RootElement.TryGetProperty("title", out var titleProp) && titleProp.ValueKind == JsonValueKind.String)
                {
                    title = titleProp.GetString() ?? title;
                }
                if (doc.RootElement.TryGetProperty("desc", out var descProp) && descProp.ValueKind == JsonValueKind.String)
                {
                    desc = descProp.GetString() ?? "";
                }
                if (doc.RootElement.TryGetProperty("submitText", out var submitProp) && submitProp.ValueKind == JsonValueKind.String)
                {
                    submitText = submitProp.GetString() ?? "Submit";
                }

                if (doc.RootElement.TryGetProperty("fields", out var fProp) && fProp.ValueKind == JsonValueKind.Array)
                {
                    fieldsArray = fProp;
                }
                else
                {
                    fieldsArray = doc.RootElement;
                }
            }
            else if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                fieldsArray = doc.RootElement;
            }
            else
            {
                return (fields, "{}");
            }

            var bodyList = new List<Dictionary<string, object?>>();
            if (!string.IsNullOrWhiteSpace(title))
            {
                bodyList.Add(new Dictionary<string, object?>
                {
                    ["type"] = "TextBlock",
                    ["text"] = title,
                    ["weight"] = "Bolder",
                    ["size"] = "Medium",
                    ["wrap"] = true
                });
            }
            if (!string.IsNullOrWhiteSpace(desc))
            {
                bodyList.Add(new Dictionary<string, object?>
                {
                    ["type"] = "TextBlock",
                    ["text"] = desc,
                    ["wrap"] = true,
                    ["isSubtle"] = true
                });
            }

            if (fieldsArray.ValueKind == JsonValueKind.Array)
            {
                foreach (var el in fieldsArray.EnumerateArray())
                {
                    if (el.ValueKind != JsonValueKind.Object) continue;
                    var fieldId = el.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";
                    var fieldType = el.TryGetProperty("type", out var typeProp) ? typeProp.GetString() ?? "input-text" : "input-text";
                    var fieldLabel = el.TryGetProperty("label", out var labelProp) ? labelProp.GetString() ?? fieldId : fieldId;
                    var fieldRequired = el.TryGetProperty("required", out var reqProp) && reqProp.GetBoolean();
                    var fieldPlaceholder = el.TryGetProperty("placeholder", out var plProp) ? plProp.GetString() : null;

                    if (!string.IsNullOrWhiteSpace(fieldId))
                    {
                        fields.Add(new CardFieldItem(fieldId, fieldType, fieldLabel, fieldRequired, fieldPlaceholder));

                        var bodyEl = new Dictionary<string, object?>
                        {
                            ["id"] = fieldId,
                            ["isRequired"] = fieldRequired
                        };

                        switch (fieldType)
                        {
                            case "input-radio":
                                bodyEl["type"] = "Input.ChoiceSet";
                                bodyEl["label"] = fieldLabel;
                                bodyEl["style"] = "expanded";
                                bodyEl["isMultiSelect"] = false;
                                break;
                            case "input-checklist":
                                bodyEl["type"] = "Input.ChoiceSet";
                                bodyEl["label"] = fieldLabel;
                                bodyEl["style"] = "expanded";
                                bodyEl["isMultiSelect"] = true;
                                break;
                            case "input-choice":
                                bodyEl["type"] = "Input.ChoiceSet";
                                bodyEl["label"] = fieldLabel;
                                bodyEl["style"] = "compact";
                                break;
                            case "input-tagselect":
                                bodyEl["type"] = "Input.TagSelect";
                                bodyEl["label"] = fieldLabel;
                                if (el.TryGetProperty("allowCustom", out var acProp) && acProp.GetBoolean())
                                {
                                    bodyEl["allowCustom"] = true;
                                    if (el.TryGetProperty("customPlaceholder", out var cpProp))
                                        bodyEl["customPlaceholder"] = cpProp.GetString();
                                }
                                break;
                            case "input-toggle":
                                bodyEl["type"] = "Input.Toggle";
                                bodyEl["title"] = fieldLabel;
                                bodyEl["valueOn"] = "true";
                                bodyEl["valueOff"] = "false";
                                break;
                            case "input-number":
                                bodyEl["type"] = "Input.Number";
                                bodyEl["label"] = fieldLabel;
                                if (fieldPlaceholder != null) bodyEl["placeholder"] = fieldPlaceholder;
                                if (el.TryGetProperty("min", out var minProp) && minProp.TryGetInt32(out var minVal)) bodyEl["min"] = minVal;
                                if (el.TryGetProperty("max", out var maxProp) && maxProp.TryGetInt32(out var maxVal)) bodyEl["max"] = maxVal;
                                break;
                            case "input-date":
                                bodyEl["type"] = "Input.Date";
                                bodyEl["label"] = fieldLabel;
                                if (fieldPlaceholder != null) bodyEl["placeholder"] = fieldPlaceholder;
                                break;
                            default:
                                bodyEl["type"] = "Input.Text";
                                bodyEl["label"] = fieldLabel;
                                if (fieldPlaceholder != null) bodyEl["placeholder"] = fieldPlaceholder;
                                if (fieldType == "input-tel") bodyEl["style"] = "Tel";
                                if (fieldType == "input-email") bodyEl["style"] = "Email";
                                break;
                        }

                        if (el.TryGetProperty("choices", out var chProp) && chProp.ValueKind == JsonValueKind.Array)
                        {
                            var choicesList = new List<Dictionary<string, string>>();
                            foreach (var ch in chProp.EnumerateArray())
                            {
                                var chTitle = ch.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "";
                                var chVal = ch.TryGetProperty("value", out var v) ? v.GetString() ?? "" : "";
                                choicesList.Add(new Dictionary<string, string> { ["title"] = chTitle, ["value"] = chVal });
                            }
                            bodyEl["choices"] = choicesList;
                        }

                        bodyList.Add(bodyEl);
                    }
                }
            }

            var cardObj = new Dictionary<string, object?>
            {
                ["$schema"] = "http://adaptivecards.io/schemas/adaptive-card.json",
                ["type"] = "AdaptiveCard",
                ["version"] = "1.5",
                ["body"] = bodyList,
                ["actions"] = new object[]
                {
                    new Dictionary<string, object?>
                    {
                        ["type"] = "Action.Submit",
                        ["title"] = submitText,
                        ["style"] = "positive"
                    }
                }
            };

            var serialized = JsonSerializer.Serialize(cardObj, new JsonSerializerOptions { WriteIndented = true });
            return (fields, serialized);
        }
        catch
        {
            return (fields, "{}");
        }
    }

    private static string GenerateModelProperties(List<CardFieldItem> fields)
    {
        if (fields.Count == 0) return "";
        var sb = new StringBuilder();
        foreach (var f in fields)
        {
            var propName = ToPascalCase(f.Id);
            var csharpType = f.Type switch
            {
                "input-checklist" => "List<string>?",
                "input-number" => "int?",
                "input-date" => "DateTime?",
                "input-toggle" => "bool?",
                _ => "string?"
            };

            if (f.Required)
            {
                sb.AppendLine($"    [Required(ErrorMessage = {SymbolDisplay.FormatLiteral(f.Label + " is required.", true)})]");
            }
            sb.AppendLine($"    [JsonPropertyName({SymbolDisplay.FormatLiteral(f.Id, true)})]");
            sb.AppendLine($"    public {csharpType} {propName} {{ get; set; }}");
            sb.AppendLine();
        }
        return sb.ToString().TrimEnd();
    }

    private static string ToPascalCase(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return "Property";
        var sb = new StringBuilder();
        bool capitalizeNext = true;
        foreach (var c in input)
        {
            if (char.IsLetterOrDigit(c))
            {
                sb.Append(capitalizeNext ? char.ToUpperInvariant(c) : c);
                capitalizeNext = false;
            }
            else
            {
                capitalizeNext = true;
            }
        }
        if (sb.Length == 0) return "Property";
        if (char.IsDigit(sb[0])) sb.Insert(0, "Field_");
        return sb.ToString();
    }

    /// <summary>
    /// Orders nodes topologically according to directed execution flow edges (document.Edges),
    /// ensuring that activities appear in causal execution order rather than raw canvas insertion order.
    /// Handles cycles gracefully and preserves stable component ordering.
    /// </summary>
    public static List<DiagramNodeV2> TopologicallySortNodes(DiagramDocumentV2 document)
    {
        if (document.Nodes == null || document.Nodes.Count <= 1)
        {
            return document.Nodes?.ToList() ?? [];
        }

        var nodes = document.Nodes;
        var nodeById = new Dictionary<string, DiagramNodeV2>(StringComparer.Ordinal);
        var nodeOriginalIndex = new Dictionary<string, int>(StringComparer.Ordinal);
        for (int i = 0; i < nodes.Count; i++)
        {
            nodeById[nodes[i].Id] = nodes[i];
            nodeOriginalIndex[nodes[i].Id] = i;
        }

        var outgoing = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var inDegree = new Dictionary<string, int>(StringComparer.Ordinal);

        foreach (var node in nodes)
        {
            outgoing[node.Id] = [];
            inDegree[node.Id] = 0;
        }

        var seenEdges = new HashSet<(string from, string to)>();
        if (document.Edges != null)
        {
            foreach (var edge in document.Edges)
            {
                if (edge.To == null || string.IsNullOrEmpty(edge.To.Node) || string.IsNullOrEmpty(edge.From.Node))
                    continue;

                // Self loops do not affect topological sorting of other nodes
                if (string.Equals(edge.From.Node, edge.To.Node, StringComparison.Ordinal))
                    continue;

                // Back-edges flagged as loops shouldn't block the loop header from being visited
                if (edge.IsLoop == true)
                    continue;

                if (!nodeById.TryGetValue(edge.From.Node, out var srcNode) || !nodeById.ContainsKey(edge.To.Node))
                    continue;

                if (IsExceptionPort(srcNode, edge.From.Port))
                    continue;

                if (seenEdges.Add((edge.From.Node, edge.To.Node)))
                {
                    outgoing[edge.From.Node].Add(edge.To.Node);
                    inDegree[edge.To.Node]++;
                }
            }
        }

        var sorted = new List<DiagramNodeV2>(nodes.Count);
        var visited = new HashSet<string>(StringComparer.Ordinal);

        var ready = new List<string>();
        foreach (var node in nodes)
        {
            if (inDegree[node.Id] == 0)
            {
                ready.Add(node.Id);
            }
        }

        ready.Sort((a, b) => nodeOriginalIndex[a].CompareTo(nodeOriginalIndex[b]));

        while (sorted.Count < nodes.Count)
        {
            if (ready.Count == 0)
            {
                // Cycle detected among remaining unvisited nodes.
                // Pick the unvisited node with the lowest in-degree (tie-breaker: original index) to break the cycle.
                string? cycleBreaker = null;
                int minDeg = int.MaxValue;
                foreach (var node in nodes)
                {
                    if (!visited.Contains(node.Id))
                    {
                        var deg = inDegree[node.Id];
                        if (deg < minDeg)
                        {
                            minDeg = deg;
                            cycleBreaker = node.Id;
                        }
                    }
                }

                if (cycleBreaker != null)
                {
                    ready.Add(cycleBreaker);
                }
                else
                {
                    break;
                }
            }

            var currentId = ready[0];
            ready.RemoveAt(0);

            if (!visited.Add(currentId))
            {
                continue;
            }

            sorted.Add(nodeById[currentId]);

            var neighbors = outgoing[currentId];
            neighbors.Sort((a, b) => nodeOriginalIndex[a].CompareTo(nodeOriginalIndex[b]));

            var newlyReady = new List<string>();
            foreach (var neighbor in neighbors)
            {
                if (visited.Contains(neighbor))
                    continue;

                inDegree[neighbor]--;
                if (inDegree[neighbor] <= 0 && !ready.Contains(neighbor))
                {
                    newlyReady.Add(neighbor);
                }
            }

            ready.InsertRange(0, newlyReady);
        }

        return sorted;
    }
}
