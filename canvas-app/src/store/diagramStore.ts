import { create } from 'zustand';
import type { DiagramDocument, DiagramEndpoint } from '../schema/diagram';
import { sampleDocument } from '../fixtures/sampleDocument';
import { createDiagramNode, nextEdgeId } from '../actions/createNode';

/**
 * Central JSON store (Phase 2.1). Every canvas mutation -- add, move,
 * wire, delete, edit -- dispatches through one of the action methods here;
 * React Flow's own node/edge arrays are always DERIVED from `document`
 * (via src/mapping/toReactFlow.ts), never the other way around. This
 * replaces the ad-hoc useState<DiagramDocument> + inline mutation
 * functions that lived in App.tsx through Phase 1.
 *
 * Library choice: Zustand. Decided in this issue, per its acceptance
 * criteria. Picked over Redux for this app's scope: no middleware/
 * boilerplate needed for a single flat document + a handful of actions,
 * a plain hook (no <Provider>), and it's a natural fit for the
 * "components read via a selector, actions call store methods directly"
 * pattern already established informally in Phase 1's App.tsx.
 *
 * Origin-token plumbing (Phase 2.3, ADR 0002) is layered on top of this
 * same structure -- every action below already takes an `origin` param
 * for that reason, even though the loop-prevention behavior it enables
 * (skipping a code-regen trigger for CodeEditor-origin mutations) lands
 * in that later commit.
 */

export type MutationOrigin = 'Canvas' | 'CodeEditor' | 'Inspector';

export interface PendingConnection {
  sourceNodeId: string;
  sourcePortId: string;
}

interface DiagramStoreState {
  document: DiagramDocument;
  versionId: number;

  /** Bumped by every mutation whose origin is NOT 'CodeEditor' (Phase 2.3
   * / ADR 0002's loop-prevention rule: a CodeEditor-origin mutation is a
   * reflection of the code editor's own text and must not re-trigger a
   * new json-to-csharp transcription request). Phase 2.4's preview panel
   * derives its text straight from `document` (cheap, synchronous,
   * harmless to recompute unconditionally); this counter is the signal
   * Phase 3.3 will actually gate the real debounced API call on. */
  codeRegenRequestCount: number;

  // Selection and in-progress "+" connections are UI state, not part of
  // the JSON SSOT -- ADR 0002 is explicit that Canvas/Inspector both
  // re-render unconditionally regardless of origin, and neither concept
  // has an origin token of its own for that reason.
  selectedNodeIds: ReadonlySet<string>;
  pendingConnection: PendingConnection | null;

  addNode: (type: string, position: { x: number; y: number }, origin: MutationOrigin) => string;
  moveNode: (nodeId: string, position: { x: number; y: number }, origin: MutationOrigin) => void;
  updateNodeData: (nodeId: string, key: string, value: string, origin: MutationOrigin) => void;
  connectEdge: (from: DiagramEndpoint, to: DiagramEndpoint, origin: MutationOrigin) => void;
  removeNodes: (nodeIds: string[], origin: MutationOrigin) => void;
  removeEdges: (edgeIds: string[], origin: MutationOrigin) => void;
  replaceDocument: (document: DiagramDocument, origin: MutationOrigin | null) => void;

  setSelection: (ids: ReadonlySet<string>) => void;
  setPendingConnection: (pending: PendingConnection | null) => void;
}

/** Every mutating action funnels through this so versionId and the
 * regen-request counter are bumped in exactly one place. */
function applyMutation(
  set: (fn: (state: DiagramStoreState) => Partial<DiagramStoreState>) => void,
  origin: MutationOrigin,
  updateDocument: (document: DiagramDocument) => DiagramDocument,
) {
  set((state) => ({
    document: updateDocument(state.document),
    versionId: state.versionId + 1,
    codeRegenRequestCount: origin === 'CodeEditor' ? state.codeRegenRequestCount : state.codeRegenRequestCount + 1,
  }));
}

export const useDiagramStore = create<DiagramStoreState>((set) => ({
  document: sampleDocument,
  versionId: 0,
  codeRegenRequestCount: 0,
  selectedNodeIds: new Set(),
  pendingConnection: null,

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

  updateNodeData: (nodeId, key, value, origin) => {
    applyMutation(set, origin, (document) => ({
      ...document,
      nodes: document.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, [key]: value } } : n)),
    }));
  },

  connectEdge: (from, to, origin) => {
    applyMutation(set, origin, (document) => ({
      ...document,
      edges: [...document.edges, { id: nextEdgeId(), from, to }],
    }));
  },

  removeNodes: (nodeIds, origin) => {
    const removeIds = new Set(nodeIds);
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
  },

  replaceDocument: (document, origin) => {
    if (origin === null) {
      // Initial load / workspace open -- not a mutation of an existing
      // document, so no view has an echo to suppress and no regen
      // request is meaningful yet (ADR 0002: "not a mutation... carries
      // no origin token at all").
      set((state) => ({ document, versionId: state.versionId + 1 }));
      return;
    }
    applyMutation(set, origin, () => document);
  },

  setSelection: (ids) => set({ selectedNodeIds: ids }),
  setPendingConnection: (pending) => set({ pendingConnection: pending }),
}));
