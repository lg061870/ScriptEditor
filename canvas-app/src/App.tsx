import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ConnectionMode,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { DiagramNode } from './components/DiagramNode';
import { RoleEdge } from './components/RoleEdge';
import { Palette, PALETTE_DND_TYPE } from './components/Palette';
import { Inspector } from './components/Inspector';
import { CodePanel } from './components/CodePanel';
import { StatusBar } from './components/StatusBar';
import { ChatPreviewPanel } from './components/ChatPreviewPanel';
import { ResizeHandle } from './components/ResizeHandle';
import { TopicTabBar } from './components/TopicTabBar';
import { ProjectStorageModal } from './components/ProjectStorageModal';
import { saveProject } from './api/projectClient';
import { toReactFlowNodes, toReactFlowEdges } from './mapping/toReactFlow';
import { getActivityDefinition } from './registry/activityDefinitions';
import { useDiagramStore } from './store/diagramStore';

const DEFAULT_PALETTE_WIDTH = 220;
const MIN_PALETTE_WIDTH = 160;
const MAX_PALETTE_WIDTH = 420;

const DEFAULT_INSPECTOR_WIDTH = 280;
const MIN_INSPECTOR_WIDTH = 240;
const MAX_INSPECTOR_WIDTH = 750;
const DEFAULT_CARD_INSPECTOR_WIDTH = 460;

const DEFAULT_PREVIEW_WIDTH = 380;
const MIN_PREVIEW_WIDTH = 300;
const MAX_PREVIEW_WIDTH = 750;

const DEFAULT_CODE_PANEL_HEIGHT = 200;
const MIN_CODE_PANEL_HEIGHT = 80;
const MAX_CODE_PANEL_HEIGHT = 550;

function getSavedDimension(key: string, fallback: number): number {
  try {
    const val = localStorage.getItem(key);
    if (val) {
      const num = parseInt(val, 10);
      if (!isNaN(num)) return num;
    }
  } catch {
    // Ignore in tests or SSR
  }
  return fallback;
}

const nodeTypes = { diagramNode: DiagramNode };
const edgeTypes = { roleEdge: RoleEdge };

export default function App() {
  return (
    <ReactFlowProvider>
      <CanvasApp />
    </ReactFlowProvider>
  );
}

export type ActivePanel = 'toolbox' | 'canvas' | 'inspector' | 'code' | 'preview';

function CanvasApp() {
  // Phase 2.2: the only state this component reads is the store -- there
  // is no local useState<DiagramDocument> anymore. `nodes`/`edges` below
  // are a pure derivation of `document`; every mutation (drag, delete,
  // palette drop, "+", Inspector edit) calls a store action directly via
  // useDiagramStore.getState(), never a local setter.
  const document = useDiagramStore((s) => s.document);
  const selectedNodeIds = useDiagramStore((s) => s.selectedNodeIds);
  const selectedEdgeIds = useDiagramStore((s) => s.selectedEdgeIds);
  const pendingConnection = useDiagramStore((s) => s.pendingConnection);
  const { screenToFlowPosition } = useReactFlow();
  const [activePanel, setActivePanel] = useState<ActivePanel>('canvas');
  const [showPreview, setShowPreview] = useState(false);
  const [paletteWidth, setPaletteWidth] = useState(() =>
    getSavedDimension('scripteditor:paletteWidth', DEFAULT_PALETTE_WIDTH),
  );
  const [inspectorWidth, setInspectorWidth] = useState(() =>
    getSavedDimension('scripteditor:inspectorWidth', DEFAULT_INSPECTOR_WIDTH),
  );
  const [previewWidth, setPreviewWidth] = useState(() =>
    getSavedDimension('scripteditor:previewWidth', DEFAULT_PREVIEW_WIDTH),
  );
  const [codePanelHeight, setCodePanelHeight] = useState(() =>
    getSavedDimension('scripteditor:codePanelHeight', DEFAULT_CODE_PANEL_HEIGHT),
  );
  const [isPreviewFloating, setIsPreviewFloating] = useState(false);
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(() => {
    try {
      return localStorage.getItem('scripteditor:paletteCollapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isCodePanelCollapsed, setIsCodePanelCollapsed] = useState(() => {
    try {
      return localStorage.getItem('scripteditor:codePanelCollapsed') === 'true';
    } catch {
      return false;
    }
  });
  const projectPath = useDiagramStore((s) => s.projectPath);
  const topics = useDiagramStore((s) => s.topics);
  const markWorkspaceSaved = useDiagramStore((s) => s.markWorkspaceSaved);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);

  const isDirtyAny = useMemo(() => topics.some((t) => t.isDirty), [topics]);
  const projectFolderName = useMemo(() => {
    if (!projectPath) return null;
    const parts = projectPath.replace(/[/\\]+$/, '').split(/[/\\]/);
    return parts[parts.length - 1] || projectPath;
  }, [projectPath]);

  const handleQuickSave = useCallback(async () => {
    if (!projectPath) {
      setShowProjectModal(true);
      return;
    }
    setIsSavingProject(true);
    try {
      await saveProject(projectPath, topics, true);
      markWorkspaceSaved();
    } catch (err: any) {
      alert('Save to project failed: ' + (err.message || String(err)));
    } finally {
      setIsSavingProject(false);
    }
  }, [projectPath, topics, markWorkspaceSaved]);

  const handleTogglePaletteCollapse = useCallback(() => {
    setIsPaletteCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('scripteditor:paletteCollapsed', String(next)); } catch { /* ignore */ }
      setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 50);
      return next;
    });
  }, []);

  const handleToggleCodePanelCollapse = useCallback(() => {
    setIsCodePanelCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('scripteditor:codePanelCollapsed', String(next)); } catch { /* ignore */ }
      setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 50);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        typeof (target as any).closest === 'function' &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('.monaco-editor'))
      ) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const store = useDiagramStore.getState();
        if (store.selectedEdgeIds.size > 0) {
          e.preventDefault();
          store.removeEdges(Array.from(store.selectedEdgeIds), 'Canvas');
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleTogglePaletteCollapse();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        handleToggleCodePanelCollapse();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePaletteCollapse, handleToggleCodePanelCollapse]);

  useEffect(() => {
    if (selectedNodeIds.size > 0) {
      setActivePanel('inspector');
    }
  }, [selectedNodeIds]);

  const handlePaletteResize = useCallback((delta: number) => {
    setPaletteWidth((prev) => {
      const next = Math.min(Math.max(prev + delta, MIN_PALETTE_WIDTH), MAX_PALETTE_WIDTH);
      try { localStorage.setItem('scripteditor:paletteWidth', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handlePaletteReset = useCallback(() => {
    setPaletteWidth(DEFAULT_PALETTE_WIDTH);
    try { localStorage.setItem('scripteditor:paletteWidth', String(DEFAULT_PALETTE_WIDTH)); } catch { /* ignore */ }
  }, []);

  const handleInspectorResize = useCallback((delta: number) => {
    setInspectorWidth((prev) => {
      const next = Math.min(Math.max(prev - delta, MIN_INSPECTOR_WIDTH), MAX_INSPECTOR_WIDTH);
      try { localStorage.setItem('scripteditor:inspectorWidth', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleInspectorReset = useCallback(() => {
    setInspectorWidth(DEFAULT_INSPECTOR_WIDTH);
    try { localStorage.setItem('scripteditor:inspectorWidth', String(DEFAULT_INSPECTOR_WIDTH)); } catch { /* ignore */ }
  }, []);

  const handlePreviewResize = useCallback((delta: number) => {
    setPreviewWidth((prev) => {
      const next = Math.min(Math.max(prev - delta, MIN_PREVIEW_WIDTH), MAX_PREVIEW_WIDTH);
      try { localStorage.setItem('scripteditor:previewWidth', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handlePreviewReset = useCallback(() => {
    setPreviewWidth(DEFAULT_PREVIEW_WIDTH);
    try { localStorage.setItem('scripteditor:previewWidth', String(DEFAULT_PREVIEW_WIDTH)); } catch { /* ignore */ }
  }, []);

  const handleCodePanelResize = useCallback((delta: number) => {
    setCodePanelHeight((prev) => {
      const next = Math.min(Math.max(prev - delta, MIN_CODE_PANEL_HEIGHT), MAX_CODE_PANEL_HEIGHT);
      try { localStorage.setItem('scripteditor:codePanelHeight', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleCodePanelReset = useCallback(() => {
    setCodePanelHeight(DEFAULT_CODE_PANEL_HEIGHT);
    try { localStorage.setItem('scripteditor:codePanelHeight', String(DEFAULT_CODE_PANEL_HEIGHT)); } catch { /* ignore */ }
  }, []);

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

  const onRequestDeleteNode = useCallback((nodeId: string) => {
    useDiagramStore.getState().removeNodes([nodeId], 'Canvas');
  }, []);

  const onRequestRenameNode = useCallback((nodeId: string, newName: string) => {
    useDiagramStore.getState().renameNode(nodeId, newName, 'Canvas');
  }, []);

  const onRequestResizeNode = useCallback((nodeId: string, width: number, height: number) => {
    useDiagramStore.getState().resizeNode(nodeId, width, height, 'Canvas');
  }, []);

  const onRequestDeleteEdge = useCallback((edgeId: string) => {
    useDiagramStore.getState().removeEdges([edgeId], 'Canvas');
  }, []);

  // Memoized so identity is stable across renders that don't change
  // `document` -- otherwise React Flow's node-measurement lifecycle sees a
  // "new" node array every render and nodes get stuck at visibility:hidden.
  const nodes = useMemo(
    () =>
      toReactFlowNodes(document, {
        onRequestAddNode,
        onRequestDeleteNode,
        onRequestRenameNode,
        onRequestResizeNode,
        selectedNodeIds,
      }),
    [document, onRequestAddNode, onRequestDeleteNode, onRequestRenameNode, onRequestResizeNode, selectedNodeIds],
  );
  const edges = useMemo(
    () => toReactFlowEdges(document, { selectedEdgeIds, onDeleteEdge: onRequestDeleteEdge }),
    [document, selectedEdgeIds, onRequestDeleteEdge],
  );

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
    const store = useDiagramStore.getState();

    const selectChanges = changes.filter(
      (change): change is Extract<typeof change, { type: 'select' }> => change.type === 'select',
    );
    if (selectChanges.length > 0) {
      const next = new Set(store.selectedEdgeIds);
      for (const change of selectChanges) {
        if (change.selected) next.add(change.id);
        else next.delete(change.id);
      }
      store.setEdgeSelection(next);
    }

    const removeChanges = changes.filter(
      (change): change is Extract<typeof change, { type: 'remove' }> => change.type === 'remove',
    );
    if (removeChanges.length > 0) {
      store.removeEdges(
        removeChanges.map((c) => c.id),
        'Canvas',
      );
    }
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setActivePanel('canvas');
    useDiagramStore.getState().setEdgeSelection(new Set([edge.id]));
  }, []);

  const onPaneClick = useCallback(() => {
    const store = useDiagramStore.getState();
    if (store.selectedEdgeIds.size > 0) {
      store.setEdgeSelection(new Set());
    }
  }, []);

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;

    const store = useDiagramStore.getState();
    const sourceNode = store.document.nodes.find((n) => n.id === connection.source);
    const targetNode = store.document.nodes.find((n) => n.id === connection.target);

    const sourcePortId =
      connection.sourceHandle ?? sourceNode?.ports.find((p) => p.direction === 'output')?.id;
    const targetPortId =
      connection.targetHandle ?? targetNode?.ports.find((p) => p.direction === 'input')?.id;

    if (!sourcePortId || !targetPortId) return;

    const sourcePort = sourceNode?.ports.find((p) => p.id === sourcePortId);
    const targetPort = targetNode?.ports.find((p) => p.id === targetPortId);

    if (!sourcePort || !targetPort) return;

    let fromNodeId = connection.source;
    let fromPortId = sourcePort.id;
    let toNodeId = connection.target;
    let toPortId = targetPort.id;

    // If user dragged in reverse (from input to output), flip them so from is output and to is input
    if (sourcePort.direction === 'input' && targetPort.direction === 'output') {
      fromNodeId = connection.target;
      fromPortId = targetPort.id;
      toNodeId = connection.source;
      toPortId = sourcePort.id;
    } else if (sourcePort.direction === targetPort.direction) {
      // Cannot connect output to output or input to input
      return;
    }

    // Do not connect to self on same port
    if (fromNodeId === toNodeId && fromPortId === toPortId) return;

    // Check if edge already exists
    const exists = store.document.edges.some(
      (e) =>
        e.from.node === fromNodeId &&
        e.from.port === fromPortId &&
        e.to?.node === toNodeId &&
        e.to?.port === toPortId,
    );
    if (exists) return;

    store.connectEdge(
      { node: fromNodeId, port: fromPortId },
      { node: toNodeId, port: toPortId },
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
      event.stopPropagation();
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
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Quiet top-level chrome (Phase 6.6 / Gap #7): separates persistent app navigation from canvas controls */}
      <header
        data-testid="app-chrome-header"
        style={{
          height: 42,
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: '#ffffff',
          fontSize: 13,
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#4f46e5' }}>◈</span> ConversaCore
          </span>
          <span style={{ color: '#d1d5db' }}>/</span>
          <span style={{ color: '#374151', fontWeight: 500 }}>ScriptEditor</span>

          {/* Storage / Project Mode Badge */}
          {projectPath ? (
            <button
              type="button"
              onClick={() => setShowProjectModal(true)}
              data-testid="header-project-badge"
              title={`Project directory: ${projectPath}\nClick to manage workspace or change directory`}
              style={{
                fontSize: 11,
                fontWeight: 500,
                background: '#eff6ff',
                color: '#1d4ed8',
                padding: '2px 8px',
                borderRadius: 12,
                border: '1px solid #bfdbfe',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>📁</span>
              <span>{projectFolderName}</span>
              {isDirtyAny && (
                <span
                  style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }}
                  title="Unsaved changes"
                />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowProjectModal(true)}
              data-testid="header-draft-badge"
              title="Autosaved to browser LocalStorage. Click to link a project directory or export."
              style={{
                fontSize: 11,
                fontWeight: 500,
                background: '#ecfdf5',
                color: '#065f46',
                padding: '2px 8px',
                borderRadius: 12,
                border: '1px solid #a7f3d0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>📝</span>
              <span>Draft (Autosaved)</span>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {projectPath && (
            <button
              type="button"
              onClick={handleQuickSave}
              disabled={isSavingProject}
              data-testid="header-save-project-btn"
              title="Save all topics as .cs and .flow.json to the project directory"
              style={{
                border: isDirtyAny ? '1px solid #2563eb' : '1px solid #cbd5e1',
                background: isDirtyAny ? '#2563eb' : '#ffffff',
                color: isDirtyAny ? '#ffffff' : '#334155',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: isSavingProject ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              <span>💾</span>
              <span>{isSavingProject ? 'Saving...' : 'Save to Project'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowProjectModal(true)}
            data-testid="header-project-storage-btn"
            title="Configure Project Directory & Local Storage Draft"
            style={{
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              borderRadius: 6,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>⚙️</span>
            <span>Storage...</span>
          </button>

          {!showPreview && (
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              data-testid="run-workflow-button"
              title="Compile and run this flow against a live preview"
              style={{
                border: 'none',
                background: '#4f46e5',
                color: '#fff',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              }}
            >
              ▶ Run
            </button>
          )}
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        <div
          onMouseDownCapture={() => setActivePanel('toolbox')}
          style={{ height: '100%', display: 'flex' }}
        >
          <Palette
            width={isPaletteCollapsed ? 28 : paletteWidth}
            isCollapsed={isPaletteCollapsed}
            onToggleCollapse={handleTogglePaletteCollapse}
            pendingConnectionLabel={pendingConnectionLabel}
            onCancelPending={() => useDiagramStore.getState().setPendingConnection(null)}
            onPick={handlePickForPendingConnection}
            isActive={activePanel === 'toolbox'}
          />
        </div>
        {!isPaletteCollapsed && (
          <ResizeHandle
            direction="col"
            onResize={handlePaletteResize}
            onReset={handlePaletteReset}
            data-testid="palette-resize-handle"
          />
        )}
        <div
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: activePanel === 'canvas' ? 'inset 0 0 0 1px #6264a7' : undefined,
            transition: 'box-shadow 0.15s ease',
          }}
          onMouseDown={() => setActivePanel('canvas')}
          data-testid="canvas-surface"
          data-active={activePanel === 'canvas' ? 'true' : 'false'}
        >
          {/* Visual Studio Document Well Tabs */}
          <TopicTabBar
            nodeCount={nodes.length}
            edgeCount={edges.length}
            isActivePanel={activePanel === 'canvas'}
          />

          <div
            data-testid="canvas-drop-zone"
            style={{ flex: 1, position: 'relative', minHeight: 0 }}
            onDrop={onDrop}
            onDragOver={onDragOver}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              onConnect={onConnect}
              connectionMode={ConnectionMode.Loose}
              defaultEdgeOptions={{ type: 'roleEdge' }}
              deleteKeyCode={['Backspace', 'Delete']}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap
                nodeColor={(n) => {
                  const data = n.data as { type?: string } | undefined;
                  const def = data?.type ? getActivityDefinition(data.type) : undefined;
                  return def?.color ?? '#4f46e5';
                }}
                nodeStrokeColor="#1e1b4b"
                nodeStrokeWidth={2}
                nodeBorderRadius={4}
                maskColor="rgba(209, 213, 219, 0.4)"
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  backgroundColor: '#f8fafc',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
                zoomable
                pannable
              />
            </ReactFlow>
          </div>

          {/* Topic Roslyn Code Panel (integrated within the tab) */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              setActivePanel('code');
            }}
            style={{ display: 'flex', flexDirection: 'column' }}
          >
            {!isCodePanelCollapsed && (
              <ResizeHandle
                direction="row"
                onResize={handleCodePanelResize}
                onReset={handleCodePanelReset}
                data-testid="code-panel-resize-handle"
              />
            )}
            <CodePanel
              document={document}
              height={isCodePanelCollapsed ? 28 : codePanelHeight}
              isActive={activePanel === 'code'}
              isCollapsed={isCodePanelCollapsed}
              onToggleCollapse={handleToggleCodePanelCollapse}
            />
          </div>
        </div>
        {selectedNode && (
          <>
            <ResizeHandle
              direction="col"
              onResize={handleInspectorResize}
              onReset={handleInspectorReset}
              data-testid="inspector-resize-handle"
            />
            <div
              onMouseDownCapture={() => setActivePanel('inspector')}
              style={{ height: '100%', display: 'flex' }}
            >
              <Inspector
                width={selectedNode.type === 'AdaptiveCardActivity' && inspectorWidth < 420 ? DEFAULT_CARD_INSPECTOR_WIDTH : inspectorWidth}
                node={selectedNode}
                onUpdateData={onUpdateNodeData}
                onClose={() => useDiagramStore.getState().setSelection(new Set())}
                isActive={activePanel === 'inspector'}
              />
            </div>
          </>
        )}
        {showPreview && !isPreviewFloating && (
          <ResizeHandle
            direction="col"
            onResize={handlePreviewResize}
            onReset={handlePreviewReset}
            data-testid="preview-resize-handle"
          />
        )}
        {showPreview && (
          <div
            onMouseDownCapture={() => setActivePanel('preview')}
            style={{ height: '100%', display: 'flex' }}
          >
            <ChatPreviewPanel
              document={document}
              dockedWidth={previewWidth}
              onClose={() => setShowPreview(false)}
              onFloatingChange={setIsPreviewFloating}
              isActive={activePanel === 'preview'}
            />
          </div>
        )}
      </div>
      <StatusBar nodeCount={document.nodes.length} edgeCount={document.edges.length} activePane={activePanel} />
      <ProjectStorageModal
        isOpen={showProjectModal}
        onClose={() => setShowProjectModal(false)}
      />
    </div>
  );
}
