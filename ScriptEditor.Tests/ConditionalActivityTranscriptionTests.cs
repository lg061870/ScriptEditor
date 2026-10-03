using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ConversaCore.TopicFlow;
using ScriptEditor.Models.Schema;
using ScriptEditor.Transcription;
using Xunit;

namespace ScriptEditor.Tests;

public class ConditionalActivityTranscriptionTests
{
    [Fact]
    public void Transcribe_ConditionalActivity_WithTrueAndFalseBranches_NestsBothAndDoesNotEmitSeparately()
    {
        var doc = new DiagramDocumentV2
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
                    Id = "qa_1",
                    Name = "QuickChoices",
                    Type = "QuickAnswerActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["question"] = "Would you like an instant quote?",
                        ["answers"] = "Yes | No",
                        ["outputVariable"] = "decisionChoice",
                        ["required"] = "true"
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "qa_1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "qa_1-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                },
                new DiagramNodeV2
                {
                    Id = "cond_1",
                    Name = "CheckDecision",
                    Type = "ConditionalActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["selectorKey"] = "decisionChoice == \"Yes\"",
                        ["leftOperand"] = "decisionChoice",
                        ["operator"] = "==",
                        ["rightOperand"] = "\"Yes\"",
                        ["cases"] = "Yes | No"
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "cond_1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input, Position = DiagramPortSideV2.Left },
                        new DiagramPortV2 { Id = "cond_1-case-yes", Name = "Yes", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output, Position = DiagramPortSideV2.Right },
                        new DiagramPortV2 { Id = "cond_1-case-no", Name = "No", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output, Position = DiagramPortSideV2.Bottom }
                    }
                },
                new DiagramNodeV2
                {
                    Id = "msg_yes",
                    Name = "ThankYouMsg",
                    Type = "SimpleActivity",
                    Data = new Dictionary<string, string> { ["message"] = "Thank you for saying Yes!" },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "msg_yes-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input }
                    }
                },
                new DiagramNodeV2
                {
                    Id = "msg_no",
                    Name = "DeclineMsg",
                    Type = "SimpleActivity",
                    Data = new Dictionary<string, string> { ["message"] = "You said No." },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "msg_no-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input }
                    }
                }
            },
            Edges = new List<DiagramEdgeV2>
            {
                new DiagramEdgeV2 { Id = "e1", From = new() { Node = "start", Port = "start-out" }, To = new() { Node = "qa_1", Port = "qa_1-in" } },
                new DiagramEdgeV2 { Id = "e2", From = new() { Node = "qa_1", Port = "qa_1-out" }, To = new() { Node = "cond_1", Port = "cond_1-in" } },
                new DiagramEdgeV2 { Id = "e3", From = new() { Node = "cond_1", Port = "cond_1-case-yes" }, To = new() { Node = "msg_yes", Port = "msg_yes-in" } },
                new DiagramEdgeV2 { Id = "e4", From = new() { Node = "cond_1", Port = "cond_1-case-no" }, To = new() { Node = "msg_no", Port = "msg_no-in" } }
            }
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(doc, "ConditionalDecisionFlow");

        // Branch activities are emitted flat at top level with fluent .When() guards
        Assert.Contains("Add(new SimpleActivity(\"ThankYouMsg\", \"Thank you for saying Yes!\")).When(\"Yes\");", csharp);
        Assert.Contains("Add(new SimpleActivity(\"DeclineMsg\", \"You said No.\")).When(\"No\");", csharp);

        // No nested CompositeActivity wrapper used
        Assert.DoesNotContain("CompositeActivity", csharp);

        // Verify compilation into a real assembly
        var result = WorkflowCompiler.CompileAndLoad(doc, "ConditionalDecisionFlow");
        Assert.True(result.Success, string.Join("\n", result.Diagnostics.Select(d => $"{d.Severity}: {d.Message} (Line {d.Line})")));
    }

    private class TestFlow : TopicFlow
    {
        public TestFlow(TopicWorkflowContext context, Microsoft.Extensions.Logging.ILogger logger, string name = "TestFlow")
            : base(context, logger, name)
        {
        }
    }

    [Fact]
    public async Task When_ExecutionGuard_SelectsMatchingBranch_AndSkipsNonMatchingBranch()
    {
        var context = new TopicWorkflowContext();
        var logger = Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance;
        var flow = new TestFlow(context, logger, "TestFlowYes");

        bool yesExecuted = false;
        bool noExecuted = false;

        context.SetValue(TopicWorkflowContext.LastAnswerKey, "Yes");

        flow.Add(SimpleActivity.Create("act_yes", ctx =>
        {
            yesExecuted = true;
        })).When("Yes");

        flow.Add(SimpleActivity.Create("act_no", ctx =>
        {
            noExecuted = true;
        })).When("No");

        var result = await flow.RunAsync();

        Assert.True(yesExecuted, "The 'Yes' activity should have executed.");
        Assert.False(noExecuted, "The 'No' activity should have been skipped.");
    }

    [Fact]
    public async Task When_ExecutionGuard_SelectsMatchingBranch_ForNo()
    {
        var context = new TopicWorkflowContext();
        var logger = Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance;
        var flow = new TestFlow(context, logger, "TestFlowNo");

        bool yesExecuted = false;
        bool noExecuted = false;

        context.SetValue(TopicWorkflowContext.LastAnswerKey, "No");

        flow.Add(SimpleActivity.Create("act_yes", ctx =>
        {
            yesExecuted = true;
        })).When("Yes");

        flow.Add(SimpleActivity.Create("act_no", ctx =>
        {
            noExecuted = true;
        })).When("No");

        var result = await flow.RunAsync();

        Assert.False(yesExecuted, "The 'Yes' activity should have been skipped.");
        Assert.True(noExecuted, "The 'No' activity should have executed.");
    }

    [Fact]
    public void Transcribe_SwitchActivity_WithCases_EmitsFlatWhenGuards_AndCompiles()
    {
        var doc = new DiagramDocumentV2
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
                    Id = "qa_1",
                    Name = "QuickChoices",
                    Type = "QuickAnswerActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["question"] = "Would you like an instant quote or to talk to an agent?",
                        ["answers"] = "Yes | No | Deje ver que dice mi perro",
                        ["outputVariable"] = "decisionChoice",
                        ["required"] = "true"
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "qa_1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "qa_1-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                },
                new DiagramNodeV2
                {
                    Id = "switch_1",
                    Name = "SwitchNode",
                    Type = "SwitchActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["valueContextKey"] = "decisionChoice",
                        ["caseKeys"] = "case-a | case-b"
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "switch_1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "switch_1-case-case-a", Name = "case-a", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output },
                        new DiagramPortV2 { Id = "switch_1-case-case-b", Name = "case-b", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                },
                new DiagramNodeV2
                {
                    Id = "msg_a1",
                    Name = "MsgA1",
                    Type = "SimpleActivity",
                    Data = new Dictionary<string, string> { ["message"] = "Branch A1 message" }
                },
                new DiagramNodeV2
                {
                    Id = "msg_a2",
                    Name = "MsgA2",
                    Type = "SimpleActivity",
                    Data = new Dictionary<string, string> { ["message"] = "Branch A2 message" }
                },
                new DiagramNodeV2
                {
                    Id = "msg_b1",
                    Name = "MsgB1",
                    Type = "SimpleActivity",
                    Data = new Dictionary<string, string> { ["message"] = "Branch B1 message" }
                },
                new DiagramNodeV2
                {
                    Id = "msg_b2",
                    Name = "MsgB2",
                    Type = "SimpleActivity",
                    Data = new Dictionary<string, string> { ["message"] = "Branch B2 message" }
                },
                new DiagramNodeV2
                {
                    Id = "done",
                    Name = "DoneNode",
                    Type = "EndActivity",
                    Data = new Dictionary<string, string> { ["endMessage"] = "Done" }
                }
            },
            Edges = new List<DiagramEdgeV2>
            {
                new DiagramEdgeV2 { Id = "e1", From = new() { Node = "start", Port = "start-out" }, To = new() { Node = "qa_1", Port = "qa_1-in" } },
                new DiagramEdgeV2 { Id = "e2", From = new() { Node = "qa_1", Port = "qa_1-out" }, To = new() { Node = "switch_1", Port = "switch_1-in" } },
                new DiagramEdgeV2 { Id = "e3", From = new() { Node = "switch_1", Port = "switch_1-case-case-a" }, To = new() { Node = "msg_a1", Port = "msg_a1-in" } },
                new DiagramEdgeV2 { Id = "e4", From = new() { Node = "msg_a1", Port = "msg_a1-out" }, To = new() { Node = "msg_a2", Port = "msg_a2-in" } },
                new DiagramEdgeV2 { Id = "e5", From = new() { Node = "msg_a2", Port = "msg_a2-out" }, To = new() { Node = "done", Port = "done-in" } },
                new DiagramEdgeV2 { Id = "e6", From = new() { Node = "switch_1", Port = "switch_1-case-case-b" }, To = new() { Node = "msg_b1", Port = "msg_b1-in" } },
                new DiagramEdgeV2 { Id = "e7", From = new() { Node = "msg_b1", Port = "msg_b1-out" }, To = new() { Node = "msg_b2", Port = "msg_b2-in" } },
                new DiagramEdgeV2 { Id = "e8", From = new() { Node = "msg_b2", Port = "msg_b2-out" }, To = new() { Node = "done", Port = "done-in" } }
            }
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(doc, "SwitchBranchFlow");

        // The branch nodes have flat .When("decisionChoice", "case-a") guards
        Assert.Contains(".When(\"decisionChoice\", \"case-a\")", csharp);
        Assert.Contains(".When(\"decisionChoice\", \"case-b\")", csharp);

        // SwitchActivity router node itself is not queued into workflow
        Assert.DoesNotContain("new SwitchActivity", csharp);

        // End activity is present
        Assert.Contains("Add(new EndActivity(\"DoneNode\", \"Done\"));", csharp);

        // Verify compilation
        var result = WorkflowCompiler.CompileAndLoad(doc, "SwitchBranchFlow");
        Assert.True(result.Success, string.Join("\n", result.Diagnostics.Select(d => $"{d.Severity}: {d.Message} (Line {d.Line})")));
    }

    [Fact]
    public async Task When_ExecutionGuard_SwitchBranch_WhenValueMismatch_SkipsBothBranches()
    {
        var context = new TopicWorkflowContext();
        var logger = Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance;
        var flow = new TestFlow(context, logger, "TestFlowMismatch");

        bool a1Executed = false;
        bool a2Executed = false;
        bool b1Executed = false;
        bool b2Executed = false;
        bool doneExecuted = false;

        // User picked "Yes", which matches neither "case-a" nor "case-b"
        context.SetValue("decisionChoice", "Yes");

        flow.Add(SimpleActivity.Create("a1", ctx => { a1Executed = true; })).When("decisionChoice", "case-a");
        flow.Add(SimpleActivity.Create("a2", ctx => { a2Executed = true; })).When("decisionChoice", "case-a");
        flow.Add(SimpleActivity.Create("b1", ctx => { b1Executed = true; })).When("decisionChoice", "case-b");
        flow.Add(SimpleActivity.Create("b2", ctx => { b2Executed = true; })).When("decisionChoice", "case-b");
        flow.Add(SimpleActivity.Create("done", ctx => { doneExecuted = true; }));

        var result = await flow.RunAsync();

        Assert.False(a1Executed, "Branch A1 should have been skipped.");
        Assert.False(a2Executed, "Branch A2 should have been skipped.");
        Assert.False(b1Executed, "Branch B1 should have been skipped.");
        Assert.False(b2Executed, "Branch B2 should have been skipped.");
        Assert.True(doneExecuted, "Done activity should have executed.");
    }
}
