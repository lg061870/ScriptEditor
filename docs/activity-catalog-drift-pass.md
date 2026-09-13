# Activity catalog drift pass (#38)

Enumerates every class declared in `ConversaCore/TopicFlow/Activities/*.cs`
(38 files) and confirms each is either (a) represented in
`canvas-app/src/registry/activityCatalog.ts` /
`activityDefinitions.ts`, or (b) correctly excluded with a documented
reason. Same method used to establish that `InvokeToolActivity` doesn't
exist in this codebase (#37 → #48), applied exhaustively to every file in
the folder instead of one name.

Three real class-name bugs were found and fixed during this pass (see
"Fixes applied" below); everything else was already either correctly
represented or correctly excluded.

## Represented (34 files → 34 of the catalog's 36 entries)

Real class name, then the catalog `type` string. Where they now match
exactly, `BuildGenericFallback` in `JsonToCSharpTranscriber.cs` (which
uses the type string as the literal C# class name for any type with no
per-type generator) at least references a real class, even where the
generated code still isn't fully compilable for other reasons (framework
dependencies with no literal JSON representation — documented per-type in
`activityDefinitions.ts`, not a drift-pass concern).

| File | Real class | Catalog `type` |
|---|---|---|
| ChoiceActivity.cs | `ChoiceActivity` | `ChoiceActivity` |
| CompleteTopicActivity.cs | `CompleteTopicActivity` | `CompleteTopicActivity` |
| CompositeActivity.cs | `CompositeActivity` | `CompositeActivity` |
| ConditionalActivity.cs | `ConditionalActivity` | `ConditionalActivity` (also backs the doc-level `Conditional<QuickAnswer>`/`Conditional<TriggerTopic>` catalog variants — see below) |
| DecisionActivity.cs | `DecisionActivity<TInput,TEvidence,TResponse>` | `DecisionActivity` (generic-type gap tracked in #47) |
| DelayActivity.cs | `DelayActivity` | `DelayActivity` |
| DumpCtxActivity.cs | `DumpCtxActivity` | `DumpCtxActivity` |
| EndActivity.cs | `EndActivity` | `EndActivity` |
| EscalateActivity.cs | `EscalateActivity` | `EscalateActivity` |
| EventTriggerActivity.cs | `EventTriggerActivity` | `EventTriggerActivity` |
| ExecuteTopicActivity.cs | `ExecuteTopicActivity` | `ExecuteTopicActivity` |
| FallbackActivity.cs | `FallbackActivity` | `FallbackActivity` |
| ForEachActivity.cs | `ForEachActivity` | `ForEachActivity` |
| GlobalVariableActivity.cs | `GlobalVariableActivity` | `GlobalVariableActivity` |
| GreetingActivity.cs | `GreetingActivity` | `GreetingActivity` |
| InteractiveActivity.cs | `InteractiveActivity` | `InteractiveActivity` |
| MultipleTopicsMatchedActivity.cs | `MultipleTopicsMatchedActivity` | `MultipleTopicsMatchedActivity` |
| OnErrorActivity.cs | `OnErrorActivity` | `OnErrorActivity` |
| ParallelActivity.cs | `ParallelActivity` | `ParallelActivity` |
| PromptActivity.cs | `PromptActivity` | `PromptActivity` |
| PromptAttentionActivity.cs | `ChatPromptAttentionActivity` | `ChatPromptAttentionActivity` **(fixed this pass — was `PromptAttentionActivity`, which doesn't exist)** |
| QuickAnswerActivity.cs | `QuickAnswerActivity` (+ its companion `QuickAnswerCard` model, see excluded list) | `QuickAnswerActivity` |
| RepeatActivity.cs | `RepeatActivity<TActivity>` | `RepeatActivity` (generic-type gap, documented inline in `activityDefinitions.ts`) |
| ResetActivity.cs | `ResetActivity` | `ResetActivity` |
| SemanticQueryActivity.cs | `SemanticQueryActivity<TRuleSet,TInput,TOutput>` | `SemanticQueryActivity` (generic-type gap, documented inline as "the deepest generic-type gap in the catalog") |
| SemanticResponseActivity.cs | `SemanticResponseActivity` | `SemanticResponseActivity` **(fixed this pass — was `SemanticResponse`, which doesn't exist)** |
| SetVariableActivity.cs | `SetVariableActivity` | `SetVariableActivity` |
| ShowSuggestionsActivity.cs | `ShowSuggestionsActivity` | `ShowSuggestionsActivity` |
| SignInActivity.cs | `SignInActivity` | `SignInActivity` |
| SimpleActivity.cs | `SimpleActivity` | `SimpleActivity` |
| SwitchActivity.cs | `SwitchActivity` | `SwitchActivity` |
| TriggerTopicActivity.cs | `TriggerTopicActivity` (+ its companion `TopicTriggeredEventArgs`, see excluded list) | `TriggerTopicActivity` |
| WaitForUserInputActivity.cs | `WaitForUserInputActivity` (+ its companion `WaitForUserInputModel`, see excluded list) | `WaitForUserInputActivity` **(fixed this pass — was `WaitForUserInput`, the doc heading's shorthand, which doesn't exist as a class)** |
| AdaptiveCardActivity.Generic.cs | `AdaptiveCardActivity<TModel>` (abstract) | `AdaptiveCardActivity` — instantiated only as a catalog placeholder; real usage is always through a concrete subclass (`QuickAnswerActivity`, `WaitForUserInputActivity`), both separately represented above |

The catalog's 2 remaining entries, `Conditional<QuickAnswer>` and
`Conditional<TriggerTopic>`, are doc-level compound variants (both headings
in `docs/activity-shapes.md`, same as the catalog's naming) representing
`ConditionalActivity` paired with a specific follow-up action — not
separate real classes with their own file. They don't correspond to
additional files beyond `ConditionalActivity.cs`, already counted above.

## Fixes applied this pass

`JsonToCSharpTranscriber.cs`'s `BuildGenericFallback` uses a node's `type`
string as the literal C# class name (`ObjectCreationExpression(IdentifierName(type))`)
for any activity with no per-type generator. Three catalog entries used a
type string that doesn't match any real ConversaCore class, which meant
`BuildGenericFallback` would always emit code referencing a symbol that
doesn't exist (guaranteed `CS0246`), not just "best-effort, may not
compile" like the rest of the generic-fallback types:

| Catalog `type` before | Real class | Root cause |
|---|---|---|
| `PromptAttentionActivity` | `ChatPromptAttentionActivity` | Real class name differs from the file name (`PromptAttentionActivity.cs`) and the doc heading |
| `SemanticResponse` | `SemanticResponseActivity` | Doc heading (`### SemanticResponse`) used verbatim instead of the real class name |
| `WaitForUserInput` | `WaitForUserInputActivity` | Doc heading (`### WaitForUserInput`) used verbatim instead of the real class name — same root cause as `SemanticResponse`; inconsistent with e.g. `DelayActivity`, where the catalog already correctly uses the real class name over the doc's `### Delay` heading |

Fixed in `activityCatalog.ts`, `activityDefinitions.ts`, and all test
files with hardcoded references
(`phase5VariablesIO.test.ts`, `phase5EventsSemanticSecurity.test.ts`).
Verified live: dragging a "Prompt Attention" node onto the canvas and
opening the Code panel now shows `ChatPromptAttentionActivity` in the
generated C#, not the old nonexistent `PromptAttentionActivity`.

None of the three real classes have a plain-literal-argument constructor
(all three need `TopicWorkflowContext`/`ILogger`/`Kernel`, per the
existing "best-effort, may not compile" comments already on each
registry entry), so these fixes correct the class-name-doesn't-exist bug
specifically; the surrounding generic-fallback code was never claimed to
be fully compilable for these types and still isn't — that's a pre-existing,
already-documented generic-fallback limitation, not new to this pass.

## Correctly excluded (4 files — no registry entry, with reason)

| File | Real declaration | Reason excluded |
|---|---|---|
| ContinuationActivity.cs | *(no class — file is a single comment)* | Dead stub. Full contents: `// This file is no longer needed - using simpler approach in RepeatActivity` |
| RepeatPromptInjector.cs | `public static class RepeatPromptInjector` | Static helper class ("Helper class for injecting repeat/continuation prompts into existing adaptive cards"), not a `TopicFlowActivity` — nothing to add to a workflow |
| SemanticActivity.cs | `public abstract class SemanticActivity : TopicFlowActivity, IAsyncNotifiableActivity` | Abstract base class, not directly instantiable. Its concrete subclasses (`PromptActivity`, `SemanticQueryActivity`, `SemanticResponseActivity`, `InsuranceDecisionActivity`) are each represented (or excluded) individually |
| InsuranceDecisionActivity.cs | `public class InsuranceDecisionActivity : SemanticActivity` | Domain-specific subclass built for the insurance sample app, not a generic reusable shape — out of scope for a generic activity palette |

Companion/model types that live in the same file as a represented
activity, not activities themselves, are not separately counted:
`QuickAnswerCard` (in `QuickAnswerActivity.cs`), `WaitForUserInputModel`
(in `WaitForUserInputActivity.cs`), `TopicTriggeredEventArgs` (in
`TriggerTopicActivity.cs`). Each file's actual activity class is
represented in the table above.

## Totals

38 files in the folder → 34 represented as distinct catalog entries + 4
correctly excluded with a documented reason = 38. (The catalog's 35th and
36th entries, the two `Conditional<...>` variants, are doc-level
compositions of an already-counted file, `ConditionalActivity.cs`, not
additional files — the catalog itself has 36 entries total, 2 of which
compose an already-represented file rather than adding a new one.)

## Relationship to #37 / #48 (InvokeToolActivity)

This pass used the identical verification method that resolved #37: read
the real file, don't assume the doc or a catalog entry's `type` string is
accurate. It's what surfaced the `PromptAttentionActivity` /
`SemanticResponse` / `WaitForUserInput` mismatches above — none of which
would have been caught by a search for `InvokeToolActivity` specifically,
since they're a different failure mode (wrong name for a class that does
exist, vs. a name with no matching class at all).
