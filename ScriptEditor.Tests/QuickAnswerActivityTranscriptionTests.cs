using System.Collections.Generic;
using System.Linq;
using ScriptEditor.Models.Schema;
using ScriptEditor.Transcription;
using Xunit;

namespace ScriptEditor.Tests;

public class QuickAnswerActivityTranscriptionTests
{
    [Fact]
    public void Transcribe_QuickAnswerActivity_StaticOptions_CompilesAndTranscribesCleanly()
    {
        var doc = new DiagramDocumentV2
        {
            Nodes = new List<DiagramNodeV2>
            {
                new DiagramNodeV2
                {
                    Id = "qa_1",
                    Name = "ChoosePlan",
                    Type = "QuickAnswerActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["question"] = "Which plan do you prefer?",
                        ["optionsMode"] = "static",
                        ["answers"] = "Basic | Premium | VIP",
                        ["outputVariable"] = "selectedPlan",
                        ["required"] = "true"
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "qa_1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "qa_1-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                }
            },
            Edges = new List<DiagramEdgeV2>()
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(doc, "ChoosePlanFlow");

        Assert.Contains("new QuickAnswerActivity(\"ChoosePlan\", \"Which plan do you prefer?\", new string[]", csharp);
        Assert.Contains("\"Basic\", \"Premium\", \"VIP\"", csharp);
        Assert.Contains("isRequired: true", csharp);
        Assert.Contains("outputVariable: \"selectedPlan\"", csharp);

        // Verify it compiles into a real in-memory assembly
        var result1 = WorkflowCompiler.CompileAndLoad(doc, "ChoosePlanFlow");
        Assert.True(result1.Success, string.Join("\n", result1.Diagnostics.Select(d => d.Message)));
    }

    [Fact]
    public void Transcribe_QuickAnswerActivity_VariableOptions_CompilesAndRoundTrips()
    {
        var doc = new DiagramDocumentV2
        {
            Nodes = new List<DiagramNodeV2>
            {
                new DiagramNodeV2
                {
                    Id = "qa_2",
                    Name = "PickVehicle",
                    Type = "QuickAnswerActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["question"] = "Select your vehicle:",
                        ["optionsMode"] = "variable",
                        ["answersVariable"] = "userVehicles",
                        ["outputVariable"] = "chosenVehicle",
                        ["required"] = "false"
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "qa_2-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "qa_2-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                }
            },
            Edges = new List<DiagramEdgeV2>()
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(doc, "PickVehicleFlow");

        Assert.Contains("new QuickAnswerActivity(\"PickVehicle\", \"Select your vehicle:\", \"userVehicles\"", csharp);
        Assert.Contains("isRequired: false", csharp);
        Assert.Contains("outputVariable: \"chosenVehicle\"", csharp);

        // Verify compilation
        var result2 = WorkflowCompiler.CompileAndLoad(doc, "PickVehicleFlow");
        Assert.True(result2.Success, string.Join("\n", result2.Diagnostics.Select(d => d.Message)));

        // Verify round-trip parsing back to DiagramDocumentV2
        var parsedDoc = CSharpToJsonParser.Parse(csharp);
        var parsedNode = parsedDoc.Nodes.FirstOrDefault(n => n.Type == "QuickAnswerActivity");
        Assert.NotNull(parsedNode);
        Assert.Equal("PickVehicle", parsedNode.Name ?? parsedNode.Id);
        Assert.Equal("Select your vehicle:", parsedNode.Data["question"]);
        Assert.Equal("userVehicles", parsedNode.Data["answersVariable"]);
        Assert.Equal("variable", parsedNode.Data["optionsMode"]);
        Assert.Equal("chosenVehicle", parsedNode.Data["outputVariable"]);
        Assert.Equal("false", parsedNode.Data["required"]);
    }
}
