import { describe, expect, it } from 'vitest';
import { toReactFlowEdges } from '../mapping/toReactFlow';
import type { DiagramDocument, DiagramNode } from '../schema/diagram';

/**
 * Phase 4.6: toReactFlowEdges is the one place with both node positions
 * (for the geometric backward check) and the full edge list (to index
 * concurrent loop lanes), so it's what actually resolves DiagramEdge into
 * the isLoop/loopLaneIndex data RoleEdge.tsx consumes.
 */
function makeNode(id: string, x: number): DiagramNode {
  return {
    id,
    type: 'SimpleActivity',
    x,
    y: 0,
    data: {},
    ports: [
      { id: `${id}-in`, name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
      { id: `${id}-out`, name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
    ],
    context: { reads: [], writes: [] },
  };
}

function baseDocument(nodes: DiagramNode[]): DiagramDocument {
  return { viewport: { panX: 0, panY: 0, zoom: 1 }, nodes, edges: [], cards: [], models: [] };
}

describe('toReactFlowEdges: loop detection', () => {
  it('marks a geometrically forward edge as not a loop', () => {
    const document = baseDocument([makeNode('a', 0), makeNode('b', 300)]);
    document.edges = [{ id: 'e1', from: { node: 'a', port: 'a-out' }, to: { node: 'b', port: 'b-in' } }];

    const [edge] = toReactFlowEdges(document);
    expect(edge.data?.isLoop).toBe(false);
    expect(edge.data?.loopLaneIndex).toBeUndefined();
  });

  it('marks a geometrically backward edge (target column left of source) as a loop', () => {
    const document = baseDocument([makeNode('a', 300), makeNode('b', 0)]);
    document.edges = [{ id: 'e1', from: { node: 'a', port: 'a-out' }, to: { node: 'b', port: 'b-in' } }];

    const [edge] = toReactFlowEdges(document);
    expect(edge.data?.isLoop).toBe(true);
    expect(edge.data?.loopLaneIndex).toBe(0);
  });

  it('honors an explicit isLoop:true flag even on a geometrically forward edge', () => {
    const document = baseDocument([makeNode('a', 0), makeNode('b', 300)]);
    document.edges = [{ id: 'e1', from: { node: 'a', port: 'a-out' }, to: { node: 'b', port: 'b-in' }, isLoop: true }];

    const [edge] = toReactFlowEdges(document);
    expect(edge.data?.isLoop).toBe(true);
  });

  it('assigns each concurrent loop edge its own 0-based lane index, leaving forward edges unindexed', () => {
    const document = baseDocument([makeNode('a', 300), makeNode('b', 0), makeNode('c', 150)]);
    document.edges = [
      { id: 'forward', from: { node: 'b', port: 'b-out' }, to: { node: 'c', port: 'c-in' } },
      { id: 'loop1', from: { node: 'a', port: 'a-out' }, to: { node: 'b', port: 'b-in' } },
      { id: 'loop2', from: { node: 'a', port: 'a-out' }, to: { node: 'b', port: 'b-in' } },
    ];

    const edges = toReactFlowEdges(document);
    const byId = Object.fromEntries(edges.map((e) => [e.id, e.data]));
    expect(byId.forward?.loopLaneIndex).toBeUndefined();
    expect(byId.loop1?.loopLaneIndex).toBe(0);
    expect(byId.loop2?.loopLaneIndex).toBe(1);
  });

  it('resolves sourceRole correctly for main output edges and exception edges', () => {
    const nodeA = makeNode('a', 0);
    nodeA.ports.push({
      id: 'a-exc',
      name: 'Exception',
      direction: 'output',
      role: 'exception',
      type: 'flow',
      position: 'bottom',
    });
    const nodeB = makeNode('b', 300);

    const document = baseDocument([nodeA, nodeB]);
    document.edges = [
      { id: 'e-main', from: { node: 'a', port: 'a-out' }, to: { node: 'b', port: 'b-in' } },
      { id: 'e-exc', from: { node: 'a', port: 'a-exc' }, to: { node: 'b', port: 'b-in' } },
    ];

    const edges = toReactFlowEdges(document);
    const byId = Object.fromEntries(edges.map((e) => [e.id, e.data]));
    expect(byId['e-main']?.sourceRole).toBe('main');
    expect(byId['e-exc']?.sourceRole).toBe('exception');
  });

  it('sets selected: true and interactionWidth on selected edges', () => {
    const document = baseDocument([makeNode('a', 0), makeNode('b', 300)]);
    document.edges = [
      { id: 'e1', from: { node: 'a', port: 'a-out' }, to: { node: 'b', port: 'b-in' } },
      { id: 'e2', from: { node: 'a', port: 'a-out' }, to: { node: 'b', port: 'b-in' } },
    ];

    const onDeleteEdge = () => {};
    const edges = toReactFlowEdges(document, {
      selectedEdgeIds: new Set(['e1']),
      onDeleteEdge,
    });

    const edge1 = edges.find((e) => e.id === 'e1');
    const edge2 = edges.find((e) => e.id === 'e2');

    expect(edge1?.selected).toBe(true);
    expect(edge1?.interactionWidth).toBe(24);
    expect(edge1?.data?.onDelete).toBe(onDeleteEdge);

    expect(edge2?.selected).toBe(false);
    expect(edge2?.interactionWidth).toBe(24);
  });

  it('synthesizes a virtual loop-back edge for a RepeatActivity with a loop body', () => {
    const repeatNode: DiagramNode = {
      id: 'repeat-1',
      type: 'RepeatActivity',
      x: 100,
      y: 100,
      data: {},
      ports: [
        { id: 'repeat-1-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
        { id: 'repeat-1-loop-body', name: 'Loop Body', direction: 'output', role: 'main', type: 'flow', position: 'right' },
        { id: 'repeat-1-loop-done', name: 'Done', direction: 'output', role: 'main', type: 'flow', position: 'right' },
      ],
      context: { reads: [], writes: [] },
    };

    const step1 = makeNode('step1', 350);
    const step2 = makeNode('step2', 600);

    const document = baseDocument([repeatNode, step1, step2]);
    document.edges = [
      { id: 'e-body', from: { node: 'repeat-1', port: 'repeat-1-loop-body' }, to: { node: 'step1', port: 'step1-in' } },
      { id: 'e-chain', from: { node: 'step1', port: 'step1-out' }, to: { node: 'step2', port: 'step2-in' } },
    ];

    const edges = toReactFlowEdges(document);
    const virtualEdge = edges.find((e) => e.id === 'virtual-loop-repeat-1');

    expect(virtualEdge).toBeDefined();
    expect(virtualEdge?.source).toBe('step2');
    expect(virtualEdge?.sourceHandle).toBe('step2-out');
    expect(virtualEdge?.target).toBe('repeat-1');
    expect(virtualEdge?.targetHandle).toBe('repeat-1-in');
    expect(virtualEdge?.data?.isVirtual).toBe(true);
    expect(virtualEdge?.data?.isLoop).toBe(true);
    expect(virtualEdge?.data?.strokeColor).toBe('#0284c7');
    expect(virtualEdge?.data?.strokeDasharray).toBe('6 4');
  });

  it('does not synthesize a duplicate virtual edge if an explicit edge already connects back to repeat', () => {
    const repeatNode: DiagramNode = {
      id: 'repeat-1',
      type: 'RepeatActivity',
      x: 100,
      y: 100,
      data: {},
      ports: [
        { id: 'repeat-1-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
        { id: 'repeat-1-loop-body', name: 'Loop Body', direction: 'output', role: 'main', type: 'flow', position: 'right' },
        { id: 'repeat-1-loop-done', name: 'Done', direction: 'output', role: 'main', type: 'flow', position: 'right' },
      ],
      context: { reads: [], writes: [] },
    };

    const step1 = makeNode('step1', 350);
    const document = baseDocument([repeatNode, step1]);
    document.edges = [
      { id: 'e-body', from: { node: 'repeat-1', port: 'repeat-1-loop-body' }, to: { node: 'step1', port: 'step1-in' } },
      { id: 'e-explicit-back', from: { node: 'step1', port: 'step1-out' }, to: { node: 'repeat-1', port: 'repeat-1-in' } },
    ];

    const edges = toReactFlowEdges(document);
    const virtualEdge = edges.find((e) => e.id === 'virtual-loop-repeat-1');
    expect(virtualEdge).toBeUndefined();
  });
});


