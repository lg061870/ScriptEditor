# n8n-Level Canvas Rewrite — Roadmap & Work Breakdown

> **For agentic workers:** This is a program-level roadmap covering multiple independent subsystems, not a single bite-sized TDD plan. Each phase below gets its own detailed implementation plan (using `superpowers:writing-plans`) at the point it's actually picked up for execution — do not attempt to execute this document directly task-by-task.

**Goal:** Replace the current Blazor `editor.js` canvas (~2,100 LOC hand-rolled DOM/SVG router, abandoned as unworkable) by evolving `docs/conops_interactive_prototype.html` into a real, standalone, n8n-quality diagram editor for ConversaCore `TopicFlow` scripts.

**Architecture:**
- New standalone frontend (own build, own app) replaces Blazor's `Home.razor` + `editor.js` as the canvas surface.
- A small .NET API (hosted from the existing `ScriptEditor.csproj`, or a new minimal-API project) wraps the Roslyn transcriber — JSON→C# generation and C#→JSON parsing — since Roslyn is .NET-only regardless of frontend choice.
- The JSON document remains the single source of truth end-to-end: every mutation (canvas or code) flows through one reactive loop with origin tokens (`Canvas` / `CodeEditor` / `Inspector`) to prevent circular updates, exactly as already specified in `docs/CONCEPT_OF_OPERATIONS.md` §2.1-2.2, §4.6.
- `ConversaCore` / `ConversaCore.UI` (at `..\InsuranceSemanticV2\`) are the execution/runtime target and are **not** rewritten — this project only replaces the authoring/diagramming surface.

**Tech Stack:** React + TypeScript + React Flow (`@xyflow/react`) for the canvas (pending Phase 0 spike confirming this over Rete.js); ASP.NET Core minimal API for the Roslyn transcription endpoint; existing `DiagramDocument.cs` model as the starting point for the shared JSON schema.

**Spec:** `docs/n8n-feature-gap-analysis.md` (canvas/port gap analysis and n8n mechanism mapping), `docs/activity-shapes.md` (full 36-shape catalog: params, ports, prose), `docs/AS_IS_SYSTEM_DOCUMENTATION.md` (current-system architecture and problems), `docs/CONCEPT_OF_OPERATIONS.md` (existing to-be vision and reactive-pipeline sequence diagrams), `docs/conops_interactive_prototype.html` (working mockup of the reactive UX, minus real routing/ports/full catalog).

## Global Constraints

- JSON is the single source of truth; canvas and code are both passive projections of it — no canvas-owned state, no code-editor-owned state. (`CONCEPT_OF_OPERATIONS.md` §2.1)
- Every cross-surface mutation must carry an origin token (`Canvas`/`CodeEditor`/`Inspector`) to prevent circular updates/deadlocks. (`CONCEPT_OF_OPERATIONS.md` §2.2, line 225)
- Roslyn compilation/assembly-loading is on-demand only (e.g. on a "Run"/"Reset" action) — never on every keystroke or drag. Text-level transcription (JSON↔C# text) can be near-instant; only the compile-and-load step is gated. (`CONCEPT_OF_OPERATIONS.md` line 51)
- Port legality is `direction` (output→input only) + `type` compatibility, matching the one part of the current model that already works (`wwwroot/editor.js:1071-1078`); everything else about the port model (kind detection, positioning, gender) is being replaced, not preserved.
- All 36 non-domain-specific activity shapes from `activity-shapes.md` must reach full parity in the new canvas (params + ports + prose), plus `InvokeToolActivity`, confirmed present in `ConversaCore.TopicFlow.Activities` but absent from every prior palette.
- Do not delete or modify `wwwroot/editor.js` or `Home.razor` until Phase 6 migration/cutover — they remain the fallback until the new canvas reaches parity.

---

## Phase 0 — Foundations & Spike

**Milestone:** `Phase 0: Foundations`
**Exit criteria:** library choice confirmed with a working non-trivial spike; JSON schema v2 drafted; sync protocol designed; API skeleton exists.

| # | Issue | Acceptance criteria |
|---|---|---|
| 0.1 | Spike: evaluate React Flow vs. Rete.js against our exact needs | A short written comparison (custom port shapes, dynamic per-node port count, DOM-based node content, obstacle/loop-aware routing, licensing) with a working throwaway demo in each candidate reproducing: 1 node with 3 dynamically-generated output ports, 1 backward/loop edge routed without crossing another node. Recommendation recorded in an ADR under `docs/adr/`. |
| 0.2 | Scaffold the new standalone frontend app | New `canvas-app/` (or similar) directory: Vite + React + TypeScript project, builds and runs `npm run dev` showing a blank canvas. README documents how to run it. |
| 0.3 | Draft JSON SSOT schema v2 (TypeScript types + C# DTOs) | A schema doc (or shared `.d.ts`/`.cs` pair) defining `DiagramDocument`, `DiagramNode`, `DiagramPort` (with an explicit `role` enum: `main` / `exception` / `control` / `aux-config`, replacing name-sniffed kind detection), `DiagramEdge`. Reviewed against every shape's current ports in `activity-shapes.md` for coverage. |
| 0.4 | Design & document the origin-token sync protocol | An ADR describing the exact mutation flow for both directions (Canvas→JSON→[Canvas redraw, Code regen]; Code→JSON→Canvas redraw), the origin token values, and how the loop-prevention rule is enforced (e.g. "a mutation tagged `Origin=CodeEditor` never re-triggers a code-regen pass"). |
| 0.5 | Scaffold the transcription API project | New (or extended) ASP.NET Core project exposing two stub endpoints: `POST /api/transcribe/json-to-csharp` and `POST /api/transcribe/csharp-to-json`, both returning a hardcoded fixture response. Reachable via `curl`/Postman with a documented example request/response. |

## Phase 1 — Canvas Core (React Flow)

**Milestone:** `Phase 1: Canvas Core`
**Exit criteria:** a user can drag a shape from a categorized palette onto the canvas, see a collapsed n8n-style node, wire it to another node, and edit its fields in a side panel — driven entirely by a JSON document in local state (no backend yet).

| # | Issue | Acceptance criteria |
|---|---|---|
| 1.1 | Integrate React Flow and render one hardcoded node+edge | Canvas renders a single node and a single edge from a hardcoded JSON fixture matching the Phase 0.3 schema — proves the schema→React Flow mapping end to end. |
| 1.2 | Build the collapsed n8n-style node component | A generic node component rendering icon + title + one summary line only (no inline parameter fields), driven by a `getNodeSummary(node)` function per activity type (seed with the 6 types from `conops_interactive_prototype.html`, extend in Phase 5). |
| 1.3 | Build the category-grouped node palette | Sidebar palette grouping shapes into the 10 categories from `activity-shapes.md` (Sequence, Selection, Iteration, Concurrency, Exception Handling, Variables & State, I/O, Events & Subroutines, Semantic/AI, Security), each item draggable onto the canvas. |
| 1.4 | Implement "+ add node" from a dangling output handle | Clicking a small "+" on an unconnected output port opens the palette pre-filtered/contextual and, on selection, creates the new node pre-wired to that port — matching the n8n pattern documented in `n8n-feature-gap-analysis.md` §6. |
| 1.5 | Build the Inspector side panel for full field editing | Selecting a node opens a side panel showing every one of its parameters as a real form control (matching `activity-shapes.md`'s per-shape parameter table); editing a field updates the JSON document and the node's one-line canvas summary. |
| 1.6 | Wire pan/zoom, minimap, multi-select, and delete | Standard canvas ergonomics: scroll-to-zoom, drag-to-pan, a minimap, marquee multi-select, Delete key removes selected nodes/edges (and their now-dangling edges). |

## Phase 2 — JSON SSOT & Reactive Sync

**Milestone:** `Phase 2: JSON SSOT & Sync`
**Exit criteria:** every canvas mutation provably flows through one central JSON store with no component-local state; a live (static-templated, not yet Roslyn-backed) C# preview panel reflects the JSON in real time.

| # | Issue | Acceptance criteria |
|---|---|---|
| 2.1 | Central JSON store + reducer for all canvas mutations | One store (e.g. Zustand/Redux — decide in this issue) that every add/move/wire/delete/edit action dispatches through; React Flow's own node/edge state is derived from this store, never the other way around. |
| 2.2 | Canvas as a pure projection of JSON | Remove any React-Flow-local state that isn't immediately synced back to the store on every change (position included) — verified by a test that mutates the store directly and asserts the canvas re-renders correctly without any canvas-originated write. |
| 2.3 | Origin-token plumbing end to end | Every dispatched mutation carries an `origin: 'Canvas' | 'CodeEditor' | 'Inspector'` tag per the Phase 0.4 ADR; a regression test simulates a code-edit-originated mutation and asserts it does not re-trigger a code-regen request (loop prevention). |
| 2.4 | Live C# code preview panel (static templating) | A read-only panel rendering C# text generated by a simple in-frontend template function (not Roslyn yet) from the current JSON — proves the "instant text update" half of the dual-speed lifecycle before the real transcriber exists. |

## Phase 3 — Roslyn Transcription API

**Milestone:** `Phase 3: Roslyn Transcriber`
**Exit criteria:** editing the canvas updates real Roslyn-generated C#, and editing that C# text parses back into the JSON document and redraws the canvas, without corrupting state on a syntax error.

| # | Issue | Acceptance criteria |
|---|---|---|
| 3.1 | JSON → C# transcriber | Replaces the Phase 2.4 template stub: given a `DiagramDocument`, generates a compilable `TopicFlow` subclass body (`Add(new XActivity(...))` per node) via real C# syntax construction (Roslyn `SyntaxFactory` or string templating — decide and document which, and why, in this issue). Covers at minimum the 6 shapes already in the prototype. |
| 3.2 | C# → JSON parser | Given C# text, walks the `BuildWorkflow()` method's `Add(...)` calls via `CSharpSyntaxTree`/AST and reconstructs the equivalent `DiagramDocument`. Round-trip test: JSON → C# → JSON produces an equivalent document. |
| 3.3 | Wire frontend to the transcription API (debounced) | Canvas mutation → debounced call to `/json-to-csharp`, code panel updates. Code edit → debounced (~350ms) call to `/csharp-to-json`, JSON store updates with `origin: CodeEditor`. |
| 3.4 | Dual-speed compilation lifecycle | Text-level transcription stays instant (Phase 3.3); actual Roslyn `CSharpCompilation.Emit` + assembly load only happens on an explicit "Run"/"Reset" action, per `CONCEPT_OF_OPERATIONS.md` line 51. |
| 3.5 | Syntax error handling without state corruption | A deliberate syntax error typed into the code panel surfaces diagnostics in the editor gutter and does **not** overwrite or corrupt the last-valid JSON document (`CONCEPT_OF_OPERATIONS.md` line 333). |

## Phase 4 — Port & Routing Upgrade

**Milestone:** `Phase 4: Ports & Routing`
**Exit criteria:** port kind is a declared, always-visible property (not string-sniffed); branching activities expose one real port per case; edges auto-route around obstacles and loops use a dedicated channel.

| # | Issue | Acceptance criteria |
|---|---|---|
| 4.1 | Add explicit port `role` to the schema and stop inferring it | `DiagramPort.role` (`main`/`exception`/`control`/`aux-config`) is set explicitly by each activity's port definition at creation time; delete the `isExceptionPort`/`isControlPort` substring-matching heuristics entirely. |
| 4.2 | Per-role port shape + line style | `main` = solid circle/solid line, `exception` = solid circle/dashed red line, `control` = solid square/solid line, `aux-config` (e.g. `AdaptiveCardActivity`'s `Card`/`Model` inputs) = diamond/dashed — each visually distinct with no reliance on hover text, per `n8n-feature-gap-analysis.md` §3. |
| 4.3 | Auto-stack same-side ports | Multiple ports on one side of a node are evenly spaced automatically (React Flow `Handle` positioning computed from port index/count) — no hand-set percentage offsets anywhere in the codebase. |
| 4.4 | Dynamic per-case output ports for branching activities | `SwitchActivity`, `ConditionalActivity`, `Conditional<QuickAnswer>`, `Conditional<TriggerTopic>`, `DecisionActivity`, `ChoiceActivity` each generate one real output port per case/branch from their case-list field, addressing the structural gap in `n8n-feature-gap-analysis.md` §4 (previously: one generic `Output` port for all cases). |
| 4.5 | Obstacle-aware edge routing | A custom React Flow edge path function that detects intervening node bounding boxes between source and target and routes around them, rather than the fixed two-point Bezier every edge uses today. |
| 4.6 | Dedicated loop-back routing lane | Backward edges (target column < source column, or an explicit "loop" edge role) route through a distinct bottom/side channel rather than the generic obstacle-aware router, matching the n8n self-loop pattern in `n8n-feature-gap-analysis.md` §2. |

## Phase 5 — Full Activity Catalog Parity

**Milestone:** `Phase 5: Activity Catalog`
**Exit criteria:** all 36 documented shapes (plus `InvokeToolActivity`) are available in the new palette with full parameter and port parity against `activity-shapes.md`.

| # | Issue | Acceptance criteria |
|---|---|---|
| 5.1 | Port Sequence + Selection category shapes into the new registry | `SimpleActivity`, `CompositeActivity`, `DelayActivity`, `EndActivity`, `ConditionalActivity`, `Conditional<QuickAnswer>`, `Conditional<TriggerTopic>`, `DecisionActivity`, `SwitchActivity`, `ChoiceActivity` all present with parameters/ports matching `activity-shapes.md` exactly. |
| 5.2 | Port Iteration + Concurrency + Exception Handling shapes | `RepeatActivity`, `ForEachActivity`, `ParallelActivity`, `OnErrorActivity`, `FallbackActivity`, `EscalateActivity`. |
| 5.3 | Port Variables & State + I/O category shapes | `SetVariableActivity`, `GlobalVariableActivity`, `DumpCtxActivity`, `ResetActivity`, `WaitForUserInput`, `PromptActivity`, `QuickAnswer`, `AdaptiveCardActivity`, `ShowSuggestionsActivity`, `InteractiveActivity`, `PromptAttentionActivity`, `GreetingActivity`. |
| 5.4 | Port Events/Subroutines + Semantic/AI + Security shapes | `EventTriggerActivity`, `TriggerTopic`, `ExecuteTopicActivity`, `CompleteTopicActivity`, `MultipleTopicsMatchedActivity`, `SemanticResponse`, `SemanticQueryActivity`, `SignInActivity`. |
| 5.5 | Add `InvokeToolActivity` as a first-class shape | New shape added to the registry and a category (likely Events & Subroutines, or a new "Tools" category — decide in this issue), reflecting `ConversaCore.TopicFlow.Activities.InvokeToolActivity<TTool, TRequest, TResult>` — confirmed present in the framework but absent from every prior palette. |
| 5.6 | Systematic drift pass against `ConversaCore/TopicFlow/Activities/*.cs` | Enumerate every class in that folder, confirm each is either (a) represented in the new registry, or (b) correctly excluded with a documented reason (dead stub, static helper, abstract base) — same method used to find `InvokeToolActivity` in this conversation, applied exhaustively. |

## Phase 6 — Execution Preview & Migration

**Milestone:** `Phase 6: Preview & Cutover`
**Exit criteria:** the new canvas can trigger a live chat preview of the flow, has reached behavioral parity with the old editor, and `editor.js`/`Home.razor` are retired.

| # | Issue | Acceptance criteria |
|---|---|---|
| 6.1 | Live chat preview pane | A preview panel that runs the current flow against `ConversaCore.UI`'s chat rendering pattern (`CustomChatWindowV3.razor`/`AdaptiveCardRenderer.razor` as reference, per `..\InsuranceSemanticV2\ConversaCore.UI\Components\`), similar in spirit to the prototype's mock chat pane but backed by a real (or realistically stubbed) execution. |
| 6.2 | "Run"/"Execute Workflow" affordance on canvas | A pinned control that triggers the Phase 3.4 on-demand compile+load and runs the flow against the preview pane, addressing gap #8 in `n8n-feature-gap-analysis.md`. |
| 6.3 | Parity/regression checklist against the old editor | A written checklist derived from `AS_IS_SYSTEM_DOCUMENTATION.md`'s documented current capabilities (context flow analysis, graph validation, adaptive card/model definition sync, etc.) with each item verified working in the new canvas or explicitly deferred with a reason. |
| 6.4 | Retire `Home.razor` / `editor.js` | Remove or archive the old canvas code once Phase 6.3 passes; update `ScriptEditor.csproj`/`ScriptEditor.sln` accordingly. |
| 6.5 | Update architecture docs to reflect the shipped system | `AS_IS_SYSTEM_DOCUMENTATION.md` and `CONCEPT_OF_OPERATIONS.md` updated (or superseded by a new doc) to describe the system as actually built, not as originally envisioned, so the next round of docs doesn't drift the way the palette drifted from the framework. |
| 6.6 | Quiet top-level chrome | Separate persistent app-level navigation from per-node/per-script contextual panels (n8n keeps `Workflows`/`Credentials`/`Executions` out of the canvas toolbar entirely) — addresses gap #7 in `n8n-feature-gap-analysis.md`, intentionally deferred to last since it's the lowest-leverage item on that list. |

---

## Summary

| Phase | Milestone | Issues |
|---|---|---|
| 0 | Foundations | 5 |
| 1 | Canvas Core | 6 |
| 2 | JSON SSOT & Sync | 4 |
| 3 | Roslyn Transcriber | 5 |
| 4 | Ports & Routing | 6 |
| 5 | Activity Catalog | 6 |
| 6 | Preview & Cutover | 6 |
| **Total** | | **38** |

Each phase ships something independently demoable — this is deliberate so the project can pause after any phase with working software, not a half-built rewrite.
