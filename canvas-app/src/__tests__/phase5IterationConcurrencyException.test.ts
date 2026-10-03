import { describe, expect, it } from 'vitest';
import { createDiagramNode } from '../actions/createNode';
import { getActivityDefinition } from '../registry/activityDefinitions';

/**
 * Phase 5.2's acceptance criteria (#34): RepeatActivity, ForEachActivity,
 * ParallelActivity, OnErrorActivity, FallbackActivity, EscalateActivity
 * all present with parameters/ports matching docs/activity-shapes.md
 * exactly.
 */
describe('Phase 5.2: Iteration + Concurrency + Exception Handling parity', () => {
  it('all 5 types are seeded (OnErrorActivity removed in favor of per-activity exit ramps)', () => {
    for (const type of ['RepeatActivity', 'ForEachActivity', 'ParallelActivity', 'FallbackActivity', 'EscalateActivity']) {
      expect(getActivityDefinition(type), `${type} should be seeded`).toBeDefined();
    }
    expect(getActivityDefinition('OnErrorActivity')).toBeUndefined();
  });

  it('RepeatActivity matches the doc defaults', () => {
    expect(getActivityDefinition('RepeatActivity')!.defaultData).toEqual({
      loopMode: 'while predicate',
      collectionKey: 'BasicsLearningLoop_Collection',
      continuePrompt: 'custom predicate controls continuation',
      iterationVariable: 'count',
    });
  });

  it('ForEachActivity matches the doc defaults and standard 4-port shape', () => {
    expect(getActivityDefinition('ForEachActivity')!.defaultData).toEqual({
      collectionKey: 'Items',
      itemKey: 'item',
      indexKey: 'index',
      startMessage: '',
      completeMessage: '',
    });
    const node = createDiagramNode('ForEachActivity', { x: 0, y: 0 });
    expect(node.ports.map((p) => p.name)).toEqual(['Input', 'Output', 'Exception', 'Control']);
  });

  it('ParallelActivity matches the defaults and has branch ports', () => {
    expect(getActivityDefinition('ParallelActivity')!.defaultData).toEqual({
      branchCount: '2',
      branches: 'Branch 1 | Branch 2',
      continueOnError: 'false',
      completeMessage: '',
      includeJoinPort: 'false',
    });
    const node = createDiagramNode('ParallelActivity', { x: 0, y: 0 });
    expect(node.ports.map((p) => p.name)).toEqual(['Input', 'Branch 1', 'Branch 2', 'Exception']);
  });

  it('FallbackActivity matches the doc default (fallbackFlagKey excluded -- not configurable in the real class)', () => {
    const def = getActivityDefinition('FallbackActivity')!;
    expect(def.defaultData).toEqual({ message: 'Sorry, I did not understand that.' });
    expect(def.defaultData.fallbackFlagKey).toBeUndefined();
  });

  it('EscalateActivity matches the doc default (escalationFlagKey excluded -- not configurable in the real class)', () => {
    const def = getActivityDefinition('EscalateActivity')!;
    expect(def.defaultData).toEqual({ escalationMessage: 'Transferring to a human agent' });
    expect(def.defaultData.escalationFlagKey).toBeUndefined();
  });
});
