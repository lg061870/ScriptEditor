using ScriptEditor.Models.Schema;
using ScriptEditor.Transcription;

namespace ScriptEditor.Tests;

/// <summary>
/// Phase 3.2's explicit acceptance criteria: "Round-trip test: JSON -> C#
/// -> JSON produces an equivalent document." "Equivalent" here means node
/// type/name/data survive, and edges form the same sequential chain the
/// original document had -- not byte-identical DiagramDocumentV2 (ids,
/// exact port ids, and X/Y positions are not recoverable from C# text,
/// since Add(...) calls carry none of that -- see CSharpToJsonParser's
/// doc comment for why edges specifically can only round-trip as a
/// sequential chain).
/// </summary>
public class RoundTripTests
{
    [Fact]
    public void RoundTrip_PreservesNodeTypesNamesAndData_ForVerifiedCompilableTypes()
    {
        var original = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("n1", "Welcome", "SimpleActivity", new() { ["message"] = "Hi there!" }),
                MakeNode("n2", "Pause1", "DelayActivity", new() { ["durationMs"] = "2000", ["showTyping"] = "true" }),
                MakeNode("n3", "GoToQuote", "TriggerTopicActivity", new() { ["topicToTrigger"] = "QuoteGenerationTopic", ["waitForCompletion"] = "true" }),
                MakeNode("n4", "Bye", "EndActivity", new()),
            ],
            Edges = SequentialEdges("n1", "n2", "n3", "n4"),
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(original);
        var roundTripped = CSharpToJsonParser.Parse(csharp);

        Assert.Equal(original.Nodes.Count, roundTripped.Nodes.Count);
        for (var i = 0; i < original.Nodes.Count; i++)
        {
            var before = original.Nodes[i];
            var after = roundTripped.Nodes[i];
            Assert.Equal(before.Type, after.Type);
            Assert.Equal(before.Name, after.Name);
            Assert.Equal(before.Data, after.Data);
        }

        // Sequential chain preserved: n1->n2->n3->n4, same order as input.
        Assert.Equal(original.Nodes.Count - 1, roundTripped.Edges.Count);
        for (var i = 0; i < roundTripped.Edges.Count; i++)
        {
            Assert.Equal(roundTripped.Nodes[i].Id, roundTripped.Edges[i].From.Node);
            Assert.Equal(roundTripped.Nodes[i + 1].Id, roundTripped.Edges[i].To!.Node);
        }
    }

    [Fact]
    public void RoundTrip_PreservesGenericFallbackTypeDataViaObjectInitializer()
    {
        // A type with no per-type generator (falls back to the generic
        // path both when transcribing and when parsing).
        var original = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("n1", "Score", "SemanticQueryActivity", new() { ["ruleSet"] = "RiskRules", ["threshold"] = "5" }),
            ],
            Edges = [],
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(original);
        var roundTripped = CSharpToJsonParser.Parse(csharp);

        var node = Assert.Single(roundTripped.Nodes);
        Assert.Equal("SemanticQueryActivity", node.Type);
        Assert.Equal("Score", node.Name);
        Assert.Equal("RiskRules", node.Data["ruleSet"]);
        Assert.Equal("5", node.Data["threshold"]);
    }

    private static DiagramNodeV2 MakeNode(string id, string name, string type, Dictionary<string, string> data) => new()
    {
        Id = id,
        Name = name,
        Type = type,
        Data = data,
        Ports =
        [
            new DiagramPortV2 { Id = $"{id}-in", Name = "Input", Direction = DiagramPortDirectionV2.Input, Role = DiagramPortRoleV2.Main, Type = "flow", Position = DiagramPortSideV2.Left },
            new DiagramPortV2 { Id = $"{id}-out", Name = "Output", Direction = DiagramPortDirectionV2.Output, Role = DiagramPortRoleV2.Main, Type = "flow", Position = DiagramPortSideV2.Right },
        ],
    };

    private static List<DiagramEdgeV2> SequentialEdges(params string[] nodeIds)
    {
        var edges = new List<DiagramEdgeV2>();
        for (var i = 0; i < nodeIds.Length - 1; i++)
        {
            edges.Add(new DiagramEdgeV2
            {
                Id = $"e{i + 1}",
                From = new DiagramEndpointV2 { Node = nodeIds[i], Port = $"{nodeIds[i]}-out" },
                To = new DiagramEndpointV2 { Node = nodeIds[i + 1], Port = $"{nodeIds[i + 1]}-in" },
            });
        }
        return edges;
    }
}
