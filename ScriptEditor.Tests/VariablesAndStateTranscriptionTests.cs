using System.Collections.Generic;
using ScriptEditor.Models.Schema;
using ScriptEditor.Transcription;
using Xunit;

namespace ScriptEditor.Tests;

public class VariablesAndStateTranscriptionTests
{
    private static DiagramDocumentV2 CreateDoc(DiagramNodeV2 activityNode)
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
                activityNode,
                new DiagramNodeV2
                {
                    Id = "end",
                    Name = "End",
                    Type = "EndActivity",
                    Data = new Dictionary<string, string> { ["endMessage"] = "Done" },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "end-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input }
                    }
                }
            },
            Edges = new List<DiagramEdgeV2>
            {
                new DiagramEdgeV2
                {
                    Id = "e1",
                    From = new DiagramEndpointV2 { Node = "start", Port = "start-out" },
                    To = new DiagramEndpointV2 { Node = activityNode.Id, Port = $"{activityNode.Id}-in" }
                },
                new DiagramEdgeV2
                {
                    Id = "e2",
                    From = new DiagramEndpointV2 { Node = activityNode.Id, Port = $"{activityNode.Id}-out" },
                    To = new DiagramEndpointV2 { Node = "end", Port = "end-in" }
                }
            }
        };
    }

    [Fact]
    public void Transcribe_GlobalVariableActivity_AllMode_GeneratesGeneralPromotion()
    {
        var node = new DiagramNodeV2
        {
            Id = "promote1",
            Name = "PromoteAll",
            Type = "GlobalVariableActivity",
            Data = new Dictionary<string, string>
            {
                ["promotionMode"] = "all"
            },
            Ports = new List<DiagramPortV2>
            {
                new DiagramPortV2 { Id = "promote1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                new DiagramPortV2 { Id = "promote1-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
            }
        };

        var doc = CreateDoc(node);
        var csharp = JsonToCSharpTranscriber.Transcribe(doc, "TestTopic");

        Assert.Contains("new GlobalVariableActivity(\"PromoteAll\", _conversationContext, NullLogger<GlobalVariableActivity>.Instance)", csharp);
        Assert.Contains("private readonly IConversationContext _conversationContext;", csharp);

        var result = WorkflowCompiler.CompileAndLoad(doc, "TestTopic");
        Assert.True(result.Success, string.Join("; ", result.Diagnostics));
    }

    [Fact]
    public void Transcribe_GlobalVariableActivity_SpecificMode_GeneratesTypedPromotion()
    {
        var node = new DiagramNodeV2
        {
            Id = "promote1",
            Name = "PromoteUserScore",
            Type = "GlobalVariableActivity",
            Data = new Dictionary<string, string>
            {
                ["promotionMode"] = "specific",
                ["sourceKey"] = "userScore",
                ["globalKey"] = "Global_UserScore"
            },
            Ports = new List<DiagramPortV2>
            {
                new DiagramPortV2 { Id = "promote1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                new DiagramPortV2 { Id = "promote1-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
            }
        };

        var doc = CreateDoc(node);
        var csharp = JsonToCSharpTranscriber.Transcribe(doc, "TestTopic");

        Assert.Contains("new GlobalVariableActivity<object>(\"PromoteUserScore\", \"userScore\", _conversationContext, NullLogger<GlobalVariableActivity<object>>.Instance, \"Global_UserScore\")", csharp);
        Assert.Contains("private readonly IConversationContext _conversationContext;", csharp);

        var result = WorkflowCompiler.CompileAndLoad(doc, "TestTopic");
        Assert.True(result.Success, string.Join("; ", result.Diagnostics));
    }

    [Fact]
    public void Transcribe_DumpCtxActivity_GeneratesDevelopmentModeParameter()
    {
        var node = new DiagramNodeV2
        {
            Id = "dump1",
            Name = "DumpContext",
            Type = "DumpCtxActivity",
            Data = new Dictionary<string, string>
            {
                ["developmentMode"] = "true"
            },
            Ports = new List<DiagramPortV2>
            {
                new DiagramPortV2 { Id = "dump1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                new DiagramPortV2 { Id = "dump1-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
            }
        };

        var doc = CreateDoc(node);
        var csharp = JsonToCSharpTranscriber.Transcribe(doc, "TestTopic");

        Assert.Contains("new DumpCtxActivity(\"DumpContext\", true)", csharp);

        var result = WorkflowCompiler.CompileAndLoad(doc, "TestTopic");
        Assert.True(result.Success, string.Join("; ", result.Diagnostics));
    }

    [Fact]
    public void Transcribe_ResetActivity_GeneratesResetMessageParameter()
    {
        var node = new DiagramNodeV2
        {
            Id = "reset1",
            Name = "ResetSession",
            Type = "ResetActivity",
            Data = new Dictionary<string, string>
            {
                ["resetMessage"] = "Conversation has been reset."
            },
            Ports = new List<DiagramPortV2>
            {
                new DiagramPortV2 { Id = "reset1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                new DiagramPortV2 { Id = "reset1-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
            }
        };

        var doc = CreateDoc(node);
        var csharp = JsonToCSharpTranscriber.Transcribe(doc, "TestTopic");

        Assert.Contains("new ResetActivity(\"ResetSession\", \"Conversation has been reset.\")", csharp);

        var result = WorkflowCompiler.CompileAndLoad(doc, "TestTopic");
        Assert.True(result.Success, string.Join("; ", result.Diagnostics));
    }
}
