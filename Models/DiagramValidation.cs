namespace ScriptEditor.Models;

public enum DiagramValidationSeverity
{
    Warning = 0,
    Error = 1
}

public sealed class DiagramValidationIssue
{
    public required string Code { get; init; }

    public required string Message { get; init; }

    public DiagramValidationSeverity Severity { get; init; } = DiagramValidationSeverity.Error;

    public string? NodeId { get; init; }

    public string? EdgeId { get; init; }
}

public static class DiagramValidator
{
    public static List<DiagramValidationIssue> Validate(DiagramDocument document)
    {
        var issues = new List<DiagramValidationIssue>();

        document.Nodes ??= [];
        document.Edges ??= [];
        document.Cards ??= [];
        document.Models ??= [];

        var modelById = BuildAdaptiveModelIndex(document, issues);
        var cardById = BuildAdaptiveCardIndex(document, modelById, issues);

        var portById = new Dictionary<string, (DiagramNode Node, DiagramPort Port)>(StringComparer.Ordinal);
        foreach (var node in document.Nodes)
        {
            foreach (var port in node.Ports)
            {
                if (string.IsNullOrWhiteSpace(port.Id))
                {
                    continue;
                }

                if (!portById.TryAdd(port.Id, (node, port)))
                {
                    issues.Add(new DiagramValidationIssue
                    {
                        Code = "DUPLICATE_PORT_ID",
                        Message = $"Port id '{port.Id}' is used by multiple nodes.",
                        Severity = DiagramValidationSeverity.Error,
                        NodeId = node.Id
                    });
                }
            }
        }

        if (!document.Nodes.Any(n => IsType(n.Type, "chat-input", "chatinput", "usermessage")))
        {
            issues.Add(new DiagramValidationIssue
            {
                Code = "MISSING_ENTRY_NODE",
                Message = "Script must contain an entry node (ChatInput).",
                Severity = DiagramValidationSeverity.Error
            });
        }

        if (!document.Nodes.Any(n => IsType(n.Type, "chat-output", "chatoutput")))
        {
            issues.Add(new DiagramValidationIssue
            {
                Code = "MISSING_OUTPUT_NODE",
                Message = "Script must contain an output node (ChatOutput).",
                Severity = DiagramValidationSeverity.Error
            });
        }

        var inputEdgeCount = new Dictionary<string, int>(StringComparer.Ordinal);
        var connectedNodes = new HashSet<string>(StringComparer.Ordinal);

        foreach (var edge in document.Edges)
        {
            if (string.IsNullOrWhiteSpace(edge.From.Port))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "EDGE_SOURCE_MISSING",
                    Message = $"Edge '{edge.Id}' is missing a source port.",
                    Severity = DiagramValidationSeverity.Error,
                    EdgeId = edge.Id
                });

                continue;
            }

            if (!portById.TryGetValue(edge.From.Port, out var sourceMeta))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "EDGE_SOURCE_UNKNOWN",
                    Message = $"Edge '{edge.Id}' references unknown source port '{edge.From.Port}'.",
                    Severity = DiagramValidationSeverity.Error,
                    EdgeId = edge.Id
                });

                continue;
            }

            connectedNodes.Add(sourceMeta.Node.Id);
            if (!string.Equals(sourceMeta.Port.Direction, "output", StringComparison.OrdinalIgnoreCase))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "EDGE_SOURCE_DIRECTION",
                    Message = $"Edge '{edge.Id}' source port '{edge.From.Port}' must be an output port.",
                    Severity = DiagramValidationSeverity.Error,
                    EdgeId = edge.Id,
                    NodeId = sourceMeta.Node.Id
                });
            }

            var targetPortId = edge.To?.Port;
            if (string.IsNullOrWhiteSpace(targetPortId))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "DANGLING_EDGE",
                    Message = $"Edge '{edge.Id}' is dangling and not attached to a target port.",
                    Severity = DiagramValidationSeverity.Warning,
                    EdgeId = edge.Id
                });

                continue;
            }

            if (!portById.TryGetValue(targetPortId, out var targetMeta))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "EDGE_TARGET_UNKNOWN",
                    Message = $"Edge '{edge.Id}' references unknown target port '{targetPortId}'.",
                    Severity = DiagramValidationSeverity.Error,
                    EdgeId = edge.Id
                });

                continue;
            }

            connectedNodes.Add(targetMeta.Node.Id);
            if (!string.Equals(targetMeta.Port.Direction, "input", StringComparison.OrdinalIgnoreCase))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "EDGE_TARGET_DIRECTION",
                    Message = $"Edge '{edge.Id}' target port '{targetPortId}' must be an input port.",
                    Severity = DiagramValidationSeverity.Error,
                    EdgeId = edge.Id,
                    NodeId = targetMeta.Node.Id
                });
            }

            if (!TypesCompatible(sourceMeta.Port.Type, targetMeta.Port.Type))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "PORT_TYPE_MISMATCH",
                    Message = $"Edge '{edge.Id}' connects incompatible port types ('{sourceMeta.Port.Type}' -> '{targetMeta.Port.Type}').",
                    Severity = DiagramValidationSeverity.Error,
                    EdgeId = edge.Id
                });
            }

            if (!inputEdgeCount.TryAdd(targetPortId, 1))
            {
                inputEdgeCount[targetPortId] += 1;
            }
        }

        foreach (var pair in inputEdgeCount.Where(p => p.Value > 1))
        {
            issues.Add(new DiagramValidationIssue
            {
                Code = "INPUT_PORT_MULTIPLE_EDGES",
                Message = $"Input port '{pair.Key}' has {pair.Value} incoming edges, but only one is allowed.",
                Severity = DiagramValidationSeverity.Error
            });
        }

        foreach (var node in document.Nodes)
        {
            if (!connectedNodes.Contains(node.Id))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "DISCONNECTED_NODE",
                    Message = $"Node '{node.Id}' is disconnected from the graph.",
                    Severity = DiagramValidationSeverity.Error,
                    NodeId = node.Id
                });
            }

            ValidateAdaptiveNode(node, cardById, modelById, issues);
        }

        return issues;
    }

    private static Dictionary<string, DiagramAdaptiveModelDefinition> BuildAdaptiveModelIndex(DiagramDocument document, List<DiagramValidationIssue> issues)
    {
        var models = new Dictionary<string, DiagramAdaptiveModelDefinition>(StringComparer.OrdinalIgnoreCase);

        foreach (var model in document.Models)
        {
            model.Id = (model.Id ?? string.Empty).Trim();
            model.Name = (model.Name ?? string.Empty).Trim();
            model.BaseType = (model.BaseType ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(model.Id))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "ADAPTIVE_MODEL_ID_MISSING",
                    Message = "Adaptive model definitions require a non-empty id.",
                    Severity = DiagramValidationSeverity.Error
                });
                continue;
            }

            if (!models.TryAdd(model.Id, model))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "ADAPTIVE_MODEL_DUPLICATE_ID",
                    Message = $"Adaptive model id '{model.Id}' is duplicated.",
                    Severity = DiagramValidationSeverity.Error
                });
                continue;
            }

            if (string.IsNullOrWhiteSpace(model.Name))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "ADAPTIVE_MODEL_NAME_MISSING",
                    Message = $"Adaptive model '{model.Id}' is missing a display/class name.",
                    Severity = DiagramValidationSeverity.Warning
                });
            }

            if (string.IsNullOrWhiteSpace(model.BaseType))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "ADAPTIVE_MODEL_BASETYPE_MISSING",
                    Message = $"Adaptive model '{model.Id}' is missing a base type.",
                    Severity = DiagramValidationSeverity.Warning
                });
            }
        }

        return models;
    }

    private static Dictionary<string, DiagramAdaptiveCardDefinition> BuildAdaptiveCardIndex(
        DiagramDocument document,
        IReadOnlyDictionary<string, DiagramAdaptiveModelDefinition> models,
        List<DiagramValidationIssue> issues)
    {
        var cards = new Dictionary<string, DiagramAdaptiveCardDefinition>(StringComparer.OrdinalIgnoreCase);

        foreach (var card in document.Cards)
        {
            card.Id = (card.Id ?? string.Empty).Trim();
            card.Name = (card.Name ?? string.Empty).Trim();
            card.BaseType = (card.BaseType ?? string.Empty).Trim();
            card.ModelRef = (card.ModelRef ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(card.Id))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "ADAPTIVE_CARD_ID_MISSING",
                    Message = "Adaptive card definitions require a non-empty id.",
                    Severity = DiagramValidationSeverity.Error
                });
                continue;
            }

            if (!cards.TryAdd(card.Id, card))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "ADAPTIVE_CARD_DUPLICATE_ID",
                    Message = $"Adaptive card id '{card.Id}' is duplicated.",
                    Severity = DiagramValidationSeverity.Error
                });
                continue;
            }

            if (string.IsNullOrWhiteSpace(card.Name))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "ADAPTIVE_CARD_NAME_MISSING",
                    Message = $"Adaptive card '{card.Id}' is missing a display/class name.",
                    Severity = DiagramValidationSeverity.Warning
                });
            }

            if (string.IsNullOrWhiteSpace(card.BaseType))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "ADAPTIVE_CARD_BASETYPE_MISSING",
                    Message = $"Adaptive card '{card.Id}' is missing a base type.",
                    Severity = DiagramValidationSeverity.Warning
                });
            }

            if (string.IsNullOrWhiteSpace(card.ModelRef))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "ADAPTIVE_CARD_MODELREF_MISSING",
                    Message = $"Adaptive card '{card.Id}' should reference a model id.",
                    Severity = DiagramValidationSeverity.Warning
                });
                continue;
            }

            if (!models.ContainsKey(card.ModelRef))
            {
                issues.Add(new DiagramValidationIssue
                {
                    Code = "ADAPTIVE_CARD_MODELREF_UNKNOWN",
                    Message = $"Adaptive card '{card.Id}' references unknown model '{card.ModelRef}'.",
                    Severity = DiagramValidationSeverity.Error
                });
            }
        }

        return cards;
    }

    private static void ValidateAdaptiveNode(
        DiagramNode node,
        IReadOnlyDictionary<string, DiagramAdaptiveCardDefinition> cards,
        IReadOnlyDictionary<string, DiagramAdaptiveModelDefinition> models,
        List<DiagramValidationIssue> issues)
    {
        if (!IsType(node.Type, "adaptive-card-activity", "adaptivecardactivity", "adaptive-card"))
        {
            return;
        }

        var cardRef = GetNodeData(node, "cardRef", "cardId", "card");
        var modelRef = GetNodeData(node, "modelRef", "modelId", "model");

        if (string.IsNullOrWhiteSpace(cardRef))
        {
            issues.Add(new DiagramValidationIssue
            {
                Code = "ADAPTIVE_NODE_CARDREF_MISSING",
                Message = $"Adaptive node '{node.Id}' is missing data.cardRef.",
                Severity = DiagramValidationSeverity.Error,
                NodeId = node.Id
            });
        }
        else if (!cards.TryGetValue(cardRef, out var cardDef))
        {
            issues.Add(new DiagramValidationIssue
            {
                Code = "ADAPTIVE_NODE_CARDREF_UNKNOWN",
                Message = $"Adaptive node '{node.Id}' references unknown card '{cardRef}'.",
                Severity = DiagramValidationSeverity.Error,
                NodeId = node.Id
            });
        }
        else if (!string.IsNullOrWhiteSpace(modelRef) &&
                 !string.IsNullOrWhiteSpace(cardDef.ModelRef) &&
                 !string.Equals(cardDef.ModelRef, modelRef, StringComparison.OrdinalIgnoreCase))
        {
            issues.Add(new DiagramValidationIssue
            {
                Code = "ADAPTIVE_NODE_MODELREF_MISMATCH",
                Message = $"Adaptive node '{node.Id}' uses model '{modelRef}', but card '{cardDef.Id}' points to '{cardDef.ModelRef}'.",
                Severity = DiagramValidationSeverity.Warning,
                NodeId = node.Id
            });
        }

        if (string.IsNullOrWhiteSpace(modelRef))
        {
            issues.Add(new DiagramValidationIssue
            {
                Code = "ADAPTIVE_NODE_MODELREF_MISSING",
                Message = $"Adaptive node '{node.Id}' is missing data.modelRef.",
                Severity = DiagramValidationSeverity.Error,
                NodeId = node.Id
            });
        }
        else if (!models.ContainsKey(modelRef))
        {
            issues.Add(new DiagramValidationIssue
            {
                Code = "ADAPTIVE_NODE_MODELREF_UNKNOWN",
                Message = $"Adaptive node '{node.Id}' references unknown model '{modelRef}'.",
                Severity = DiagramValidationSeverity.Error,
                NodeId = node.Id
            });
        }
    }

    private static string GetNodeData(DiagramNode node, params string[] keys)
    {
        if (node.Data is null || node.Data.Count == 0)
        {
            return string.Empty;
        }

        foreach (var key in keys)
        {
            if (node.Data.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }

            var pair = node.Data.FirstOrDefault(entry => string.Equals(entry.Key, key, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(pair.Value))
            {
                return pair.Value.Trim();
            }
        }

        return string.Empty;
    }

    private static bool TypesCompatible(string? outputType, string? inputType)
    {
        var source = NormalizeType(outputType);
        var target = NormalizeType(inputType);
        return source == target || source == "any" || target == "any";
    }

    private static string NormalizeType(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return string.IsNullOrWhiteSpace(normalized) ? "string" : normalized;
    }

    private static bool IsType(string? value, params string[] expected)
    {
        var key = NormalizeNodeType(value);
        return expected.Any(e => string.Equals(NormalizeNodeType(e), key, StringComparison.Ordinal));
    }

    private static string NormalizeNodeType(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var chars = value.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray();
        return new string(chars);
    }
}
