using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using ConversaCore.Models;
using ConversaCore.TopicFlow;
using ConversaCore.TopicFlow.Activities;
using Microsoft.Extensions.Logging.Abstractions;
using ScriptEditor.Models.Schema;
using ScriptEditor.Transcription;
using Xunit;

namespace ScriptEditor.Tests;

public class SetVariableActivityTranscriptionTests
{
    private static DiagramDocumentV2 CreateDocWithSetVariable(string varName, string value)
    {
        return new DiagramDocumentV2
        {
            Nodes = new List<DiagramNodeV2>
            {
                new DiagramNodeV2
                {
                    Id = "start",
                    Name = "Start",
                    Type = "StartNode",
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "start-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                },
                new DiagramNodeV2
                {
                    Id = "set1",
                    Name = "SetVar",
                    Type = "SetVariableActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["variableName"] = varName,
                        ["value"] = value
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "set1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "set1-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                }
            },
            Edges = new List<DiagramEdgeV2>
            {
                new DiagramEdgeV2
                {
                    Id = "e1",
                    From = new DiagramEndpointV2 { Node = "start", Port = "start-out" },
                    To = new DiagramEndpointV2 { Node = "set1", Port = "set1-in" }
                }
            }
        };
    }

    [Fact]
    public void Transcribe_ArithmeticExpression_GeneratesDynamicMathLambda()
    {
        var doc = CreateDocWithSetVariable("count", "{count} + 1");
        var csharp = JsonToCSharpTranscriber.Transcribe(doc, "TestTopic");

        Assert.Contains("SetVariableActivity", csharp);
        Assert.Contains("Func<double, object?>", csharp);
        Assert.Contains("System.Convert.ToDouble", csharp);
    }

    [Fact]
    public void Transcribe_ArithmeticWithAssignment_StripsLeftSide()
    {
        var doc = CreateDocWithSetVariable("count", "{count} = {count} + 1");
        var csharp = JsonToCSharpTranscriber.Transcribe(doc, "TestTopic");

        Assert.Contains("SetVariableActivity", csharp);
        Assert.Contains("Func<double, object?>", csharp);
        Assert.DoesNotContain("{count} =", csharp);
    }

    [Fact]
    public void Transcribe_RangeExpression_GeneratesEnumerableRange()
    {
        var doc = CreateDocWithSetVariable("Numbers", "1..5");
        var csharp = JsonToCSharpTranscriber.Transcribe(doc, "TestTopic");

        Assert.Contains("SetVariableActivity", csharp);
        Assert.Contains("System.Linq.Enumerable.Range", csharp);
    }

    [Fact]
    public void Transcribe_ListLiteral_GeneratesList()
    {
        var doc = CreateDocWithSetVariable("Items", "[\"apple\", \"banana\", \"cherry\"]");
        var csharp = JsonToCSharpTranscriber.Transcribe(doc, "TestTopic");

        Assert.Contains("SetVariableActivity", csharp);
        Assert.Contains("new System.Collections.Generic.List<object?>", csharp);
        Assert.Contains("\"apple\"", csharp);
        Assert.Contains("\"banana\"", csharp);
        Assert.Contains("\"cherry\"", csharp);
    }
}
