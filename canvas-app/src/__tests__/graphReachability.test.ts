import { describe, it, expect } from 'vitest';
import { computeGraphReachability } from '../analysis/graphReachability';
import type { DiagramDocument } from '../schema/diagram';

describe('computeGraphReachability', () => {
  it('identifies connected nodes as reachable and orphans as freeFloating', () => {
    const doc: DiagramDocument = {
      viewport: { panX: 0, panY: 0, zoom: 1 },
      nodes: [
        {
          id: 'start',
          type: 'StartNode',
          x: 0,
          y: 0,
          ports: [{ id: 'start-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }],
          context: { reads: [], writes: [] },
          data: {},
        },
        {
          id: 'active-1',
          type: 'SimpleActivity',
          x: 200,
          y: 0,
          ports: [
            { id: 'a1-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
            { id: 'a1-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
          ],
          context: { reads: [], writes: [] },
          data: { message: 'Hello' },
        },
        {
          id: 'free-1',
          type: 'SimpleActivity',
          x: 400,
          y: 200,
          ports: [
            { id: 'f1-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
            { id: 'f1-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
          ],
          context: { reads: [], writes: [] },
          data: { message: 'I am orphaned' },
        },
        {
          id: 'free-child',
          type: 'EndActivity',
          x: 600,
          y: 200,
          ports: [
            { id: 'fc-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
          ],
          context: { reads: [], writes: [] },
          data: { endMessage: 'Done' },
        },
      ],
      edges: [
        // start -> active-1
        { id: 'e1', from: { node: 'start', port: 'start-out' }, to: { node: 'active-1', port: 'a1-in' } },
        // free-1 -> free-child (island unreachable from start!)
        { id: 'e2', from: { node: 'free-1', port: 'f1-out' }, to: { node: 'free-child', port: 'fc-in' } },
      ],
      cards: [],
      models: [],
    };

    const result = computeGraphReachability(doc);

    expect(result.reachableNodeIds.has('start')).toBe(true);
    expect(result.reachableNodeIds.has('active-1')).toBe(true);

    // free-1 and free-child are NOT connected to start, so both must be free-floating!
    expect(result.reachableNodeIds.has('free-1')).toBe(false);
    expect(result.reachableNodeIds.has('free-child')).toBe(false);
    expect(result.freeFloatingNodeIds).toEqual(['free-1', 'free-child']);
  });

  it('marks node as reachable when connected to start', () => {
    const doc: DiagramDocument = {
      viewport: { panX: 0, panY: 0, zoom: 1 },
      nodes: [
        {
          id: 'start',
          type: 'StartNode',
          x: 0,
          y: 0,
          ports: [{ id: 'start-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }],
          context: { reads: [], writes: [] },
          data: {},
        },
        {
          id: 'msg',
          type: 'SimpleActivity',
          x: 200,
          y: 0,
          ports: [{ id: 'm-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' }],
          context: { reads: [], writes: [] },
          data: {},
        },
      ],
      edges: [
        { id: 'e1', from: { node: 'start', port: 'start-out' }, to: { node: 'msg', port: 'm-in' } },
      ],
      cards: [],
      models: [],
    };

    const result = computeGraphReachability(doc);
    expect(result.freeFloatingNodeIds).toHaveLength(0);
    expect(result.reachableNodeIds.has('start')).toBe(true);
    expect(result.reachableNodeIds.has('msg')).toBe(true);
  });
});
