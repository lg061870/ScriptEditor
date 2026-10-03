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

public class RepeatLoopTranscriptionTests
{
    private class TestFlow : TopicFlow
    {
        public TestFlow(TopicWorkflowContext context)
            : base(context, NullLogger.Instance, "TestFlow")
        {
        }
    }

    [Fact]
    public void Transcribe_RepeatActivity_FixedCount_EmitsRepeatLoopActivity_AndInLoopFluentCalls()
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
                    Id = "loop1",
                    Name = "LoopNode",
                    Type = "RepeatActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["loopMode"] = "fixed_count",
                        ["iterations"] = "3"
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "loop1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "loop1-loop-body", Name = "Loop Body", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output },
                        new DiagramPortV2 { Id = "loop1-loop-done", Name = "Done", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                },
                new DiagramNodeV2
                {
                    Id = "step1",
                    Name = "Step1",
                    Type = "SimpleActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["message"] = "Processing item..."
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "step1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "step1-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                },
                new DiagramNodeV2
                {
                    Id = "step2",
                    Name = "Step2",
                    Type = "SimpleActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["message"] = "Item processed!"
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "step2-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "step2-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                },
                new DiagramNodeV2
                {
                    Id = "done_step",
                    Name = "DoneStep",
                    Type = "SimpleActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["message"] = "All items processed successfully."
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "done_step-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "done_step-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                }
            },
            Edges = new List<DiagramEdgeV2>
            {
                new DiagramEdgeV2
                {
                    Id = "e1",
                    From = new() { Node = "start", Port = "start-out" },
                    To = new() { Node = "loop1", Port = "loop1-in" }
                },
                new DiagramEdgeV2
                {
                    Id = "e2",
                    From = new() { Node = "loop1", Port = "loop1-loop-body" },
                    To = new() { Node = "step1", Port = "step1-in" }
                },
                new DiagramEdgeV2
                {
                    Id = "e3",
                    From = new() { Node = "step1", Port = "step1-out" },
                    To = new() { Node = "step2", Port = "step2-in" }
                },
                new DiagramEdgeV2
                {
                    Id = "e4",
                    From = new() { Node = "loop1", Port = "loop1-loop-done" },
                    To = new() { Node = "done_step", Port = "done_step-in" }
                }
            }
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(doc);

        // Verify RepeatLoopActivity is added with fixed iterations
        Assert.Contains("Add(new RepeatLoopActivity(\"LoopNode\", 3))", csharp);

        // Verify loop body activities have .InLoop("LoopNode") attached
        Assert.Contains("Add(new SimpleActivity(\"Step1\", \"Processing item...\")).InLoop(\"LoopNode\")", csharp);
        Assert.Contains("Add(new SimpleActivity(\"Step2\", \"Item processed!\")).InLoop(\"LoopNode\")", csharp);

        // Verify DoneStep is emitted without .InLoop
        Assert.Contains("Add(new SimpleActivity(\"DoneStep\", \"All items processed successfully.\"))", csharp);
        Assert.DoesNotContain("DoneStep\").InLoop", csharp);
    }

    [Fact]
    public void Transcribe_RepeatActivity_UserPrompt_EmitsPromptConstructor()
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
                    Id = "loop1",
                    Name = "PromptLoop",
                    Type = "RepeatActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["loopMode"] = "user_prompt",
                        ["continuePrompt"] = "Do you want to add another item?"
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "loop1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "loop1-loop-body", Name = "Loop Body", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                },
                new DiagramNodeV2
                {
                    Id = "step1",
                    Name = "Step1",
                    Type = "SimpleActivity",
                    Data = new Dictionary<string, string> { ["message"] = "Adding item..." },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "step1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input }
                    }
                }
            },
            Edges = new List<DiagramEdgeV2>
            {
                new DiagramEdgeV2
                {
                    Id = "e1",
                    From = new() { Node = "start", Port = "start-out" },
                    To = new() { Node = "loop1", Port = "loop1-in" }
                },
                new DiagramEdgeV2
                {
                    Id = "e2",
                    From = new() { Node = "loop1", Port = "loop1-loop-body" },
                    To = new() { Node = "step1", Port = "step1-in" }
                }
            }
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(doc);

        Assert.Contains("Add(new RepeatLoopActivity(\"PromptLoop\", continuePrompt: \"Do you want to add another item?\"))", csharp);
        Assert.Contains("Add(new SimpleActivity(\"Step1\", \"Adding item...\")).InLoop(\"PromptLoop\")", csharp);
    }

    [Fact]
    public void Transcribe_RepeatActivity_WhileCondition_EmitsPredicateConstructor()
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
                    Id = "loop1",
                    Name = "WhileLoop",
                    Type = "RepeatActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["loopMode"] = "while_condition",
                        ["condition"] = "ctx.GetValue<int>(\"count\") < 5"
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "loop1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "loop1-loop-body", Name = "Loop Body", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                },
                new DiagramNodeV2
                {
                    Id = "step1",
                    Name = "Step1",
                    Type = "SimpleActivity",
                    Data = new Dictionary<string, string> { ["message"] = "Looping..." },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "step1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input }
                    }
                }
            },
            Edges = new List<DiagramEdgeV2>
            {
                new DiagramEdgeV2
                {
                    Id = "e1",
                    From = new() { Node = "start", Port = "start-out" },
                    To = new() { Node = "loop1", Port = "loop1-in" }
                },
                new DiagramEdgeV2
                {
                    Id = "e2",
                    From = new() { Node = "loop1", Port = "loop1-loop-body" },
                    To = new() { Node = "step1", Port = "step1-in" }
                }
            }
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(doc);

        Assert.Contains("Add(new RepeatLoopActivity(\"WhileLoop\", ctx => ctx.GetValue<int>(\"WhileLoop_Iteration\") <= 50 && (ctx.GetValue<int>(\"count\") < 5)))", csharp);
        Assert.Contains("Add(new SimpleActivity(\"Step1\", \"Looping...\")).InLoop(\"WhileLoop\")", csharp);
    }

    [Fact]
    public async Task Runtime_RepeatLoopActivity_ExecutesFixedIterations_ThenContinues()
    {
        var context = new TopicWorkflowContext();
        var flow = new TestFlow(context);

        int bodyExecutions = 0;
        int doneExecutions = 0;

        flow.Add(new RepeatLoopActivity("loop1", 3));
        flow.Add(SimpleActivity.Create("step1", ctx => { bodyExecutions++; })).InLoop("loop1");
        flow.Add(SimpleActivity.Create("after_loop", ctx => { doneExecutions++; }));

        var result = await flow.RunAsync();

        Assert.Equal(3, bodyExecutions);
        Assert.Equal(1, doneExecutions);
        Assert.Equal(TopicFlow.FlowState.Completed, flow.State);
    }

    [Fact]
    public async Task Runtime_RepeatLoopActivity_WhileCondition_ExecutesUntilConditionFalse()
    {
        var context = new TopicWorkflowContext();
        context.SetValue("counter", 0);
        var flow = new TestFlow(context);

        int bodyExecutions = 0;

        flow.Add(new RepeatLoopActivity("loop1", ctx => ctx.GetValue<int>("counter") < 4));
        flow.Add(SimpleActivity.Create("increment", ctx =>
        {
            var current = ctx.GetValue<int>("counter");
            ctx.SetValue("counter", current + 1);
            bodyExecutions++;
        })).InLoop("loop1");
        flow.Add(new SimpleActivity("after", "Finished while loop"));

        var result = await flow.RunAsync();

        Assert.Equal(4, bodyExecutions);
        Assert.Equal(4, context.GetValue<int>("counter"));
        Assert.Equal(TopicFlow.FlowState.Completed, flow.State);
    }

    [Fact]
    public void Transcribe_ForEachActivity_EmitsRepeatLoopActivity_WithCollectionArguments()
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
                    Id = "forEach1",
                    Name = "ForEachNode",
                    Type = "ForEachActivity",
                    Data = new Dictionary<string, string>
                    {
                        ["collectionKey"] = "Users",
                        ["itemKey"] = "user",
                        ["indexKey"] = "i"
                    },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "forEach1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "forEach1-loop-body", Name = "Loop Body", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output },
                        new DiagramPortV2 { Id = "forEach1-loop-done", Name = "Done", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                },
                new DiagramNodeV2
                {
                    Id = "step1",
                    Name = "LogUser",
                    Type = "SimpleActivity",
                    Data = new Dictionary<string, string> { ["message"] = "Processing {user}" },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "step1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "step1-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                },
                new DiagramNodeV2
                {
                    Id = "after1",
                    Name = "AllDone",
                    Type = "SimpleActivity",
                    Data = new Dictionary<string, string> { ["message"] = "Done iterating" },
                    Ports = new List<DiagramPortV2>
                    {
                        new DiagramPortV2 { Id = "after1-in", Name = "Input", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Input },
                        new DiagramPortV2 { Id = "after1-out", Name = "Output", Role = DiagramPortRoleV2.Main, Direction = DiagramPortDirectionV2.Output }
                    }
                }
            },
            Edges = new List<DiagramEdgeV2>
            {
                new DiagramEdgeV2
                {
                    Id = "e1",
                    From = new DiagramEndpointV2 { Node = "start", Port = "start-out" },
                    To = new DiagramEndpointV2 { Node = "forEach1", Port = "forEach1-in" }
                },
                new DiagramEdgeV2
                {
                    Id = "e-body",
                    From = new DiagramEndpointV2 { Node = "forEach1", Port = "forEach1-loop-body" },
                    To = new DiagramEndpointV2 { Node = "step1", Port = "step1-in" }
                },
                new DiagramEdgeV2
                {
                    Id = "e-done",
                    From = new DiagramEndpointV2 { Node = "forEach1", Port = "forEach1-loop-done" },
                    To = new DiagramEndpointV2 { Node = "after1", Port = "after1-in" }
                }
            }
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(doc, "TestTopic");

        Assert.Contains("new RepeatLoopActivity(\"ForEachNode\", \"Users\", \"user\", \"i\")", csharp);
        Assert.Contains("InLoop(\"ForEachNode\")", csharp);
    }

    [Fact]
    public async Task Runtime_RepeatLoopActivity_ForEachCollection_IteratesOverItems()
    {
        var context = new TopicWorkflowContext();
        context.SetValue("Items", new List<object?> { "Alice", "Bob", "Charlie" });
        var flow = new TestFlow(context);

        var seenUsers = new List<string>();

        flow.Add(new RepeatLoopActivity("loop1", "Items", "user", "i"));
        flow.Add(SimpleActivity.Create("processItem", ctx =>
        {
            var u = ctx.GetValue<object?>("user")?.ToString() ?? "";
            seenUsers.Add(u);
        })).InLoop("loop1");
        flow.Add(new SimpleActivity("doneNode", "Finished"));

        var result = await flow.RunAsync();

        Assert.Equal(3, seenUsers.Count);
        Assert.Equal(new[] { "Alice", "Bob", "Charlie" }, seenUsers);
        Assert.Equal(TopicFlow.FlowState.Completed, flow.State);
    }
}

