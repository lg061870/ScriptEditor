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
import { Inspector } from './components/Inspector';
import { toReactFlowNodes, toReactFlowEdges } from './mapping/toReactFlow';
import { createDiagramNode, nextEdgeId } from './actions/createNode';
import { sampleDocument } from './fixtures/sampleDocument';
import type { DiagramDocument } from './schema/diagram';

interface PendingConnection {
  sourceNodeId: string;
  sourcePortId: string;
}

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
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const onUpdateNodeData = useCallback((nodeId: string, key: string, value: string) => {
    setDoc((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, [key]: value } } : n)),
    }));
  }, []);

  // Phase 1.4: clicking "+" on a dangling output port arms this instead of
  // creating anything directly -- the palette then switches into
  // click-to-add mode (handlePickForPendingConnection below) so the user
  // picks what gets wired to that exact port.
  const onRequestAddNode = useCallback((nodeId: string, portId: string) => {
    setPendingConnection({ sourceNodeId: nodeId, sourcePortId: portId });
  }, []);

  // Memoized so identity is stable across renders that don't change `doc`
  // -- otherwise React Flow's node-measurement lifecycle sees a "new" node
  // array every render and nodes get stuck at visibility:hidden.
  const nodes = useMemo(
    () => toReactFlowNodes(doc, { onRequestAddNode, selectedNodeId }),
    [doc, onRequestAddNode, selectedNodeId],
  );
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
    if (positionChanges.length > 0) {
      setDoc((d) => {
        const byId = new Map(positionChanges.map((c) => [c.id, c.position!]));
        return {
          ...d,
          nodes: d.nodes.map((n) => (byId.has(n.id) ? { ...n, x: byId.get(n.id)!.x, y: byId.get(n.id)!.y } : n)),
        };
      });
    }

    // Selection drives the Inspector panel (Phase 1.5). This is the only
    // reliable place it arrives: React Flow's dedicated onSelectionChange
    // prop does NOT fire for a plain single-node click in this version --
    // only onNodesChange receives the `select` change (confirmed by
    // instrumenting both during development). A click batch can carry
    // both a deselect for the previous node and a select for the new one
    // in either order, so find the one with `selected: true` rather than
    // just taking the first 'select' change; none found means the click
    // deselected everything (e.g. clicked empty canvas) -> close the panel.
    const selectChanges = changes.filter(
      (change): change is Extract<typeof change, { type: 'select' }> => change.type === 'select',
    );
    if (selectChanges.length > 0) {
      const newlySelected = selectChanges.find((change) => change.selected);
      setSelectedNodeId(newlySelected ? newlySelected.id : null);
    }
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

  const handlePickForPendingConnection = useCallback(
    (type: string) => {
      if (!pendingConnection) return;

      setDoc((d) => {
        const sourceNode = d.nodes.find((n) => n.id === pendingConnection.sourceNodeId);
        const position = sourceNode ? { x: sourceNode.x + 280, y: sourceNode.y } : { x: 0, y: 0 };
        const newNode = createDiagramNode(type, position);
        const targetInputPort = newNode.ports.find((p) => p.direction === 'input');

        const newEdge = {
          id: nextEdgeId(),
          from: { node: pendingConnection.sourceNodeId, port: pendingConnection.sourcePortId },
          ...(targetInputPort
            ? { to: { node: newNode.id, port: targetInputPort.id } }
            : {}),
        };

        return { ...d, nodes: [...d.nodes, newNode], edges: [...d.edges, newEdge] };
      });

      setPendingConnection(null);
    },
    [pendingConnection],
  );

  const pendingConnectionLabel = useMemo(() => {
    if (!pendingConnection) return null;
    const sourceNode = doc.nodes.find((n) => n.id === pendingConnection.sourceNodeId);
    const port = sourceNode?.ports.find((p) => p.id === pendingConnection.sourcePortId);
    return `${sourceNode?.name ?? sourceNode?.type ?? pendingConnection.sourceNodeId} → ${port?.name ?? pendingConnection.sourcePortId}`;
  }, [pendingConnection, doc.nodes]);

  const selectedNode = selectedNodeId ? (doc.nodes.find((n) => n.id === selectedNodeId) ?? null) : null;

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      <Palette
        pendingConnectionLabel={pendingConnectionLabel}
        onCancelPending={() => setPendingConnection(null)}
        onPick={handlePickForPendingConnection}
      />
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
      {selectedNode && (
        <Inspector node={selectedNode} onUpdateData={onUpdateNodeData} onClose={() => setSelectedNodeId(null)} />
      )}
    </div>
  );
}
