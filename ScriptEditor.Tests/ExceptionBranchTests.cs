using ConversaCore.TopicFlow;
using ScriptEditor.Models.Schema;
using ScriptEditor.Transcription;
using Xunit;

namespace ScriptEditor.Tests;

public class ExceptionBranchTests
{
    [Fact]
    public void Transcribe_NestsExceptionActivity_WhenConnectedToExceptionPort()
    {
        var doc = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("start", "Start", "StartNode", new()),
                MakeNode("welcome", "Welcome", "SimpleActivity", new() { ["message"] = "Hello!" }),
                MakeNode("pause1", "Pause1", "DelayActivity", new() { ["durationMs"] = "1000", ["showTyping"] = "true" }),
                MakeNode("nextMsg", "NextMsg", "SimpleActivity", new() { ["message"] = "Next happy step" }),
            ],
            Edges =
            [
                new DiagramEdgeV2 { Id = "e1", From = new() { Node = "start", Port = "start-out" }, To = new() { Node = "welcome", Port = "welcome-in" } },
                new DiagramEdgeV2 { Id = "e2", From = new() { Node = "welcome", Port = "welcome-out" }, To = new() { Node = "nextMsg", Port = "nextMsg-in" } },
                new DiagramEdgeV2 { Id = "e3", From = new() { Node = "welcome", Port = "welcome-exc" }, To = new() { Node = "pause1", Port = "pause1-in" } },
            ]
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(doc);

        // Pause1 should be nested in Welcome's OnExceptionActivity
        Assert.Contains("OnExceptionActivity = new DelayActivity(\"Pause1\", TimeSpan.FromMilliseconds(1000))", csharp);
        // NextMsg must be in the top-level Add
        Assert.Contains("Add(new SimpleActivity(\"NextMsg\", \"Next happy step\"))", csharp);
        // Pause1 must NOT be added as a separate top-level Add call
        Assert.DoesNotContain("Add(new DelayActivity(\"Pause1\"", csharp);
    }

    [Fact]
    public void Transcribe_NestsMultiStepExceptionBranch_IntoCompositeActivity()
    {
        var doc = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("start", "Start", "StartNode", new()),
                MakeNode("welcome", "Welcome", "SimpleActivity", new() { ["message"] = "Hello!" }),
                MakeNode("pause1", "Pause1", "DelayActivity", new() { ["durationMs"] = "1000" }),
                MakeNode("apology", "Apology", "SimpleActivity", new() { ["message"] = "Sorry, something went wrong." }),
                MakeNode("endNode", "EndNode", "EndActivity", new()),
                MakeNode("nextMsg", "NextMsg", "SimpleActivity", new() { ["message"] = "Happy path continues" }),
            ],
            Edges =
            [
                new DiagramEdgeV2 { Id = "e1", From = new() { Node = "start", Port = "start-out" }, To = new() { Node = "welcome", Port = "welcome-in" } },
                new DiagramEdgeV2 { Id = "e2", From = new() { Node = "welcome", Port = "welcome-out" }, To = new() { Node = "nextMsg", Port = "nextMsg-in" } },
                // Exception branch chain: welcome -> pause1 -> apology -> endNode
                new DiagramEdgeV2 { Id = "e3", From = new() { Node = "welcome", Port = "welcome-exc" }, To = new() { Node = "pause1", Port = "pause1-in" } },
                new DiagramEdgeV2 { Id = "e4", From = new() { Node = "pause1", Port = "pause1-out" }, To = new() { Node = "apology", Port = "apology-in" } },
                new DiagramEdgeV2 { Id = "e5", From = new() { Node = "apology", Port = "apology-out" }, To = new() { Node = "endNode", Port = "endNode-in" } },
            ]
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(doc);

        // The multi-step exception branch must be wrapped in a CompositeActivity
        Assert.Contains("OnExceptionActivity = new CompositeActivity(\"Welcome_ExceptionFlow\", new TopicFlowActivity[]", csharp);
        Assert.Contains("new DelayActivity(\"Pause1\", TimeSpan.FromMilliseconds(1000))", csharp);
        Assert.Contains("new SimpleActivity(\"Apology\", \"Sorry, something went wrong.\")", csharp);
        Assert.Contains("new EndActivity(\"EndNode\")", csharp);

        // None of the exception branch nodes should be added as top-level Add statements
        Assert.DoesNotContain("Add(new DelayActivity(\"Pause1\"", csharp);
        Assert.DoesNotContain("Add(new SimpleActivity(\"Apology\"", csharp);
        Assert.DoesNotContain("Add(new EndActivity(\"EndNode\"", csharp);

        // Happy path must be enqueued
        Assert.Contains("Add(new SimpleActivity(\"NextMsg\", \"Happy path continues\"))", csharp);
    }

    [Fact]
    public void RoundTrip_PreservesExceptionBranchConnectivity()
    {
        var original = new DiagramDocumentV2
        {
            Nodes =
            [
                MakeNode("welcome", "Welcome", "SimpleActivity", new() { ["message"] = "Hello!" }),
                MakeNode("pause1", "Pause1", "DelayActivity", new() { ["durationMs"] = "1000", ["showTyping"] = "true" }),
                MakeNode("nextMsg", "NextMsg", "SimpleActivity", new() { ["message"] = "Next" }),
            ],
            Edges =
            [
                new DiagramEdgeV2 { Id = "e1", From = new() { Node = "welcome", Port = "welcome-out" }, To = new() { Node = "nextMsg", Port = "nextMsg-in" } },
                new DiagramEdgeV2 { Id = "e2", From = new() { Node = "welcome", Port = "welcome-exc" }, To = new() { Node = "pause1", Port = "pause1-in" } },
            ]
        };

        var csharp = JsonToCSharpTranscriber.Transcribe(original);
        var roundTripped = CSharpToJsonParser.Parse(csharp);

        // Check that all 3 nodes survived
        Assert.Contains(roundTripped.Nodes, n => n.Id == "Welcome");
        Assert.Contains(roundTripped.Nodes, n => n.Id == "Pause1");
        Assert.Contains(roundTripped.Nodes, n => n.Id == "NextMsg");

        // Check that the exception edge exists
        var excEdge = roundTripped.Edges.FirstOrDefault(e => e.From.Port.EndsWith("-exc"));
        Assert.NotNull(excEdge);
        Assert.Equal("Welcome", excEdge.From.Node);
        Assert.Equal("Pause1", excEdge.To!.Node);

        // Check that happy path edge exists
        var happyEdge = roundTripped.Edges.FirstOrDefault(e => e.From.Node == "Welcome" && e.To!.Node == "NextMsg");
        Assert.NotNull(happyEdge);
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
            new DiagramPortV2 { Id = $"{id}-exc", Name = "Exception", Direction = DiagramPortDirectionV2.Output, Role = DiagramPortRoleV2.Exception, Type = "flow", Position = DiagramPortSideV2.Bottom },
        ],
    };
    private class TestFlow : TopicFlow
    {
        public TestFlow(TopicWorkflowContext context, Microsoft.Extensions.Logging.ILogger logger, string name = "TestFlow")
            : base(context, logger, name)
        {
        }
    }

    [Fact]
    public async Task Runtime_OnExceptionActivity_InterceptsExceptionAndEndsTopicFlow()
    {
        var context = new TopicWorkflowContext();
        var nullLogger = Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance;
        var flow = new TestFlow(context, nullLogger, "TestFlow");

        bool step2Ran = false;
        bool errorHandlerRan = false;

        // Step 1: throws an exception, with OnExceptionActivity attached
        var step1 = SimpleActivity.Create("step1", ctx =>
        {
            throw new InvalidOperationException("Simulated API failure!");
        });

        // Error handler: pacing pause or recovery message
        var errorHandler = SimpleActivity.Create("errHandler", ctx =>
        {
            errorHandlerRan = true;
        });

        step1.OnExceptionActivity = errorHandler;

        // Step 2: normal happy path step that should NOT run
        var step2 = SimpleActivity.Create("step2", ctx =>
        {
            step2Ran = true;
        });

        flow.Add(step1);
        flow.Add(step2);

        var result = await flow.RunAsync();

        // 1. Error handler must have executed
        Assert.True(errorHandlerRan, "OnExceptionActivity should have executed.");

        // 2. Happy path Step 2 must NEVER have executed (Exit Ramp semantics)
        Assert.False(step2Ran, "Happy path Step 2 must NOT execute after an exception.");

        // 3. LastError must be populated in context
        Assert.Equal("Simulated API failure!", context.GetValue<string>("LastError"));

        // 4. Flow must be marked Completed (gracefully ended)
        Assert.Equal(TopicFlow.FlowState.Completed, flow.State);
    }
}
