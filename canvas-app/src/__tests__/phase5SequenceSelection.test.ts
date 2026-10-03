import { describe, expect, it } from 'vitest';
import { createDiagramNode } from '../actions/createNode';
import { getActivityDefinition } from '../registry/activityDefinitions';

/**
 * Phase 5.1's acceptance criteria (#33): SimpleActivity, CompositeActivity,
 * DelayActivity, EndActivity, ConditionalActivity,
 * DecisionActivity, SwitchActivity
 * all present with parameters/ports matching docs/activity-shapes.md
 * exactly. The branching types (Conditional*, DecisionActivity,
 * SwitchActivity) were already seeded in Phase 4.1/4.4 and
 * already matched; this covers what changed/was added here specifically:
 * SimpleActivity's `mode` field, DelayActivity's durationMs rename, and
 * the two new CompositeActivity/EndActivity definitions.
 */
describe('Phase 5.1: Sequence category parameter/port parity', () => {
  it('SimpleActivity has both doc parameters (mode, message)', () => {
    const def = getActivityDefinition('SimpleActivity')!;
    expect(Object.keys(def.defaultData).sort()).toEqual(['message', 'mode']);
    expect(def.defaultData.mode).toBe('message');
  });

  it('DelayActivity uses durationMs (not durationSec), matching the doc default of 1000', () => {
    const def = getActivityDefinition('DelayActivity')!;
    expect(def.defaultData.durationMs).toBe('1000');
    expect(def.defaultData.durationSec).toBeUndefined();
  });

  it('CompositeActivity is seeded with all 3 doc parameters and the standard 4-port shape', () => {
    const def = getActivityDefinition('CompositeActivity')!;
    expect(def.defaultData.isolateContext).toBe('false');
    expect(def.defaultData.completeMessage).toBe('Composite completed');
    expect(def.defaultData.steps).toBeDefined();

    const node = createDiagramNode('CompositeActivity', { x: 0, y: 0 });
    expect(node.ports.map((p) => [p.name, p.role])).toEqual([
      ['Input', 'main'],
      ['Output', 'main'],
      ['Exception', 'exception'],
      ['Control', 'control'],
    ]);
  });

  it('EndActivity is seeded with endMessage and NO outgoing ports (terminates the flow)', () => {
    const def = getActivityDefinition('EndActivity')!;
    expect(def.defaultData).toEqual({ endMessage: 'Done' });

    const node = createDiagramNode('EndActivity', { x: 0, y: 0 });
    expect(node.ports.map((p) => [p.name, p.role])).toEqual([
      ['Input', 'main'],
    ]);
    expect(node.ports.some((p) => p.direction === 'output')).toBe(false);
  });

  it('all 7 Sequence+Selection types are now seeded (not falling back to the generic pair)', () => {
    const types = [
      'SimpleActivity',
      'CompositeActivity',
      'DelayActivity',
      'EndActivity',
      'ConditionalActivity',
      'DecisionActivity',
      'SwitchActivity',
    ];
    for (const type of types) {
      expect(getActivityDefinition(type), `${type} should be seeded`).toBeDefined();
    }
  });
});
