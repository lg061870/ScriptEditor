# Proposal: ConversaCore framework changes to enable JSON-driven activity generation

**Status:** Proposed, not yet implemented or filed against `InsuranceSemanticV2`/`ConversaCore`.
**Origin:** Surfaced while building the Phase 3.1/3.2 Roslyn transcriber
(`Transcription/JsonToCSharpTranscriber.cs`, `Transcription/CSharpToJsonParser.cs`)
— see [issue #20](https://github.com/lg061870/ScriptEditor/issues/20),
[issue #21](https://github.com/lg061870/ScriptEditor/issues/21), and the
follow-up gap tracker
[issue #46](https://github.com/lg061870/ScriptEditor/issues/46).

This session does not have write access to `lg061870/InsuranceSemanticV2`
(the actual framework repo), so this is recorded here as a written proposal
rather than filed there directly. Port to issues in that repo when ready.

## Context

Getting the Phase 3.1 transcriber to generate genuinely *compilable* C#
(not just syntactically plausible text) required checking real constructor
signatures in `Activities/*.cs` and a real hand-written topic
(`InsuranceLeadsAgent/Topics/SampleTopic/SampleTopic.cs`) rather than
trusting the informal description in `CONCEPT_OF_OPERATIONS.md` §4.6. Three
real, structural mismatches came out of that:

1. `TopicFlow.BuildWorkflow()` doesn't exist as a virtual/overridable
   member — every subclass reinvents it as a private convention method,
   called manually from the subclass's own constructor.
2. `PromptActivity` and `QuickAnswerActivity` both require
   constructor-injected framework services (`Kernel`, a typed
   `ILogger<T>`, a `TopicWorkflowContext`) that have no literal
   representation in a JSON activity-parameter schema.
3. `AdaptiveCardActivity<TCard, TModel>` requires compile-time generic
   type arguments and a card-factory lambda — incompatible in principle
   with a card authored as data, not as a hand-written C# class.

None of these are bugs in ConversaCore for its actual use case (a human
developer writing a topic by hand, inside a DI-wired host). They only
become blockers when something *other than a human* — a code generator
driven by a JSON document — needs to produce a working subclass without
a human in the loop. That's specifically what this proposal is about.

## Proposal 1: Make `BuildWorkflow()` a real template-method hook

**Problem.** `TopicFlow`'s constructor is `(TopicWorkflowContext context,
ILogger logger, string name = "TopicFlow")` and calls nothing after
`base()` finishes; `BuildWorkflow()` isn't declared anywhere on the base
class. Real usage:

```csharp
public partial class SampleTopic : TopicFlowBase
{
    public SampleTopic(TopicWorkflowContext context, ILogger<SampleTopic> logger, IConversationContext conversationContext)
        : base(context, logger, "SampleTopic")
    {
        _logger = logger;
        BuildWorkflow();       // <- manual call, every subclass repeats this
    }

    private void BuildWorkflow() { Add(new SimpleActivity(...)); ... }

    public override void Reset()
    {
        base.Reset();
        BuildWorkflow();       // <- and again here
    }
}
```

A first attempt at the transcriber assumed `protected override void
BuildWorkflow()` (matching the informal description in
`CONCEPT_OF_OPERATIONS.md` §4.6: *"Generates a clean, idiomatic C#
`partial class [TopicName] : TopicFlow`... Generates `BuildWorkflow()`
containing `Add(...)` invocations"*). That fails with `CS0115` — there's
nothing to override.

**Proposed change:**

```csharp
public abstract class TopicFlow : ITopic, ITerminable
{
    protected TopicFlow(TopicWorkflowContext context, ILogger logger, string name = "TopicFlow")
    {
        _context = context;
        _logger = logger;
        Name = name;
        BuildWorkflow();
    }

    /// <summary>Override to add this topic's activities. Called once by the
    /// base constructor.</summary>
    protected virtual void BuildWorkflow() { }
}
```

Subclasses become:

```csharp
public partial class SampleTopic : TopicFlow
{
    public SampleTopic(TopicWorkflowContext context, ILogger<SampleTopic> logger)
        : base(context, logger, "SampleTopic") { }

    protected override void BuildWorkflow() { Add(new SimpleActivity(...)); ... }
}
```

**Impact.** Removes a whole category of hand-copied boilerplate from
*every* topic in the codebase, generated or hand-written — there's one
canonical, discoverable hook instead of a convention a developer (or a
generator) has to learn by reading example code. `Reset()`'s manual
re-call would need the same treatment (or `Reset()` itself could clear
and re-invoke `BuildWorkflow()` centrally).

## Proposal 2: A non-DI construction path for `PromptActivity` / `QuickAnswerActivity`

**Problem.** Real signatures:

```csharp
public PromptActivity(string activityId, Kernel kernel, ILogger logger)
public QuickAnswerActivity(string id, string question, IEnumerable<string> answers,
    TopicWorkflowContext context, ILogger<QuickAnswerActivity> logger, bool isRequired = false)
```

Both need live framework objects (`Kernel`, a context, a typed logger)
passed in at construction time. There is no C# expression a generator can
emit for these from JSON scalar data — `Kernel` in particular is a
`Microsoft.SemanticKernel` orchestration object with no meaningful
"default" or literal form. This directly blocks 2 of the 6 activity types
`docs/conops_interactive_prototype.html` already treats as first-class,
and both are already live in ScriptEditor's palette
(`canvas-app/src/registry/activityDefinitions.ts`).

**Proposed change.** A static factory per type, following the pattern
`DelayActivity.Create(id, TimeSpan)` already establishes elsewhere in the
codebase, resolving the framework dependency ambiently instead of
requiring it as a literal argument:

```csharp
public static class PromptActivity
{
    public static PromptActivity Create(string id, string systemPrompt, string? userPromptTemplate = null, string? modelId = null)
        // resolves Kernel + ILogger from the ambient TopicWorkflowContext /
        // a service-locator scope already available wherever BuildWorkflow() runs
        => new PromptActivity(id, AmbientServices.Kernel, AmbientServices.LoggerFor<PromptActivity>())
        {
            SystemPrompt = systemPrompt,
            UserPromptTemplate = userPromptTemplate ?? string.Empty,
        };
}
```

(Exact ambient-resolution mechanism — `AsyncLocal<IServiceProvider>`,
a context-carried service locator, or passing `Context` through since
`TopicFlow.Context` is already a public property — is an implementation
detail for whoever picks this up; the point is a factory whose parameter
list is 100% literal-representable.)

**Impact.** Closes the compilability gap for 2 of the 6 originally
prototype-seeded types without needing per-instance reflection metadata —
a generator just emits `PromptActivity.Create(id, "...", "...")`, the same
shape as the 4 types (`SimpleActivity`, `EndActivity`, `DelayActivity`,
`TriggerTopicActivity`) that already work today.

## Proposal 3: A non-generic, data-driven `AdaptiveCardActivity`

**Problem — the highest-impact one.** Real signature:

```csharp
public AdaptiveCardActivity<TCard, TModel>(
    string id, TopicWorkflowContext context, Func<TCard, object> cardFactory,
    string? modelContextKey = null, ILogger<AdaptiveCardActivity<TModel>>? logger = null,
    Action<ActivityState, ActivityState, object?>? onTransition = null, string? customMessage = null)
    where TCard : class, new()
    where TModel : class
```

`TCard`/`TModel` are compile-time generic type arguments, and
`cardFactory` is a lambda. Neither has *any* representation in a JSON
schema — this isn't a metadata gap that a reflection catalog could close
by itself (reflection can discover a type's *shape*, but can't synthesize
a *new compile-time generic instantiation and a matching card-rendering
lambda* from data at codegen time without essentially re-implementing a
compiler). Meanwhile, `ScriptEditor`'s own schema already models cards as
pure data — `DiagramAdaptiveCardDefinition` / `DiagramAdaptiveModelDefinition`
in `Models/DiagramDocument.cs` (field lists, input types, required flags,
a model base type and property list) — with nowhere for that data to go
in the real framework.

**Proposed change.** A parallel, non-generic activity that resolves its
card/model shape from a *registered definition ID* at runtime instead of
a compile-time type parameter:

```csharp
public class DynamicAdaptiveCardActivity : AdaptiveCardActivityBase
{
    public DynamicAdaptiveCardActivity(
        string id, TopicWorkflowContext context,
        string cardDefinitionId, string modelDefinitionId)
        : base(id, context, ResolveCardJson(cardDefinitionId, modelDefinitionId)) { }

    // Renders from a registered AdaptiveCardDefinition/ModelDefinition
    // (field list + input types) instead of a hand-written TCard class;
    // submissions bind into a Dictionary<string, object> or a dynamic
    // model instead of a generated TModel.
}
```

with a small runtime registry (`CardDefinitionRegistry.Register(id, fields)`)
that `ScriptEditor`'s own `DiagramAdaptiveCardDefinition`/
`DiagramAdaptiveModelDefinition` data could populate directly.

**Impact.** This is also the prerequisite for the "AdaptiveCardActivity
editor" already flagged as missing elsewhere in this project's docs
(`docs/activity-shapes.md`'s notes on `AdaptiveCardActivity`) — right now
there is no path to visually author a *new* card without also hand-writing
a C# `TModel` class and wiring generics by hand, which defeats the purpose
of a visual editor. Of the three proposals here, this is the one worth
prioritizing if only one gets picked up.

## Not proposed here

Property/parameter **naming** mismatches between ScriptEditor's schema
field keys and ConversaCore's real property names (e.g. `DelayActivity`'s
real `ShowTypingIndicator` vs. the schema's `showTyping` key) are a
ScriptEditor-side fix, not a framework change — `JsonToCSharpTranscriber`
already corrects for this per-type, and a future reflection catalog
(#46) would need to do the same generally. Not included above since it
doesn't require touching ConversaCore itself.
