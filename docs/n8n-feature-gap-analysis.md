# ScriptEditor vs n8n — canvas feature gap analysis

Reference: n8n screenshots supplied 2026-09-12 (marketing "Simple to Complex AI" diagram, live n8n canvas with an `IF` branch, a scraper workflow with a self-loop, and an annotated true/false routing close-up). Compared against the current `editor.js` implementation and the behavior documented in `AS_IS_SYSTEM_DOCUMENTATION.md` and `activity-shapes.md`.

This is scoped to canvas/diagram UX only — not a request to clone n8n node-for-node, just to borrow the specific mechanisms that solve problems the current editor never resolved before the rewrite decision.

**Governing constraint (already specified in `CONCEPT_OF_OPERATIONS.md` §2.1-2.2, §4.6, and its Scenario A/B sequence diagrams): the JSON document is the single source of truth, and every mutation — whether it originates on the canvas or in the C# code editor — must go through it.** Concretely: drop/move/wire a shape → JSON mutates → an origin-tokened trigger fan-out (1) redraws the canvas and (2) asks the Roslyn transcriber to regenerate C#; conversely, editing code → Roslyn's AST parser dispatches a mutation back into JSON `[Origin = CodeEditor]` → canvas redraws. Origin tokens (`Canvas`/`CodeEditor`/`Inspector`) are what stop the two directions from looping into each other indefinitely.

Every improvement below has to be authored as a change to the JSON node/port schema flowing through that same loop — not a parallel canvas-only state store. That was precisely the old `editor.js` failure mode (`OnCanvasDocumentChanged` serializing the entire DOM state back to Blazor ad hoc, per `AS_IS_SYSTEM_DOCUMENTATION.md` line 262) and it's the trap to avoid when adding, say, dynamically-generated per-case ports (#4) or a port `role` field (#3): the schema gains the field, the reactive loop propagates it, and canvas/code are both just projections of it — neither owns state on its own.

## 1. Edge routing avoids obstacles instead of drawing through them

**n8n**: in the scraper workflow screenshot, the `false` branch out of "Full page?" runs to "Increase page number", whose output then loops all the way back to "Get page content" via a dedicated **orthogonal channel below the row** — three right-angle segments, never crossing another node. The "true" branch of the annotated IF screenshot curves cleanly around neighboring nodes rather than cutting through their boxes.

**Current**: `renderEdges.js`'s `curve()` (`wwwroot/editor/rendering/renderEdges.js:3-8`) always draws the same two-control-point cubic Bezier between two fixed points, with no knowledge of intervening nodes. There is no obstacle model at all — a wire will happily render straight through any node sitting between source and target. This is exactly the "skipping shapes and going around them" feature you said never got finished.

**Takeaway for rewrite**: routing needs a real geometry pass — at minimum, route candidates evaluated against node bounding boxes (n8n-style: prefer a fixed side-exit + side-entry with an orthogonal detour when a straight/Bezier path would intersect a node), not a single hardcoded curve formula.

## 2. Loops get a dedicated routing lane, not a generic edge

**n8n**: the self-loop in the scraper workflow is visually distinct from forward edges — it drops down, runs along a shared bottom channel, and comes back up into the input side of an earlier node. It reads immediately as "this loops" without needing a label.

**Current**: nothing loop-aware exists in `renderEdges.js` — a loop-back edge (e.g. `RepeatActivity`, or the earlier `SwitchActivity` "loop = true" case we diagrammed) is just another edge run through the same generic `curve()` function, which will draw a Bezier straight back across the canvas, likely through whatever nodes sit between the two points.

**Takeaway**: give backward edges (target x < source x, or an explicit "loop" edge role) a distinct route strategy — an outside channel below/above the row, not the same S-curve used for forward branching. This was one of the specific things you said crashed and burned in the old editor; n8n's answer is really just "loops get their own lane," not anything exotic.

## 3. Port kind is a visual language, not just a tooltip — plus a full trace of our current port model

**n8n** (marketing diagram, step 3 "AI Agent"): the main data-flow ports are **solid filled circles** connected by **solid lines**. The AI node's auxiliary inputs (tool, memory, model) are **diamond-shaped ports** connected by **dashed lines**, hanging below the node rather than beside it. Two different geometries + two different line styles = two different meanings, readable at a glance without reading a label. Direction itself is conveyed separately, by layout convention (inputs left/top, outputs right/bottom) plus a visible **arrowhead on the wire**, not by the port's shape.

**Current**: traced end to end through the real source (`wwwroot/editor.js`, `wwwroot/editor/core/types.js`, `wwwroot/editor/rendering/renderPorts.js`, `wwwroot/editor/rendering/renderEdges.js`, `wwwroot/app.css`). Every port stores four fields — `direction`, `type`, `name`/`id`, `portGender` — but only two of them do anything functionally:

- **`direction`** is the only thing `canConnectPorts()` (`editor.js:1071-1078`) actually gates on: a connection is legal only `output → input`. `canAttach()` (`editor.js:1067-1069`) additionally caps every input port at one incoming edge, while an output port can fan out to unlimited downstream inputs.
- **`type`** (`string`, `any`, `control`, `adaptive-card`, `adaptive-model`, `adaptive-submission`, ...) is genuinely checked by `typesCompatible()` (`editor/core/types.js:6-15`): exact match, or `any` on either side, or one of a few hardcoded adaptive-* pairs. `type: "control"` is not special-cased here — it behaves like any other type string.
- **`name`/`id`** (the "kind" a human would call `Input`/`Output`/`Exception`/`Control`) has **no schema field of its own** — `Exception` and `Control` are *inferred* at render time in `renderPorts.js` by substring-matching the id/name (`id.includes('exception')`, `name === 'error'`, `id.includes('control')`, etc.), which then only sets a CSS class.
- **`portGender`** (`male`/`female`, defaulting to output→male / input→female when blank) is **purely cosmetic** — `canConnectPorts` never reads it. In `app.css:48-61` it's the *only* CSS that actually exists for any port variant: `.port-male` is a solid filled blue circle nudged outward; `.port-female` is a white circle with a blue outline, flush. **There is no CSS rule anywhere for `.port-exception`, `.port-control`, or any `.port-kind-*` class** — they're added to the DOM and style nothing. A `Control` port and a plain `Output` port are pixel-identical, because both simply have `direction: output`. The only place `Exception` gets any visible treatment at all is the *edge line* color in `renderEdges.js` (red `#d94a5f` vs. gray `#5f6478`) — never the port marker.
- **Loop or conditional ports do not exist anywhere in the codebase** — confirmed by search. Every "loop"/"conditional"/"branch" hit in `wwwroot/` is either a plain data-field label rendered inside the node body (`Loop After Case`, `Loop Mode`, `Branch Match`, `Branches`, per `renderNode.js`) or a node-type sizing constant (`NODE_MIN_WIDTHS`/`NODE_MIN_HEIGHTS`, keyed by type string). There is no `port.type` value, CSS class, or connection rule for either concept. This generalizes the `SwitchActivity` finding to every branching/looping activity in the catalog: routing logic is 100% data-field config, never a port.

So the "I don't remember what a Control port is" experience isn't a memory problem — there is nothing rendered on screen, ever, that distinguishes a Control port from a plain Output port. The concept exists only in a field name and an unstyled CSS class.

**Mechanism-by-mechanism: what our code implies it was reaching for, vs. what n8n actually does**

| Our mechanism | UI problem it implies | How n8n actually solves it |
|---|---|---|
| `position: "custom-{side}-{ratio}%"`, hand-set per port, plus `NODE_MIN_WIDTHS`/`HEIGHTS` tables keyed by type string (`renderPorts.js:28-36`, `editor.js:41-42`) | Fitting several ports along one edge of a variable-size card without overlap. | Not solved by manual percentages — n8n **auto-stacks** additional output dots evenly along the edge (an `IF` node's `true`/`false` are just N outputs, evenly spaced); the node grows to fit. Adding a branch never requires tuning a magic offset for that node type. |
| `portGender` (male filled / female outline circle) — decorative, unused in `canConnectPorts` | Making source vs. destination visually obvious. | Not a port-shape problem at all — n8n uses **layout convention** (inputs left/top, outputs right/bottom) plus a **visible arrowhead on the wire**. Direction is legible without a special port shape. |
| `Exception`/`Control` inferred by substring-matching `id`/`name`, styled by CSS classes that don't exist | Giving certain ports a distinct, always-recognizable meaning. | Error handling is a **declared per-node setting** ("On Error: continue / stop / use error output"), which grows a real, consistently-styled red output when enabled — not a name pattern guessed at render time. Auxiliary connections (tool/memory/model) have a **first-class connection-type enum** in the node definition, each with its own shape (diamond) and line style (dashed). |
| `type` string checked in `typesCompatible()` | Preventing nonsensical connections. | Roughly analogous, but n8n's real lever is connection **role** (Main / AI-Tool / AI-Memory / AI-LanguageModel / ...) — a structural, finite enum with its own shape+color+rules — rather than one open string field asked to double as both data type and port meaning. |
| `canAttach()` — one edge per input, unlimited fan-out per output | Stopping two sources fighting over one input while still allowing broadcast. | **Same rule** — visible in the marketing diagram (one AI node output fans to two destinations). This is the one piece of our current model that already matches n8n; it's just never surfaced with visible rejection feedback when violated. |

**Preference noted**: n8n's approach is the target here — structural, declared port roles with their own shape/line-style, auto-stacked layout, and direction conveyed by convention + arrowhead — rather than the current mix of an unused gender axis, name-sniffed kind detection, and hand-placed percentage positions.

**Takeaway**: adopt n8n's convention directly — pick a shape+line-style pair per port *role*, declared explicitly on the node/activity definition rather than inferred from its name (e.g. main flow = solid circle / solid line, error output = solid circle / dashed red line and gated by an explicit per-node error-handling setting, "auxiliary config" ports like `Card`/`Model` on `AdaptiveCardActivity` = diamond / dashed), auto-stack same-side ports instead of hand-placing percentages, and drop the gender axis in favor of layout convention + wire arrowheads. The shape should encode meaning on its own, not rely on hover text or a name substring match.

## 4. Branch outputs are named ports on the source node, not edge labels bolted on after

**n8n**: the `IF` node has two named outputs, `true` and `false`, each a first-class port with its own wire. The label lives at the port, not floating on the wire.

**Current**: as we found while diagramming `SwitchActivity`, the real editor has exactly **one generic `Output` port** — case/branch routing is entirely a text field (`Case Keys`, `Default Case`), so there's no way to wire "Case A → node X" and "Case B → node Y" as separate connections at all. This is the single biggest structural gap versus n8n's `IF`/`Switch` node model, and it's the reason the "fully wired SwitchActivity" diagram you asked for had to be illustrative rather than something buildable in the live app.

**Takeaway**: this is probably the highest-value single change for the rewrite — give branching activities (`SwitchActivity`, `ConditionalActivity`, `Conditional<QuickAnswer>`, `Conditional<TriggerTopic>`, `DecisionActivity`, `ChoiceActivity`) one output port per case/branch, generated dynamically from the node's case list, the same way n8n generates `true`/`false` ports from an `IF` node's condition.

## 5. Node "chrome" on the canvas is minimal; configuration lives in a side panel

**n8n**: a canvas node is a small rounded box — one icon, one bold title, at most one thin gray subtitle line summarizing key config (`post: message`, `GET: https://webscraper.io/t...`, `extractHtmlContent`). All real configuration happens in a panel that opens on double-click, not inline on the canvas.

**Current**: per `activity-shapes.md`, every real ScriptEditor node renders **all of its parameters as live input/textarea fields directly inside the card body** (e.g. `PromptActivity` shows full `System Prompt` and `User Prompt Template` textareas on the canvas itself). This is why nodes needed the resize-handle workaround to avoid clipped content when capturing snapshots — the node grows to fit arbitrary amounts of configuration, which doesn't scale visually once a flow has more than a few nodes.

**Takeaway**: collapse the on-canvas node to icon + title + one summary line (n8n-style), move full field editing into the existing Inspector/drawer panel. This alone would fix most of the "nodes get huge and cluttered" pressure that's been pushing the canvas toward the resize-handle/overflow problems seen throughout this session.

## 6. Node discovery is contextual, not just a static sidebar list

**n8n**: the "Create Node" panel opens from a "+" on a dangling output port (visible in the scraper screenshot next to "List all products"), pre-wires the new node to that port, and offers `Regular`/`Trigger`/`All` filtering plus per-integration icons and one-line descriptions, on top of a search box.

**Current**: ScriptEditor's palette (`Activities` panel, confirmed via DOM inspection: `div.activity-item[draggable="true"][data-activity-template=...]`) is a flat, always-visible list of all 37 shapes with a single search box and no categorization at all in the live UI (the language-construct categories in `activity-shapes.md` are something I imposed for documentation — the app itself doesn't group them). Adding a node requires a manual drag from a long undifferentiated list; there's no "+" affordance that starts from an existing port and pre-wires the connection.

**Takeaway**: (a) group the palette by category in the actual UI, not just in docs; (b) support "+ add node" directly from a dangling port, auto-connecting the new node instead of requiring a separate drag-then-wire step.

## 7. Top-level chrome is quieter

**n8n**: workflow name + a single `Active` toggle in the top bar; app-level navigation (`Workflows`, `Credentials`, `Executions`) lives in a persistent left rail, separate from the node palette.

**Current**: ScriptEditor's top bar carries the script tab, Duplicate, alignment radio buttons, and a Save Workspace button all at once, and the "Target Project" / "Drag-Drop Diagnostics" / "Adaptive Definitions" panels all compete for the same right-hand Inspector column regardless of whether a node is selected.

**Takeaway**: lower priority than 1-6, but worth folding into the rewrite's layout pass — separate persistent app chrome from per-node/per-script contextual panels the way n8n keeps `Workflows/Credentials/Executions` out of the canvas toolbar entirely.

## 8. Inline execution affordance

**n8n**: a pinned "Execute Workflow" button runs the flow directly from the canvas for fast iteration.

**Current**: ScriptEditor has "Verify ConversaCore Wiring" in the Inspector, which is a static-analysis check, not a live run. There's no equivalent of actually executing the flow from the canvas — the closest thing is the separate `ConversaCore.UI` chat window in the reference app, which isn't reachable from the editor itself.

**Takeaway**: if feasible given `ConversaCore`'s current execution model, a "run this flow" affordance directly on the canvas (even against mock/stubbed inputs) would close a real gap between "I built a diagram" and "I know it works," which is presumably part of why the Gemini prototype's live chatbot preview pane resonated with you.

---

## Priority ranking (highest leverage first)

1. **Branch outputs as real ports** (#4) — structural gap, blocks the exact workflows you described wanting to build.
2. **Port-kind visual language** (#3) — cheap to define, fixes the "I don't remember what a Control port is" problem directly.
3. **Obstacle-aware / loop-aware routing** (#1, #2) — the actual cause of the old editor's routing failures.
4. **Collapsed node chrome + side-panel config** (#5) — addresses canvas clutter and probably simplifies 1-3's geometry problem too (smaller, uniform node sizes are much easier to route around).
5. **Contextual node discovery** (#6) — UX polish, meaningfully faster authoring once 1-5 are solid.
6. **Chrome/navigation cleanup** (#7) and **inline execution** (#8) — valuable but not blocking, can follow once the canvas itself is solid.
