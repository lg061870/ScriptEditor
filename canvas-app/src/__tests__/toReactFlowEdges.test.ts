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
});
