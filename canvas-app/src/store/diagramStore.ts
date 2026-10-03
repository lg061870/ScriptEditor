import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DiagramDocument, DiagramEndpoint, DiagramPortSide, TopicDocument } from '../schema/diagram';
import { sampleDocument } from '../fixtures/sampleDocument';
import { createDiagramNode, nextEdgeId, buildPortsFromDefs } from '../actions/createNode';
import { resolveActivityPortDefs } from '../registry/activityDefinitions';
import { computeGraphReachability } from '../analysis/graphReachability';

export type MutationOrigin = 'Canvas' | 'CodeEditor' | 'Inspector';

export interface PendingConnection {
  sourceNodeId: string;
  sourcePortId: string;
}

export interface DiagramStoreState {
  topics: TopicDocument[];
  activeTopicId: string;
  document: DiagramDocument;
  versionId: number;

  projectPath: string | null;
  lastSavedAt: string | null;

  codeRegenRequestCount: number;

  selectedNodeIds: ReadonlySet<string>;
  selectedEdgeIds: ReadonlySet<string>;
  pendingConnection: PendingConnection | null;

  // Multi-Topic Management
  addTopic: (name?: string) => string;
  selectTopic: (topicId: string) => void;
  renameTopic: (topicId: string, newName: string) => void;
  deleteTopic: (topicId: string) => void;
  duplicateTopic: (topicId: string) => void;
  setInitialTopic: (topicId: string) => void;

  // Project & Persistence Management
  setProjectPath: (path: string | null) => void;
  resetToStarter: () => void;
  loadWorkspace: (topics: TopicDocument[], activeTopicId?: string, projectPath?: string | null) => void;
  markWorkspaceSaved: () => void;

  addNode: (type: string, position: { x: number; y: number }, origin: MutationOrigin) => string;
  moveNode: (nodeId: string, position: { x: number; y: number }, origin: MutationOrigin) => void;
  renameNode: (nodeId: string, name: string, origin?: MutationOrigin) => void;
  resizeNode: (nodeId: string, width: number, height: number, origin?: MutationOrigin) => void;
  updateNodeData: (nodeId: string, key: string, value: string, origin: MutationOrigin) => void;
  updatePortSide: (nodeId: string, portId: string, side: DiagramPortSide, origin?: MutationOrigin) => void;
  connectEdge: (from: DiagramEndpoint, to: DiagramEndpoint, origin: MutationOrigin) => void;
  removeNodes: (nodeIds: string[], origin: MutationOrigin) => void;
  removeEdges: (edgeIds: string[], origin: MutationOrigin) => void;
  replaceDocument: (document: DiagramDocument, origin: MutationOrigin | null) => void;

  setSelection: (ids: ReadonlySet<string>) => void;
  setEdgeSelection: (ids: ReadonlySet<string>) => void;
  setPendingConnection: (pending: PendingConnection | null) => void;
}

function sanitizeTopicId(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '');
  return cleaned.length > 0 ? cleaned : `Topic_${Date.now().toString(36)}`;
}

function createStarterDiagramDocument(): DiagramDocument {
  const startNode = createDiagramNode('StartNode', { x: 80, y: 150 });
  const helloNode = createDiagramNode('SimpleActivity', { x: 280, y: 150 });
  helloNode.data = { mode: 'message', message: 'Hello from this topic!' };
  const startPort = startNode.ports.find((p) => p.direction === 'output');
  const helloPort = helloNode.ports.find((p) => p.direction === 'input');
  const edges = (startPort && helloPort)
    ? [{ id: nextEdgeId(), from: { node: startNode.id, port: startPort.id }, to: { node: helloNode.id, port: helloPort.id } }]
    : [];
  const doc: DiagramDocument = {
    viewport: { panX: 0, panY: 0, zoom: 1 },
    nodes: [startNode, helloNode],
    edges,
    cards: [],
    models: [],
  };
  const { freeFloatingNodeIds } = computeGraphReachability(doc);
  doc.freeFloatingNodeIds = freeFloatingNodeIds;
  return doc;
}

const initialTopic: TopicDocument = {
  id: 'MainConversation',
  name: 'MainConversation',
  isInitial: true,
  isDirty: false,
  document: sampleDocument,
};

export function upgradeRepeatActivityPorts(doc: DiagramDocument): DiagramDocument {
  if (!doc?.nodes || !doc.nodes.some((n) => (n.type === 'RepeatActivity' || n.type === 'ForEachActivity') && !n.ports.some((p) => p.id.endsWith('loop-body')))) {
    return doc;
  }
  const nodes = doc.nodes.map((node) => {
    if ((node.type === 'RepeatActivity' || node.type === 'ForEachActivity') && !node.ports.some((p) => p.id.endsWith('loop-body'))) {
      const newPorts = buildPortsFromDefs(node.id, resolveActivityPortDefs(node.type, node.data));
      return { ...node, ports: newPorts };
    }
    return node;
  });
  const edges = doc.edges.map((edge) => {
    const srcNode = nodes.find((n) => n.id === edge.from.node);
    if ((srcNode?.type === 'RepeatActivity' || srcNode?.type === 'ForEachActivity') && edge.from.port.endsWith('-out')) {
      return {
        ...edge,
        from: {
          ...edge.from,
          port: `${srcNode.id}-loop-body`,
        },
      };
    }
    return edge;
  });
  return { ...doc, nodes, edges };
}

function applyMutation(
  set: (fn: (state: DiagramStoreState) => Partial<DiagramStoreState>) => void,
  origin: MutationOrigin,
  updateDocument: (document: DiagramDocument) => DiagramDocument,
) {
  set((state) => {
    const rawDoc = updateDocument(state.document);
    const { freeFloatingNodeIds } = computeGraphReachability(rawDoc);
    const nextDoc: DiagramDocument = {
      ...rawDoc,
      freeFloatingNodeIds,
    };
    const nextTopics = state.topics.map((t) =>
      t.id === state.activeTopicId ? { ...t, document: nextDoc, isDirty: true } : t,
    );
    return {
      document: nextDoc,
      topics: nextTopics,
      versionId: state.versionId + 1,
      codeRegenRequestCount: origin === 'CodeEditor' ? state.codeRegenRequestCount : state.codeRegenRequestCount + 1,
    };
  });
}

export const useDiagramStore = create<DiagramStoreState>()(
  persist(
    (set, get) => ({
      topics: [initialTopic],
      activeTopicId: 'MainConversation',
      document: sampleDocument,
      versionId: 0,
      projectPath: null,
      lastSavedAt: null,
      codeRegenRequestCount: 0,
      selectedNodeIds: new Set(),
      selectedEdgeIds: new Set(),
      pendingConnection: null,

      setProjectPath: (projectPath) => set({ projectPath }),

      resetToStarter: () => {
        const starterTopic: TopicDocument = {
          id: 'MainConversation',
          name: 'MainConversation',
          isInitial: true,
          isDirty: false,
          document: sampleDocument,
        };
        set({
          topics: [starterTopic],
          activeTopicId: 'MainConversation',
          document: sampleDocument,
          projectPath: null,
          lastSavedAt: null,
          selectedNodeIds: new Set(),
          selectedEdgeIds: new Set(),
          pendingConnection: null,
          versionId: get().versionId + 1,
          codeRegenRequestCount: get().codeRegenRequestCount + 1,
        });
      },

      loadWorkspace: (topics, activeTopicId, projectPath) => {
        if (!topics || topics.length === 0) return;
        const upgradedTopics = topics.map((t) => ({ ...t, document: upgradeRepeatActivityPorts(t.document) }));
        const initial = upgradedTopics.find((t) => t.isInitial) ?? upgradedTopics[0];
        const targetId = activeTopicId && upgradedTopics.some((t) => t.id === activeTopicId) ? activeTopicId : initial.id;
        const targetTopic = upgradedTopics.find((t) => t.id === targetId) ?? initial;
        set({
          topics: upgradedTopics,
          activeTopicId: targetTopic.id,
          document: targetTopic.document,
          projectPath: projectPath !== undefined ? projectPath : get().projectPath,
          selectedNodeIds: new Set(),
          selectedEdgeIds: new Set(),
          pendingConnection: null,
          versionId: get().versionId + 1,
          codeRegenRequestCount: get().codeRegenRequestCount + 1,
        });
      },

      markWorkspaceSaved: () => {
        set((state) => ({
          topics: state.topics.map((t) => ({ ...t, isDirty: false })),
          lastSavedAt: new Date().toLocaleTimeString(),
        }));
      },

      addTopic: (name) => {
    const rawName = name?.trim() || `Topic_${get().topics.length + 1}`;
    const id = sanitizeTopicId(rawName);
    let finalId = id;
    let counter = 1;
    while (get().topics.some((t) => t.id === finalId)) {
      finalId = `${id}_${counter++}`;
    }
    const newTopic: TopicDocument = {
      id: finalId,
      name: rawName,
      isInitial: false,
      isDirty: false,
      document: createStarterDiagramDocument(),
    };
    set((state) => ({
      topics: [...state.topics, newTopic],
      activeTopicId: finalId,
      document: newTopic.document,
      selectedNodeIds: new Set(),
      selectedEdgeIds: new Set(),
      pendingConnection: null,
      versionId: state.versionId + 1,
      codeRegenRequestCount: state.codeRegenRequestCount + 1,
    }));
    return finalId;
  },

  selectTopic: (topicId) => {
    const target = get().topics.find((t) => t.id === topicId);
    if (!target || target.id === get().activeTopicId) return;
    set((state) => ({
      activeTopicId: target.id,
      document: target.document,
      selectedNodeIds: new Set(),
      selectedEdgeIds: new Set(),
      pendingConnection: null,
      versionId: state.versionId + 1,
      codeRegenRequestCount: state.codeRegenRequestCount + 1,
    }));
  },

  renameTopic: (topicId, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const newId = sanitizeTopicId(trimmed);
    set((state) => {
      const topics = state.topics.map((t) => {
        if (t.id !== topicId) return t;
        return { ...t, id: newId, name: trimmed };
      });
      const activeTopicId = state.activeTopicId === topicId ? newId : state.activeTopicId;
      return {
        topics,
        activeTopicId,
        versionId: state.versionId + 1,
        codeRegenRequestCount: state.codeRegenRequestCount + 1,
      };
    });
  },

  deleteTopic: (topicId) => {
    const { topics, activeTopicId } = get();
    if (topics.length <= 1) return;
    const remaining = topics.filter((t) => t.id !== topicId);
    const hasInitial = remaining.some((t) => t.isInitial);
    if (!hasInitial && remaining.length > 0) {
      remaining[0] = { ...remaining[0], isInitial: true };
    }
    const nextActiveId = activeTopicId === topicId ? remaining[0].id : activeTopicId;
    const nextActiveTopic = remaining.find((t) => t.id === nextActiveId) ?? remaining[0];
    set((state) => ({
      topics: remaining,
      activeTopicId: nextActiveTopic.id,
      document: nextActiveTopic.document,
      selectedNodeIds: new Set(),
      selectedEdgeIds: new Set(),
      pendingConnection: null,
      versionId: state.versionId + 1,
      codeRegenRequestCount: state.codeRegenRequestCount + 1,
    }));
  },

  duplicateTopic: (topicId) => {
    const target = get().topics.find((t) => t.id === topicId);
    if (!target) return;
    const dupName = `${target.name}_Copy`;
    const dupId = sanitizeTopicId(dupName);
    let finalId = dupId;
    let counter = 1;
    while (get().topics.some((t) => t.id === finalId)) {
      finalId = `${dupId}_${counter++}`;
    }
    const clonedDoc: DiagramDocument = JSON.parse(JSON.stringify(target.document));
    const newTopic: TopicDocument = {
      id: finalId,
      name: dupName,
      isInitial: false,
      isDirty: false,
      document: clonedDoc,
    };
    set((state) => ({
      topics: [...state.topics, newTopic],
      activeTopicId: finalId,
      document: clonedDoc,
      selectedNodeIds: new Set(),
      selectedEdgeIds: new Set(),
      pendingConnection: null,
      versionId: state.versionId + 1,
      codeRegenRequestCount: state.codeRegenRequestCount + 1,
    }));
  },

  setInitialTopic: (topicId) => {
    set((state) => ({
      topics: state.topics.map((t) => ({
        ...t,
        isInitial: t.id === topicId,
      })),
      versionId: state.versionId + 1,
    }));
  },

  addNode: (type, position, origin) => {
    const newNode = createDiagramNode(type, position);
    applyMutation(set, origin, (document) => ({ ...document, nodes: [...document.nodes, newNode] }));
    return newNode.id;
  },

  moveNode: (nodeId, position, origin) => {
    applyMutation(set, origin, (document) => ({
      ...document,
      nodes: document.nodes.map((n) => (n.id === nodeId ? { ...n, x: position.x, y: position.y } : n)),
    }));
  },

  renameNode: (nodeId, name, origin = 'Canvas') => {
    const trimmed = name.trim();
    applyMutation(set, origin, (document) => ({
      ...document,
      nodes: document.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              name: trimmed,
              customName: trimmed,
              data: { ...n.data, customName: trimmed },
            }
          : n,
      ),
    }));
  },

  resizeNode: (nodeId, width, height, origin) => {
    applyMutation(set, origin ?? 'Canvas', (document) => ({
      ...document,
      nodes: document.nodes.map((n) =>
        n.id === nodeId ? { ...n, width: Math.round(width), height: Math.round(height) } : n,
      ),
    }));
  },

  updateNodeData: (nodeId, key, value, origin) => {
    applyMutation(set, origin, (document) => {
      // Phase 4.4: a branching type's ports are a function of its own
      // data (registry/activityDefinitions.ts), so an edit to its
      // case-list field must regenerate them here -- this is the only
      // place besides creation (actions/createNode.ts) a node's data
      // changes. Port ids are derived from each case's own label, so an
      // unrelated edit (or reordering cases) leaves surviving cases'
      // port ids -- and any edges wired to them -- untouched; only a
      // genuinely added/removed case changes its own port's id. This is
      // a no-op for every non-branching type: their ports don't depend
      // on data, so the regenerated list is identical to the one it
      // replaces.
      const nodes = document.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const data = { ...n.data, [key]: value };
        return { ...n, data, ports: buildPortsFromDefs(n.id, resolveActivityPortDefs(n.type, data)) };
      });

      // A case-list edit that removes a case removes that case's port
      // too -- prune any edge that pointed at a now-nonexistent port,
      // the same edge-integrity guarantee removeNodes already provides.
      const validPortIds = new Set(nodes.flatMap((n) => n.ports.map((p) => p.id)));
      const edges = document.edges.filter(
        (e) => validPortIds.has(e.from.port) && (e.to === undefined || validPortIds.has(e.to.port)),
      );

      return { ...document, nodes, edges };
    });
  },

  updatePortSide: (nodeId, portId, side, origin = 'Inspector') => {
    applyMutation(set, origin, (document) => ({
      ...document,
      nodes: document.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          ports: (node.ports || []).map((port) => (port.id === portId ? { ...port, position: side } : port)),
        };
      }),
    }));
  },

  connectEdge: (from, to, origin) => {
    applyMutation(set, origin, (document) => ({
      ...document,
      edges: [...document.edges, { id: nextEdgeId(), from, to }],
    }));
  },

  removeNodes: (nodeIds, origin) => {
    const docNodes = get().document.nodes;
    const removeIds = new Set(
      nodeIds.filter((id) => {
        const node = docNodes.find((n) => n.id === id);
        return node?.type !== 'StartNode' && node?.type !== 'StartActivity';
      })
    );
    if (removeIds.size === 0) return;
    applyMutation(set, origin, (document) => ({
      ...document,
      nodes: document.nodes.filter((n) => !removeIds.has(n.id)),
      edges: document.edges.filter((e) => !removeIds.has(e.from.node) && !removeIds.has(e.to?.node ?? '')),
    }));
    set((state) => {
      const next = new Set(state.selectedNodeIds);
      for (const id of removeIds) next.delete(id);
      return { selectedNodeIds: next };
    });
  },

  removeEdges: (edgeIds, origin) => {
    const removeIds = new Set(edgeIds);
    applyMutation(set, origin, (document) => ({
      ...document,
      edges: document.edges.filter((e) => !removeIds.has(e.id)),
    }));
    set((state) => {
      const nextEdges = new Set(state.selectedEdgeIds);
      for (const id of removeIds) nextEdges.delete(id);
      return { selectedEdgeIds: nextEdges };
    });
  },

  replaceDocument: (document, origin) => {
    const upgraded = upgradeRepeatActivityPorts(document);
    const { freeFloatingNodeIds } = computeGraphReachability(upgraded);
    const docWithReachability = { ...upgraded, freeFloatingNodeIds };
    if (origin === null) {
      set((state) => {
        const nextTopics = state.topics.map((t) =>
          t.id === state.activeTopicId ? { ...t, document: docWithReachability, isDirty: false } : t,
        );
        return { document: docWithReachability, topics: nextTopics, versionId: state.versionId + 1 };
      });
      return;
    }
    applyMutation(set, origin, () => docWithReachability);
  },

  setSelection: (ids) => set({ selectedNodeIds: ids }),
  setEdgeSelection: (ids) => set({ selectedEdgeIds: ids }),
  setPendingConnection: (pending) => set({ pendingConnection: pending }),
    }),
    {
      name: 'conversa_scripteditor_workspace',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const upgradedTopics = (state.topics || []).map((t) => ({
            ...t,
            document: upgradeRepeatActivityPorts(t.document),
          }));
          const currentDoc =
            upgradedTopics.find((t) => t.id === state.activeTopicId)?.document ??
            (state.document ? upgradeRepeatActivityPorts(state.document) : state.document);
          state.topics = upgradedTopics;
          state.document = currentDoc;
        }
      },
      partialize: (state) => ({
        topics: state.topics,
        activeTopicId: state.activeTopicId,
        document: state.document,
        projectPath: state.projectPath,
        lastSavedAt: state.lastSavedAt,
      }),
    },
  ),
);
