# Known Issues & Bug Backlog

This document tracks known edge cases, architectural limitations, and backlogged bugs in ScriptEditor for future remediation.

---

## BUG-001: ParallelActivity Branch Sub-Workflow Emission & Variable Context Propagation Failure

- **Status**: Logged (Backlog / Edge Case)
- **Reported Date**: 2026-09-24
- **Area**: `Transcription` (`JsonToCSharpTranscriber.cs`), `ConversaCore` Runtime, Canvas Branching

### Description & User Scenario
When placing multiple `SetVariableActivity` nodes on the branches of a `ParallelActivity` that rejoin into a downstream `SimpleActivity` (Bot Message):
1. Both variables (`{TheWorldPart}` and `{TheHellowPart}`) correctly appear in the Inspector as valid **Upstream Variables (2)** due to the diagram topology.
2. In the Canvas Message Text editor, `{TheHellowPart} {TheWorldPart}!` is configured.
3. However, when the compiled workflow executes in the chat preview, neither variable value makes it through, and the bot outputs just `!` (empty strings for both variables).

### Generated C# Code Snapshot
```csharp
private void BuildWorkflow()
{
    Add(new ParallelActivity("node-1790302093987-2", new TopicFlowActivity[] { 
        new SimpleActivity("node-1790302093987-2_Branch1", "Branch 1"), 
        new SimpleActivity("node-1790302093987-2_Branch2", "Branch 2") 
    }));
    Add(new SetVariableActivity("node-1790301988195-1", "TheWorldPart", "World", _conversationContext, NullLogger<SetVariableActivity>.Instance, true));
    Add(new SetVariableActivity("node-1790302103711-3", "TheHellowPart", "", _conversationContext, NullLogger<SetVariableActivity>.Instance, true));
    Add(new SimpleActivity("greet", async (ctx, _) => (object? )$"{(_conversationContext != null && _conversationContext.HasValue("TheHellowPart") ? _conversationContext.GetValue<object?>("TheHellowPart", null) : ctx.GetValue<object?>("TheHellowPart"))} {(_conversationContext != null && _conversationContext.HasValue("TheWorldPart") ? _conversationContext.GetValue<object?>("TheWorldPart", null) : ctx.GetValue<object?>("TheWorldPart"))}!"));
    Add(new EndActivity("n2", "Done"));
}
```

### Root Cause Analysis
1. **Placeholder Child Activity Generation**:
   `BuildParallelActivity` in `JsonToCSharpTranscriber.cs` currently constructs dummy placeholder `SimpleActivity` instances for each branch:
   ```csharp
   childCreations.Add(BuildSimpleActivity($"{id}_{sanitized}", new Dictionary<string, string> { ["message"] = label }));
   ```
   It does not inspect the outgoing diagram edges from the branch ports (`p-branch-1`, `p-branch-2`) to nest the actual downstream branch activities (the `SetVariableActivity` nodes) into `ParallelActivity`'s `TopicFlowActivity[]` array.
2. **Flattened / Linear Emission**:
   Because branch activities are not nested inside the `ParallelActivity` argument list, the topological serializer in `JsonToCSharpTranscriber` emits them as top-level `Add(new SetVariableActivity(...))` calls *after* the `ParallelActivity`.
3. **Runtime Execution & Context Join**:
   In `ConversaCore`, `ParallelActivity` executes its child activities in concurrent branches. If activities are disconnected from the branch array or if parallel branches maintain isolated execution context copies without a synchronized join step back into `_conversationContext` / `ctx`, variable writes either don't execute before the rejoin node or are lost.
4. **Empty String Value in SetVariable**:
   Notice `TheHellowPart` was transcribed with `""` as its value (`new SetVariableActivity(..., "TheHellowPart", "", ...)`).

### Remediation Plan (For Later)
1. **Branch Traversal in Transcriber**:
   Update `JsonToCSharpTranscriber.cs` to follow edges starting at each `ParallelActivity` branch port. Recursively serialize connected branch activities into compound/nested activity sequences or sub-arrays passed to `new ParallelActivity(..., new TopicFlowActivity[] { branch1Tree, branch2Tree })`.
2. **Context Synchronization / Join Verification**:
   Verify that `ConversaCore.ParallelActivity` completes all branches and merges branch context modifications back into `_conversationContext` prior to triggering downstream join activities.
3. **Inspector Default Value Safety**:
   Ensure `SetVariableActivity` provides a non-empty fallback value if left blank by the user in the Inspector.
