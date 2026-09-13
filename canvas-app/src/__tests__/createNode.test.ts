import { describe, expect, it } from 'vitest';
import { createDiagramNode } from '../actions/createNode';

/**
 * Phase 4.1's acceptance criteria: DiagramPort.role is set explicitly by
 * each activity's port definition at creation time, not inferred. These
 * tests assert the real per-type shapes from
 * registry/activityDefinitions.ts (sourced from docs/activity-shapes.md)
 * come out of createDiagramNode correctly, and that an unseeded type still
 * falls back to a generic (but still explicit) main-role pair rather than
 * crashing or guessing a role from the node's type/data.
 */
describe('createDiagramNode port roles', () => {
  it('gives a seeded standard-shape type (SimpleActivity) Input/Output/Exception/Control', () => {
    const node = createDiagramNode('SimpleActivity', { x: 0, y: 0 });

    expect(node.ports.map((p) => [p.name, p.direction, p.role])).toEqual([
      ['Input', 'input', 'main'],
      ['Output', 'output', 'main'],
      ['Exception', 'output', 'exception'],
      ['Control', 'output', 'control'],
    ]);
    // Every id is namespaced under the node's own id -- no collisions across nodes.
    expect(node.ports.every((p) => p.id.startsWith(`${node.id}-`))).toBe(true);
  });

  it('gives AdaptiveCardActivity its Card/Model aux-config ports in addition to the standard shape', () => {
    const node = createDiagramNode('AdaptiveCardActivity', { x: 0, y: 0 });

    expect(node.ports.map((p) => [p.name, p.direction, p.role])).toEqual([
      ['Input', 'input', 'main'],
      ['Output', 'output', 'main'],
      ['Exception', 'output', 'exception'],
      ['Card', 'input', 'aux-config'],
      ['Model', 'input', 'aux-config'],
      ['Control', 'output', 'control'],
    ]);
  });

  it('falls back to an explicit generic main-role Input/Output pair for an unseeded type', () => {
    // As of Phase 5.4, all 36 catalog shapes are seeded (registry/
    // activityCatalog.ts's own list is fully covered by
    // activityDefinitions.ts) -- InvokeToolActivity is the one type
    // named in the roadmap (#37) that exists in neither yet, so it's the
    // genuinely-unseeded example for this fallback path today.
    const node = createDiagramNode('InvokeToolActivity', { x: 0, y: 0 });

    expect(node.ports.map((p) => [p.name, p.direction, p.role])).toEqual([
      ['Input', 'input', 'main'],
      ['Output', 'output', 'main'],
    ]);
  });

  it('never produces a port whose role would need to be guessed from its name (no "Exception"/"Control" without the matching role)', () => {
    for (const type of ['SimpleActivity', 'AdaptiveCardActivity', 'QuickAnswerActivity', 'DelayActivity', 'PromptActivity', 'TriggerTopicActivity']) {
      const node = createDiagramNode(type, { x: 0, y: 0 });
      for (const port of node.ports) {
        if (port.name === 'Exception') expect(port.role).toBe('exception');
        if (port.name === 'Control') expect(port.role).toBe('control');
        if (port.name === 'Card' || port.name === 'Model') expect(port.role).toBe('aux-config');
        if (port.name === 'Input' || port.name === 'Output') expect(port.role).toBe('main');
      }
    }
  });
});
