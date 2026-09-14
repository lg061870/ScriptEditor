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
  it('all 6 types are seeded', () => {
    for (const type of ['RepeatActivity', 'ForEachActivity', 'ParallelActivity', 'OnErrorActivity', 'FallbackActivity', 'EscalateActivity']) {
      expect(getActivityDefinition(type), `${type} should be seeded`).toBeDefined();
    }
  });

  it('RepeatActivity matches the doc defaults', () => {
    expect(getActivityDefinition('RepeatActivity')!.defaultData).toEqual({
      loopMode: 'while predicate',
      collectionKey: 'BasicsLearningLoop_Collection',
      continuePrompt: 'custom predicate controls continuation',
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

  it('ParallelActivity matches the doc defaults', () => {
    expect(getActivityDefinition('ParallelActivity')!.defaultData).toEqual({
      branchCount: '2',
      continueOnError: 'false',
      completeMessage: '',
    });
  });

  it('OnErrorActivity matches the doc default and has NO Exception port', () => {
    expect(getActivityDefinition('OnErrorActivity')!.defaultData).toEqual({ errorMessage: 'An unexpected error occurred.' });
    const node = createDiagramNode('OnErrorActivity', { x: 0, y: 0 });
    expect(node.ports.map((p) => p.name)).toEqual(['Input', 'Output', 'Control']);
    expect(node.ports.some((p) => p.role === 'exception')).toBe(false);
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
