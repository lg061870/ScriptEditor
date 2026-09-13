import { useCallback, useMemo, type DragEvent } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useReactFlow, type OnNodesChange, type OnEdgesChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { DiagramNode } from './components/DiagramNode';
import { RoleEdge } from './components/RoleEdge';
import { Palette, PALETTE_DND_TYPE } from './components/Palette';
import { Inspector } from './components/Inspector';
import { CodePanel } from './components/CodePanel';
import { toReactFlowNodes, toReactFlowEdges } from './mapping/toReactFlow';
import { useDiagramStore } from './store/diagramStore';

const nodeTypes = { diagramNode: DiagramNode };
const edgeTypes = { roleEdge: RoleEdge };

export default function App() {
  return (
    <ReactFlowProvider>
      <CanvasApp />
    </ReactFlowProvider>
  );
}

function CanvasApp() {
  // Phase 2.2: the only state this component reads is the store -- there
  // is no local useState<DiagramDocument> anymore. `nodes`/`edges` below
  // are a pure derivation of `document`; every mutation (drag, delete,
  // palette drop, "+", Inspector edit) calls a store action directly via
  // useDiagramStore.getState(), never a local setter.
  const document = useDiagramStore((s) => s.document);
  const selectedNodeIds = useDiagramStore((s) => s.selectedNodeIds);
  const pendingConnection = useDiagramStore((s) => s.pendingConnection);
  const { screenToFlowPosition } = useReactFlow();

  const onUpdateNodeData = useCallback((nodeId: string, key: string, value: string) => {
    useDiagramStore.getState().updateNodeData(nodeId, key, value, 'Inspector');
  }, []);

  // Phase 1.4: clicking "+" on a dangling output port arms this instead of
  // creating anything directly -- the palette then switches into
  // click-to-add mode (handlePickForPendingConnection below) so the user
  // picks what gets wired to that exact port.
  const onRequestAddNode = useCallback((nodeId: string, portId: string) => {
    useDiagramStore.getState().setPendingConnection({ sourceNodeId: nodeId, sourcePortId: portId });
  }, []);

  // Memoized so identity is stable across renders that don't change
  // `document` -- otherwise React Flow's node-measurement lifecycle sees a
  // "new" node array every render and nodes get stuck at visibility:hidden.
  const nodes = useMemo(
    () => toReactFlowNodes(document, { onRequestAddNode, selectedNodeIds }),
    [document, onRequestAddNode, selectedNodeIds],
  );
  const edges = useMemo(() => toReactFlowEdges(document), [document]);

  // Position drags, selection, and delete all flow back into the store
  // here -- `nodes` above is always freshly derived from the store, so
  // without this the canvas would be non-interactive. Critically, this
  // only reacts to `position`, `select`, and `remove` changes: React Flow
  // also fires `dimensions` (its own measurement pass) through this same
  // callback, and that's a transient rendering fact, not part of the JSON
  // SSOT. Writing it into the store unconditionally would create a new
  // `document` reference every measurement tick -> new memoized `nodes` ->
  // re-measure -> onNodesChange again -> infinite loop (this is exactly
  // what caused nodes to get stuck at visibility:hidden with a runaway
  // ResizeObserver loop during Phase 1.3 development).
  const onNodesChange: OnNodesChange = useCallback((changes) => {
    const store = useDiagramStore.getState();

    const positionChanges = changes.filter(
      (change): change is Extract<typeof change, { type: 'position' }> =>
        change.type === 'position' && change.position !== undefined,
    );
    for (const change of positionChanges) {
      store.moveNode(change.id, change.position!, 'Canvas');
    }

    // A click batch can carry both a deselect for the previous node and a
    // select for the new one (in either order), and a marquee drag can
    // carry several selects at once with no deselects -- so merge every
    // change into the existing selection set rather than assuming a
    // single winner. React Flow's dedicated onSelectionChange prop does
    // NOT fire for a plain single-node click in this version (confirmed
    // during Phase 1.5 development); only onNodesChange's `select`
    // changes arrive reliably.
    const selectChanges = changes.filter(
      (change): change is Extract<typeof change, { type: 'select' }> => change.type === 'select',
    );
    if (selectChanges.length > 0) {
      const next = new Set(store.selectedNodeIds);
      for (const change of selectChanges) {
        if (change.selected) next.add(change.id);
        else next.delete(change.id);
      }
      store.setSelection(next);
    }

    const removeChanges = changes.filter(
      (change): change is Extract<typeof change, { type: 'remove' }> => change.type === 'remove',
    );
    if (removeChanges.length > 0) {
      store.removeNodes(
        removeChanges.map((c) => c.id),
        'Canvas',
      );
    }
  }, []);

  const onEdgesChange: OnEdgesChange = useCallback((changes) => {
    const removeChanges = changes.filter(
      (change): change is Extract<typeof change, { type: 'remove' }> => change.type === 'remove',
    );
    if (removeChanges.length === 0) return;
    useDiagramStore.getState().removeEdges(
      removeChanges.map((c) => c.id),
      'Canvas',
    );
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
      useDiagramStore.getState().addNode(type, position, 'Canvas');
    },
    [screenToFlowPosition],
  );

  const handlePickForPendingConnection = useCallback(
    (type: string) => {
      const store = useDiagramStore.getState();
      if (!store.pendingConnection) return;
      const { sourceNodeId, sourcePortId } = store.pendingConnection;

      const sourceNode = store.document.nodes.find((n) => n.id === sourceNodeId);
      const position = sourceNode ? { x: sourceNode.x + 280, y: sourceNode.y } : { x: 0, y: 0 };
      const newNodeId = store.addNode(type, position, 'Canvas');
      const newNode = useDiagramStore.getState().document.nodes.find((n) => n.id === newNodeId)!;
      const targetInputPort = newNode.ports.find((p) => p.direction === 'input');

      if (targetInputPort) {
        store.connectEdge(
          { node: sourceNodeId, port: sourcePortId },
          { node: newNodeId, port: targetInputPort.id },
          'Canvas',
        );
      }

      store.setPendingConnection(null);
    },
    [],
  );

  const pendingConnectionLabel = useMemo(() => {
    if (!pendingConnection) return null;
    const sourceNode = document.nodes.find((n) => n.id === pendingConnection.sourceNodeId);
    const port = sourceNode?.ports.find((p) => p.id === pendingConnection.sourcePortId);
    return `${sourceNode?.name ?? sourceNode?.type ?? pendingConnection.sourceNodeId} → ${port?.name ?? pendingConnection.sourcePortId}`;
  }, [pendingConnection, document.nodes]);

  // Inspector only makes sense for exactly one selected node (matching
  // typical n8n/canvas-editor behavior) -- with a multi-selection it stays
  // closed rather than picking an arbitrary one to show.
  const selectedNode =
    selectedNodeIds.size === 1 ? (document.nodes.find((n) => selectedNodeIds.has(n.id)) ?? null) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Palette
          pendingConnectionLabel={pendingConnectionLabel}
          onCancelPending={() => useDiagramStore.getState().setPendingConnection(null)}
          onPick={handlePickForPendingConnection}
        />
        <div style={{ flex: 1 }} onDrop={onDrop} onDragOver={onDragOver} data-testid="canvas-surface">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
        {selectedNode && (
          <Inspector
            node={selectedNode}
            onUpdateData={onUpdateNodeData}
            onClose={() => useDiagramStore.getState().setSelection(new Set())}
          />
        )}
      </div>
      <CodePanel document={document} />
    </div>
  );
}
