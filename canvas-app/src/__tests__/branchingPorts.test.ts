import { describe, expect, it, beforeEach } from 'vitest';
import { createDiagramNode } from '../actions/createNode';
import { resolveActivityPortDefs } from '../registry/activityDefinitions';
import { useDiagramStore } from '../store/diagramStore';

/**
 * Phase 4.4's acceptance criteria: SwitchActivity, ConditionalActivity,
 * DecisionActivity each generate one real output port per case/branch from
 * their case-list field. DecisionActivity is deliberately excluded (see
 * registry/activityDefinitions.ts's file-level comment) -- its real
 * ConversaCore class has no case/branch concept at all, so it stays on
 * the standard 4-port shape; that exclusion itself is asserted below.
 */
describe('createDiagramNode: dynamic per-case ports', () => {
  it('ConditionalActivity gets one output port per pipe-separated case, no default port when defaultBranch is empty', () => {
    const node = createDiagramNode('ConditionalActivity', { x: 0, y: 0 });

    // defaultData is "Yes | No" with an empty defaultBranch.
    expect(node.ports.map((p) => [p.name, p.direction, p.role])).toEqual([
      ['Input', 'input', 'main'],
      ['Yes', 'output', 'main'],
      ['No', 'output', 'main'],
      ['Exception', 'output', 'exception'],
      ['Control', 'output', 'control'],
    ]);
  });

  it('SwitchActivity: a non-empty defaultCase adds a Default port', () => {
    const defs = resolveActivityPortDefs('SwitchActivity', {
      valueContextKey: 'K',
      caseKeys: 'a | b | c',
      loopAfterCase: 'false',
      defaultCase: 'fallback',
    });

    expect(defs.map((d) => d.name)).toEqual(['Input', 'a', 'b', 'c', 'Default', 'Exception', 'Control']);
  });



  it('DecisionActivity is deliberately NOT dynamic -- it keeps the standard 4-port shape regardless of its data', () => {
    const node = createDiagramNode('DecisionActivity', { x: 0, y: 0 });
    expect(node.ports.map((p) => p.name)).toEqual(['Input', 'Output', 'Exception', 'Control']);
  });

  it('a duplicate or empty case label still produces a valid, unique port id', () => {
    const defs = resolveActivityPortDefs('ConditionalActivity', { selectorKey: 'K', cases: 'a | a | ', defaultBranch: '' });
    const ids = defs.map((d) => d.idSuffix);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('diagramStore.updateNodeData: port regeneration for branching types', () => {
  beforeEach(() => {
    useDiagramStore.setState({
      document: { viewport: { panX: 0, panY: 0, zoom: 1 }, nodes: [], edges: [], cards: [], models: [] },
      versionId: 0,
      codeRegenRequestCount: 0,
      selectedNodeIds: new Set(),
      pendingConnection: null,
    });
  });

  it('editing the case-list field regenerates the node\'s output ports', () => {
    const store = useDiagramStore.getState();
    const nodeId = store.addNode('ConditionalActivity', { x: 0, y: 0 }, 'Canvas');

    store.updateNodeData(nodeId, 'cases', 'alpha | beta | gamma', 'Inspector');

    const node = useDiagramStore.getState().document.nodes.find((n) => n.id === nodeId)!;
    expect(node.ports.map((p) => p.name)).toEqual(['Input', 'alpha', 'beta', 'gamma', 'Exception', 'Control']);
  });

  it('an edge wired to a case that survives an edit keeps the same port id (and the edge is not dropped)', () => {
    const store = useDiagramStore.getState();
    const nodeId = store.addNode('ConditionalActivity', { x: 0, y: 0 }, 'Canvas'); // cases: "Yes | No"
    const targetId = store.addNode('SimpleActivity', { x: 300, y: 0 }, 'Canvas');

    const before = useDiagramStore.getState().document.nodes.find((n) => n.id === nodeId)!;
    const caseAPort = before.ports.find((p) => p.name === 'Yes')!;
    const target = useDiagramStore.getState().document.nodes.find((n) => n.id === targetId)!;
    const targetInPort = target.ports.find((p) => p.direction === 'input')!;

    store.connectEdge({ node: nodeId, port: caseAPort.id }, { node: targetId, port: targetInPort.id }, 'Canvas');
    expect(useDiagramStore.getState().document.edges).toHaveLength(1);

    // Reorder + add a case, but keep "Yes".
    store.updateNodeData(nodeId, 'cases', 'No | Yes | Maybe', 'Inspector');

    const after = useDiagramStore.getState().document.nodes.find((n) => n.id === nodeId)!;
    const caseAPortAfter = after.ports.find((p) => p.name === 'Yes')!;
    expect(caseAPortAfter.id).toBe(caseAPort.id);
    expect(useDiagramStore.getState().document.edges).toHaveLength(1);
    expect(useDiagramStore.getState().document.edges[0].from.port).toBe(caseAPort.id);
  });

  it('removing a case that has a wired edge drops that edge (edge-integrity, same guarantee removeNodes provides)', () => {
    const store = useDiagramStore.getState();
    const nodeId = store.addNode('ConditionalActivity', { x: 0, y: 0 }, 'Canvas'); // cases: "Yes | No"
    const targetId = store.addNode('SimpleActivity', { x: 300, y: 0 }, 'Canvas');

    const before = useDiagramStore.getState().document.nodes.find((n) => n.id === nodeId)!;
    const caseBPort = before.ports.find((p) => p.name === 'No')!;
    const target = useDiagramStore.getState().document.nodes.find((n) => n.id === targetId)!;
    const targetInPort = target.ports.find((p) => p.direction === 'input')!;

    store.connectEdge({ node: nodeId, port: caseBPort.id }, { node: targetId, port: targetInPort.id }, 'Canvas');
    expect(useDiagramStore.getState().document.edges).toHaveLength(1);

    // Drop "No" entirely.
    store.updateNodeData(nodeId, 'cases', 'Yes', 'Inspector');

    expect(useDiagramStore.getState().document.edges).toHaveLength(0);
  });

  it('editing a non-case field on a non-branching type is a no-op for its ports', () => {
    const store = useDiagramStore.getState();
    const nodeId = store.addNode('SimpleActivity', { x: 0, y: 0 }, 'Canvas');
    const before = useDiagramStore.getState().document.nodes.find((n) => n.id === nodeId)!.ports;

    store.updateNodeData(nodeId, 'message', 'a new message', 'Inspector');

    const after = useDiagramStore.getState().document.nodes.find((n) => n.id === nodeId)!.ports;
    expect(after).toEqual(before);
  });
});
