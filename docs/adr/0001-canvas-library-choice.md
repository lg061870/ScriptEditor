# ADR 0001: Canvas library choice for the ScriptEditor rewrite

## Status
Accepted

## Context
The old `wwwroot/editor.js` hand-rolled DOM/SVG canvas (getBoundingClientRect-based
port positions, manually computed cubic Bezier paths, no obstacle awareness) proved
unmaintainable (see docs/AS_IS_SYSTEM_DOCUMENTATION.md, docs/n8n-feature-gap-analysis.md).
Per docs/superpowers/plans/2026-09-12-n8n-canvas-rewrite.md Phase 0.1, we spiked
React Flow and Rete.js against two concrete requirements:
1. A node whose output-port count is driven by data (per-case branching ports).
2. A loop-back edge that must not visually cross an intervening node.

## Decision
React Flow (`@xyflow/react`).

## Evidence

### React Flow (`spike/reactflow-demo/`)
- **Dynamic ports**: worked exactly as expected. A custom `DynamicPortNode`
  renders one `<Handle>` per entry in `data.cases`, so port count is a pure
  function of data — no template limit. Confirmed visually (3 labeled handles
  on `SwitchActivity`).
- **Non-crossing loop-back edge**: solved with ~10 lines of code. A custom
  edge component (`LoopBackEdge`) computes a 3-segment step path (down to a
  channel below the row, across, up into the target) instead of the library's
  default bezier. Confirmed visually: the loop edge from `RepeatActivity` back
  to `SwitchActivity` runs cleanly below `SimpleActivity` with zero overlap.
- **Friction encountered**: the plan's `NodeProps<{ data: T }>` type signature
  didn't match the installed `@xyflow/react@12.11.6` API — custom node data
  must be wrapped as `Node<T>` (`NodeProps<Node<DynamicPortData>>`). A ~2-line
  fix once identified via the library's own type definitions. The custom edge
  file also needed a `.tsx` extension (not `.ts`) since it returns JSX.
- **Time spent**: well under an hour for both scenarios combined, including
  the type fix.

### Rete.js (`spike/rete-demo/`)
- **Dynamic ports**: worked identically to React Flow. `makeCaseNode` adds one
  output socket per entry in a `cases` array. Confirmed visually (3 labeled
  sockets on `SwitchActivity`).
- **Non-crossing loop-back edge**: **not solved out of the box.** The default
  classic connection preset draws its standard curve straight from source to
  target, passing directly through `SimpleActivity`'s box — no obstacle
  awareness. A custom route *is* a documented extension point
  (`VuePresets.classic.setup({ customize: { connection: (data) => Component } })`,
  and Rete's `Connection` type even carries a built-in `isLoop` flag), but it
  requires authoring a full custom Vue single-file component to compute and
  render the path yourself — substantially more scaffolding than React Flow's
  one small functional edge component for the same result. We did not
  implement this custom component; the spike's time-box treats "needs a full
  custom renderer, not just a path function" as the recorded finding.
- **Friction encountered**: two real typing/setup issues surfaced against the
  installed versions, neither in the library's core value proposition:
  - `ConnectionPlugin<Schemes, never>` / `VuePlugin<Schemes, never>` (as
    written in the plan) do not typecheck. Rete's Scope-based signal
    composition requires a shared `AreaExtra` type (derived from
    `VueArea2D<Schemes>`) passed consistently to `AreaPlugin`,
    `ConnectionPlugin`, and `VuePlugin` — a pattern that has to be reverse
    engineered from the library's `.d.ts` files rather than being obvious
    from a first-time setup.
  - The vanilla-ts starter's `main.ts` imports `./style.css`, which is what
    gives `#app` its `min-height: 100svh` sizing. Once `main.ts` is rewritten
    to just call `createEditor`, that import is easy to drop — and doing so
    silently leaves `#app` at zero height. Rete's `AreaPlugin` renders its
    canvas as absolutely-positioned content inside the container it's given,
    so it does not force any size on that container itself; the nodes were
    correctly present in the DOM the whole time, just invisible, with **no
    console error** to point at the cause. This cost real debugging time
    (had to inspect computed styles and DOM structure directly to find it).
  - By contrast, React Flow's demo needed no external stylesheet at all —
    the root `<div>` in `App.tsx` sets its own `width: '100vw', height:
    '100vh'` inline, so the component is self-contained regardless of what
    CSS does or doesn't exist around it.
- **Time spent**: setup and dynamic ports were comparably fast to React Flow;
  the loop-back scenario was where the two libraries diverged — React Flow
  needed a small custom function, Rete would need a custom component we chose
  not to build within the spike's time-box, consistent with the plan's "more
  than an hour of fighting is itself a data point" rule.

### Licensing
- React Flow (`@xyflow/react`): MIT.
- Rete.js core (`rete`): MIT. `rete-area-plugin`, `rete-connection-plugin`,
  `rete-render-utils`, `rete-vue-plugin`: all MIT.

### Ecosystem/maintenance
- Both libraries have current, actively-published npm packages and installed
  without dependency conflicts (`@xyflow/react@12.11.6`; `rete@2.x` plugin
  family). React Flow's TypeScript types matched its documented custom-node
  pattern (`NodeProps<Node<T>>`) once found; Rete's types are more intricate
  (Scope/Signal generics spanning three separate plugin packages), which
  raises the ongoing cost of any future change to the canvas beyond what the
  spike covered — a maintainability signal, not just a one-time setup cost.

## Consequences
- Phase 0.2 scaffolds the real frontend app on **React Flow** (`@xyflow/react`).
- Obstacle-aware routing in general (beyond the single loop-back case tested
  here) still requires fully custom edge path logic in React Flow — the
  built-in step/bezier/smoothstep edges have no concept of node geometry.
  Phase 4.5 (or wherever general obstacle avoidance lands in the roadmap)
  should budget real design and implementation time for this; the spike only
  proves the *mechanism* (a custom edge component can compute an arbitrary
  path) exists and is cheap to invoke, not that arbitrary-graph obstacle
  avoidance is free.
- The port-role visual language the user wants (solid circle/line for main
  flow; diamond/dashed for AI Agent tool/memory/model inputs) is unstyled in
  both spikes — pure default `Handle`/`Socket` appearance. This is real,
  separate work for Phase 1+ regardless of library choice, not something
  either spike's result changes.

## Spike code
Retained temporarily at `spike/reactflow-demo/` and `spike/rete-demo/` for reference;
delete both once Phase 0.2 is underway (tracked in that issue).
