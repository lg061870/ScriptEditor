import { useCallback, useMemo, useState, type DragEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { DiagramNode } from './components/DiagramNode';
import { Palette, PALETTE_DND_TYPE } from './components/Palette';
import { toReactFlowNodes, toReactFlowEdges } from './mapping/toReactFlow';
import { createDiagramNode } from './actions/createNode';
import { sampleDocument } from './fixtures/sampleDocument';
import type { DiagramDocument } from './schema/diagram';

const nodeTypes = { diagramNode: DiagramNode };

export default function App() {
  return (
    <ReactFlowProvider>
      <CanvasApp />
    </ReactFlowProvider>
  );
}

function CanvasApp() {
  const [doc, setDoc] = useState<DiagramDocument>(sampleDocument);
  const { screenToFlowPosition } = useReactFlow();

  // Memoized so identity is stable across renders that don't change `doc`
  // -- otherwise React Flow's node-measurement lifecycle sees a "new" node
  // array every render and nodes get stuck at visibility:hidden.
  const nodes = useMemo(() => toReactFlowNodes(doc), [doc]);
  const edges = useMemo(() => toReactFlowEdges(doc), [doc]);

  // Position drags flow back into `doc` here -- `nodes` above is always
  // freshly derived from `doc`, so without this the canvas would be
  // non-interactive. Critically, this only reacts to `position` changes:
  // React Flow also fires `dimensions` (its own measurement pass) and
  // `select` changes through this same callback, and those are transient
  // rendering/UI facts, not part of the JSON SSOT. Writing them into `doc`
  // unconditionally would create a new `doc` reference every measurement
  // tick -> new memoized `nodes` -> re-measure -> onNodesChange again ->
  // infinite loop (this is exactly what caused nodes to get stuck at
  // visibility:hidden with a runaway ResizeObserver loop before this fix).
  const onNodesChange: OnNodesChange = useCallback((changes) => {
    const positionChanges = changes.filter(
      (change): change is Extract<typeof change, { type: 'position' }> =>
        change.type === 'position' && change.position !== undefined,
    );
    if (positionChanges.length === 0) return;

    setDoc((d) => {
      const byId = new Map(positionChanges.map((c) => [c.id, c.position!]));
      return {
        ...d,
        nodes: d.nodes.map((n) => (byId.has(n.id) ? { ...n, x: byId.get(n.id)!.x, y: byId.get(n.id)!.y } : n)),
      };
    });
  }, []);

  const onEdgesChange: OnEdgesChange = useCallback((changes) => {
    const removeChanges = changes.filter(
      (change): change is Extract<typeof change, { type: 'remove' }> => change.type === 'remove',
    );
    if (removeChanges.length === 0) return;

    setDoc((d) => {
      const removeIds = new Set(removeChanges.map((c) => c.id));
      return { ...d, edges: d.edges.filter((e) => !removeIds.has(e.id)) };
    });
  }, []);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData(PALETTE_DND_TYPE);
      if (!type) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const newNode = createDiagramNode(type, position);
      setDoc((d) => ({ ...d, nodes: [...d.nodes, newNode] }));
    },
    [screenToFlowPosition],
  );

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      <Palette />
      <div style={{ flex: 1 }} onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}
