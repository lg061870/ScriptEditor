# Phase 0.1 — Canvas Library Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two throwaway demos (React Flow, Rete.js) that each reproduce the two hardest geometry requirements from `docs/n8n-feature-gap-analysis.md`, then record a decisive recommendation as an ADR so Phase 0.2 onward can commit to one library.

**Architecture:** Two standalone Vite+TypeScript demo apps living under `spike/reactflow-demo/` and `spike/rete-demo/` in this repo (throwaway — will be deleted after the ADR is written; the real app scaffold happens in Phase 0.2 using whichever library wins). Each demo proves the same two scenarios so they're directly comparable.

**Tech Stack:** Vite, TypeScript, `@xyflow/react` (React Flow) for demo A; `rete`, `rete-area-plugin`, `rete-connection-plugin`, `rete-render-utils` + a renderer plugin for demo B.

**Spec:** GitHub issue #2 ("Spike: evaluate React Flow vs. Rete.js against our exact needs"), `docs/n8n-feature-gap-analysis.md` §1-4 (obstacle-aware routing, loop routing, port-role visual language, dynamic per-case ports), `docs/superpowers/plans/2026-09-12-n8n-canvas-rewrite.md` (Phase 0.1 row).

## Global Constraints

- This is a spike, not production code: no test suite is required for the demo apps themselves, but the two proof scenarios below are the acceptance bar — if a library can't cleanly do both, that's a real finding, not a failure to hide.
- Both demos must implement the *same* two scenarios so the comparison is apples-to-apples.
- Time-box: this should take at most a day of focused work. If a library needs more than an hour of fighting to get a scenario working, that itself is a data point for the ADR.
- Do not commit `node_modules/` — add `spike/*/node_modules` to `.gitignore` before the first commit.

---

### Task 1: Scaffold both demo apps

**Files:**
- Create: `spike/reactflow-demo/` (Vite React-TS template)
- Create: `spike/rete-demo/` (Vite Vanilla-TS template)
- Modify: `.gitignore` (add spike node_modules/dist)

**Interfaces:**
- Produces: two runnable dev servers, one per demo, each showing a blank canvas.

- [ ] **Step 1: Scaffold the React Flow demo**

```bash
cd spike
npm create vite@latest reactflow-demo -- --template react-ts
cd reactflow-demo
npm install
npm install @xyflow/react
```

- [ ] **Step 2: Scaffold the Rete.js demo**

```bash
cd spike
npm create vite@latest rete-demo -- --template vanilla-ts
cd rete-demo
npm install
npm install rete rete-area-plugin rete-connection-plugin rete-render-utils rete-vue-plugin vue
```

(Rete's own renderers are typically React/Vue/vanilla-DOM plugins on top of the framework-agnostic core — `rete-vue-plugin` is the more mature rendering plugin as of Rete 2.x; if it's unavailable at install time, fall back to `rete-react-plugin` and note that substitution in the ADR.)

- [ ] **Step 3: Update `.gitignore`**

```
spike/*/node_modules
spike/*/dist
```

- [ ] **Step 4: Verify both dev servers boot**

```bash
cd spike/reactflow-demo && npm run dev
```

Expected: Vite prints a local URL; the default Vite+React starter page loads with no console errors.

```bash
cd spike/rete-demo && npm run dev
```

Expected: same, for the vanilla-ts starter page.

- [ ] **Step 5: Commit**

```bash
git add spike/reactflow-demo/package.json spike/reactflow-demo/package-lock.json spike/rete-demo/package.json spike/rete-demo/package-lock.json .gitignore
git commit -m "spike: scaffold React Flow and Rete.js demo apps for Phase 0.1"
```

(Only commit lockfiles/manifests here — source files land in later tasks' commits.)

---

### Task 2: React Flow demo — 3 dynamic output ports + non-crossing loop-back edge

**Files:**
- Modify: `spike/reactflow-demo/src/App.tsx`
- Create: `spike/reactflow-demo/src/DynamicPortNode.tsx`
- Create: `spike/reactflow-demo/src/loopEdge.ts`

**Interfaces:**
- Produces: a rendered graph proving (a) a node whose output-handle count is driven by a data array (simulating per-case ports), and (b) an edge from a downstream node back to an upstream one that visibly avoids passing through an intervening node.

- [ ] **Step 1: Write the dynamic-port custom node**

```tsx
// spike/reactflow-demo/src/DynamicPortNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';

export type DynamicPortData = { label: string; cases: string[] };

export function DynamicPortNode({ data }: NodeProps<{ data: DynamicPortData }>) {
  const cases = data.cases;
  return (
    <div style={{ padding: 10, border: '1px solid #333', borderRadius: 6, background: '#fff', minWidth: 140 }}>
      <Handle type="target" position={Position.Left} id="in" />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{data.label}</div>
      {cases.map((c, i) => (
        <div key={c} style={{ position: 'relative', fontSize: 11, padding: '4px 0' }}>
          {c}
          <Handle
            type="source"
            position={Position.Right}
            id={`case-${i}`}
            style={{ top: '50%' }}
          />
        </div>
      ))}
    </div>
  );
}
```

This is the proof point for issue #29 (dynamic per-case output ports) — the handle count comes directly from `data.cases.length`, not a fixed template.

- [ ] **Step 2: Write a loop-back edge that routes around an intervening node**

```ts
// spike/reactflow-demo/src/loopEdge.ts
import { getSmoothStepPath, type EdgeProps } from '@xyflow/react';

// A minimal "channel" router: if the edge goes backward (target left of source),
// drop below the row, run left, then rise into the target — never a straight
// line through whatever sits between them.
export function LoopBackEdge({ sourceX, sourceY, targetX, targetY, id, markerEnd }: EdgeProps) {
  const channelY = Math.max(sourceY, targetY) + 80;
  const path = `M ${sourceX} ${sourceY} L ${sourceX} ${channelY} L ${targetX} ${channelY} L ${targetX} ${targetY}`;
  return <path id={id} className="react-flow__edge-path" d={path} markerEnd={markerEnd} />;
}
```

- [ ] **Step 3: Wire both into `App.tsx` with a 3-node layout that would collide without the channel**

```tsx
// spike/reactflow-demo/src/App.tsx
import { useCallback, useState } from 'react';
import { ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type OnConnect, type OnNodesChange, type OnEdgesChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { DynamicPortNode } from './DynamicPortNode';
import { LoopBackEdge } from './loopEdge';

const nodeTypes = { dynamicPort: DynamicPortNode };
const edgeTypes = { loopBack: LoopBackEdge };

const initialNodes: Node[] = [
  { id: 'switch', type: 'dynamicPort', position: { x: 0, y: 0 },
    data: { label: 'SwitchActivity', cases: ['Case A', 'Case B', 'Case C'] } },
  { id: 'middle', type: 'dynamicPort', position: { x: 260, y: 0 },
    data: { label: 'SimpleActivity', cases: ['Output'] } },
  { id: 'far', type: 'dynamicPort', position: { x: 520, y: 0 },
    data: { label: 'RepeatActivity', cases: ['Output'] } },
];

const initialEdges: Edge[] = [
  { id: 'e1', source: 'switch', sourceHandle: 'case-0', target: 'middle', targetHandle: 'in' },
  { id: 'e2', source: 'middle', sourceHandle: 'case-0', target: 'far', targetHandle: 'in' },
  // The proof edge: 'far' looping back to 'switch' must NOT cross through 'middle'.
  { id: 'loop', type: 'loopBack', source: 'far', sourceHandle: 'case-0', target: 'switch', targetHandle: 'in' },
];

export default function App() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const onNodesChange: OnNodesChange = useCallback((c) => setNodes((n) => applyNodeChanges(c, n)), []);
  const onEdgesChange: OnEdgesChange = useCallback((c) => setEdges((e) => applyEdgeChanges(c, e)), []);
  const onConnect: OnConnect = useCallback((c) => setEdges((e) => addEdge(c, e)), []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 4: Run and visually verify**

```bash
cd spike/reactflow-demo && npm run dev
```

Expected, in the browser: the `SwitchActivity` node shows three labeled output handles (`Case A`/`Case B`/`Case C`); the `loop` edge from `RepeatActivity` back to `SwitchActivity` runs below the row and does not overlap `SimpleActivity`'s box.

- [ ] **Step 5: Commit**

```bash
git add spike/reactflow-demo/src
git commit -m "spike: React Flow demo proves dynamic ports + non-crossing loop edge"
```

---

### Task 3: Rete.js demo — same two scenarios

**Files:**
- Modify: `spike/rete-demo/src/main.ts`
- Create: `spike/rete-demo/src/editor.ts`

**Interfaces:**
- Produces: the same two proof points (dynamic output-socket count from a data array; a loop-back connection visibly routed around an intervening node), built on Rete's plugin architecture.

- [ ] **Step 1: Write the editor setup with a dynamic-socket node factory**

```ts
// spike/rete-demo/src/editor.ts
import { NodeEditor, ClassicPreset } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { VuePlugin, Presets as VuePresets } from 'rete-vue-plugin';

type Schemes = { Node: ClassicPreset.Node; Connection: ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node> };

function makeCaseNode(label: string, cases: string[]) {
  const node = new ClassicPreset.Node(label);
  node.addInput('in', new ClassicPreset.Input(new ClassicPreset.Socket('flow')));
  cases.forEach((c, i) => {
    node.addOutput(`case-${i}`, new ClassicPreset.Output(new ClassicPreset.Socket('flow'), c));
  });
  return node;
}

export async function createEditor(container: HTMLElement) {
  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, never>(container);
  const connection = new ConnectionPlugin<Schemes, never>();
  const render = new VuePlugin<Schemes, never>();

  connection.addPreset(ConnectionPresets.classic.setup());
  render.addPreset(VuePresets.classic.setup());

  editor.use(area);
  area.use(connection);
  area.use(render);

  const switchNode = makeCaseNode('SwitchActivity', ['Case A', 'Case B', 'Case C']);
  const middleNode = makeCaseNode('SimpleActivity', ['Output']);
  const farNode = makeCaseNode('RepeatActivity', ['Output']);

  await editor.addNode(switchNode);
  await editor.addNode(middleNode);
  await editor.addNode(farNode);

  await area.translate(switchNode.id, { x: 0, y: 0 });
  await area.translate(middleNode.id, { x: 320, y: 0 });
  await area.translate(farNode.id, { x: 640, y: 0 });

  await editor.addConnection(new ClassicPreset.Connection(switchNode, 'case-0', middleNode, 'in'));
  await editor.addConnection(new ClassicPreset.Connection(middleNode, 'case-0', farNode, 'in'));
  // Proof connection: does Rete's connection plugin give us a way to route this
  // around middleNode, or only a straight/bezier line through it? Record the
  // finding either way — this is the crux of the comparison.
  await editor.addConnection(new ClassicPreset.Connection(farNode, 'case-0', switchNode, 'in'));

  AreaExtensions.zoomAt(area, editor.getNodes());
  return editor;
}
```

- [ ] **Step 2: Wire it up in `main.ts`**

```ts
// spike/rete-demo/src/main.ts
import { createEditor } from './editor';

const container = document.getElementById('app') as HTMLElement;
createEditor(container);
```

- [ ] **Step 3: Run and visually verify**

```bash
cd spike/rete-demo && npm run dev
```

Expected: three nodes render; `SwitchActivity` shows three labeled output sockets. Specifically check whether the loop-back connection crosses `SimpleActivity`'s box — **record the actual result, don't assume**. If Rete's default connection plugin draws a straight/bezier line through the middle node, note whether a custom connection path (similar to Task 2 Step 2's approach) is documented/supported, and how much custom code it would take.

- [ ] **Step 4: Commit**

```bash
git add spike/rete-demo/src
git commit -m "spike: Rete.js demo attempts dynamic sockets + loop connection"
```

---

### Task 4: Write the comparison ADR

**Files:**
- Create: `docs/adr/0001-canvas-library-choice.md`

**Interfaces:**
- Consumes: the working (or partially-working, or broken) state of both demos from Tasks 2-3.
- Produces: a decision that Phase 0.2 (frontend scaffold) and all of Phase 1 depend on.

- [ ] **Step 1: Write the ADR using this template, filled in with real findings from Tasks 2-3**

```markdown
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
[State which library was chosen.]

## Evidence
- React Flow: [what worked / didn't, out of the box vs. custom code required, from spike/reactflow-demo]
- Rete.js: [same, from spike/rete-demo]
- Licensing: React Flow (@xyflow/react) is MIT. Rete.js core is MIT; confirm plugin licenses used.
- Ecosystem/maintenance: [note release cadence, GitHub activity, TypeScript support quality observed while spiking]

## Consequences
- Phase 0.2 scaffolds the real frontend app on [chosen library].
- [Any specific spike finding that changes a later phase's plan, e.g. "obstacle-aware
  routing requires fully custom edge path functions in both libraries — Phase 4.5
  should budget for that regardless of choice."]

## Spike code
Retained temporarily at `spike/reactflow-demo/` and `spike/rete-demo/` for reference;
delete both once Phase 0.2 is underway (tracked in that issue).
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0001-canvas-library-choice.md
git commit -m "docs: record ADR 0001, canvas library choice from Phase 0.1 spike"
```

- [ ] **Step 3: Close out the GitHub issue**

```bash
gh issue comment 2 --body "Spike complete. Decision recorded in docs/adr/0001-canvas-library-choice.md."
gh issue close 2
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers scaffolding both demos (issue #2's setup); Tasks 2-3 cover the two concrete proof scenarios named in the roadmap (dynamic ports, obstacle/loop routing); Task 4 covers the required ADR output. All of issue #2's acceptance criteria are addressed.
- **Type consistency:** `DynamicPortData`/`cases: string[]` in Task 2 matches the `case-${i}` handle-id convention used in both the React Flow node and edge files.
- **No placeholders:** every step has runnable commands or complete code; the one open-ended part (the ADR's "which library was chosen" and evidence bullets) is explicitly an output to fill in from the spike's actual results, not a deferred implementation detail — that's the whole point of a spike.
