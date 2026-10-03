import { describe, it, expect } from 'vitest';
import { getGuaranteedUpstreamVariables } from '../analysis/scopeAnalysis';
import type { DiagramDocument } from '../schema/diagram';

describe('Scope Analysis - Flow-Dependent Variable Scoping', () => {
  it('correctly tracks variables in a linear sequence', () => {
    // Set1 (var1 = 10) -> If1 -> Set2 (var2 = 2) -> If2
    const doc: DiagramDocument = {
      viewport: { panX: 0, panY: 0, zoom: 1 },
      cards: [],
      models: [],
      nodes: [
        {
          id: 'set1',
          type: 'SetVariableActivity',
          name: 'SetVar1',
          x: 0,
          y: 0,
          ports: [
            { id: 'set1-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }
          ],
          context: { reads: [], writes: ['var1'] },
          data: { variableName: 'var1', value: '10' }
        },
        {
          id: 'if1',
          type: 'ConditionalActivity',
          name: 'If1',
          x: 100,
          y: 0,
          ports: [
            { id: 'if1-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
            { id: 'if1-yes', name: 'Yes', direction: 'output', role: 'main', type: 'flow', position: 'right' },
          ],
          context: { reads: [], writes: [] },
          data: { selectorKey: 'var1' }
        },
        {
          id: 'set2',
          type: 'SetVariableActivity',
          name: 'SetVar2',
          x: 200,
          y: 0,
          ports: [
            { id: 'set2-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
            { id: 'set2-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }
          ],
          context: { reads: [], writes: ['var2'] },
          data: { variableName: 'var2', value: '2' }
        },
        {
          id: 'if2',
          type: 'ConditionalActivity',
          name: 'If2',
          x: 300,
          y: 0,
          ports: [
            { id: 'if2-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
          ],
          context: { reads: [], writes: [] },
          data: { selectorKey: 'var1 == var2' }
        }
      ],
      edges: [
        { id: 'e1', from: { node: 'set1', port: 'set1-out' }, to: { node: 'if1', port: 'if1-in' } },
        { id: 'e2', from: { node: 'if1', port: 'if1-yes' }, to: { node: 'set2', port: 'set2-in' } },
        { id: 'e3', from: { node: 'set2', port: 'set2-out' }, to: { node: 'if2', port: 'if2-in' } }
      ]
    };

    // At set1: 0 upstream variables
    const varsAtSet1 = getGuaranteedUpstreamVariables(doc, 'set1');
    expect(varsAtSet1).toHaveLength(0);

    // At if1: only var1 is in scope (var2 is defined downstream)
    const varsAtIf1 = getGuaranteedUpstreamVariables(doc, 'if1');
    expect(varsAtIf1).toHaveLength(1);
    expect(varsAtIf1[0].name).toBe('var1');
    expect(varsAtIf1[0].type).toBe('int');

    // At set2: var1 is in scope
    const varsAtSet2 = getGuaranteedUpstreamVariables(doc, 'set2');
    expect(varsAtSet2).toHaveLength(1);
    expect(varsAtSet2[0].name).toBe('var1');

    // At if2: both var1 and var2 are in scope
    const varsAtIf2 = getGuaranteedUpstreamVariables(doc, 'if2');
    expect(varsAtIf2).toHaveLength(2);
    expect(varsAtIf2.map((v) => v.name)).toEqual(['var1', 'var2']);
  });

  it('loses upstream variables if the connecting edge is removed', () => {
    // Set1 (var1 = 10)    Set2 (var2 = 2) -> If2  (Link between If1 and Set2 severed)
    const doc: DiagramDocument = {
      viewport: { panX: 0, panY: 0, zoom: 1 },
      cards: [],
      models: [],
      nodes: [
        {
          id: 'set1',
          type: 'SetVariableActivity',
          name: 'SetVar1',
          x: 0,
          y: 0,
          ports: [{ id: 'set1-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }],
          context: { reads: [], writes: ['var1'] },
          data: { variableName: 'var1', value: '10' }
        },
        {
          id: 'if1',
          type: 'ConditionalActivity',
          name: 'If1',
          x: 100,
          y: 0,
          ports: [{ id: 'if1-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' }],
          context: { reads: [], writes: [] },
          data: {}
        },
        {
          id: 'set2',
          type: 'SetVariableActivity',
          name: 'SetVar2',
          x: 200,
          y: 0,
          ports: [
            { id: 'set2-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
            { id: 'set2-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }
          ],
          context: { reads: [], writes: ['var2'] },
          data: { variableName: 'var2', value: '2' }
        },
        {
          id: 'if2',
          type: 'ConditionalActivity',
          name: 'If2',
          x: 300,
          y: 0,
          ports: [{ id: 'if2-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' }],
          context: { reads: [], writes: [] },
          data: {}
        }
      ],
      edges: [
        { id: 'e1', from: { node: 'set1', port: 'set1-out' }, to: { node: 'if1', port: 'if1-in' } },
        // e2 removed!
        { id: 'e3', from: { node: 'set2', port: 'set2-out' }, to: { node: 'if2', port: 'if2-in' } }
      ]
    };

    // At set2: var1 is NOT available anymore
    const varsAtSet2 = getGuaranteedUpstreamVariables(doc, 'set2');
    expect(varsAtSet2).toHaveLength(0);

    // At if2: only var2 is available (var1 is not)
    const varsAtIf2 = getGuaranteedUpstreamVariables(doc, 'if2');
    expect(varsAtIf2).toHaveLength(1);
    expect(varsAtIf2[0].name).toBe('var2');
  });

  it('guarantees variables only if defined on ALL paths leading to a merge point', () => {
    //           ┌-> BranchA (sets varA, sharedVar) -┐
    // Start -> If                                  -> MergeNode
    //           └-> BranchB (sets varB, sharedVar) -┘
    const doc: DiagramDocument = {
      viewport: { panX: 0, panY: 0, zoom: 1 },
      cards: [],
      models: [],
      nodes: [
        {
          id: 'start',
          type: 'SimpleActivity',
          name: 'Start',
          x: 0,
          y: 0,
          ports: [{ id: 's-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }],
          context: { reads: [], writes: [] },
          data: {}
        },
        {
          id: 'branchA',
          type: 'SetVariableActivity',
          name: 'BranchA',
          x: 100,
          y: -50,
          ports: [
            { id: 'ba-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
            { id: 'ba-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }
          ],
          context: { reads: [], writes: ['varA', 'sharedVar'] },
          data: { variableName: 'varA', value: '1' }
        },
        {
          id: 'branchB',
          type: 'SetVariableActivity',
          name: 'BranchB',
          x: 100,
          y: 50,
          ports: [
            { id: 'bb-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
            { id: 'bb-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }
          ],
          context: { reads: [], writes: ['varB', 'sharedVar'] },
          data: { variableName: 'varB', value: '2' }
        },
        {
          id: 'merge',
          type: 'ConditionalActivity',
          name: 'MergeNode',
          x: 200,
          y: 0,
          ports: [
            { id: 'm-in1', name: 'Input1', direction: 'input', role: 'main', type: 'flow', position: 'left' },
            { id: 'm-in2', name: 'Input2', direction: 'input', role: 'main', type: 'flow', position: 'left' },
          ],
          context: { reads: [], writes: [] },
          data: {}
        }
      ],
      edges: [
        { id: 'e1', from: { node: 'start', port: 's-out' }, to: { node: 'branchA', port: 'ba-in' } },
        { id: 'e2', from: { node: 'start', port: 's-out' }, to: { node: 'branchB', port: 'bb-in' } },
        { id: 'e3', from: { node: 'branchA', port: 'ba-out' }, to: { node: 'merge', port: 'm-in1' } },
        { id: 'e4', from: { node: 'branchB', port: 'bb-out' }, to: { node: 'merge', port: 'm-in2' } },
      ]
    };

    const varsAtMerge = getGuaranteedUpstreamVariables(doc, 'merge');
    // Only sharedVar is defined on both paths!
    expect(varsAtMerge.map((v) => v.name)).toEqual(['sharedVar']);
  });

  it('recognizes outputVariable from QuickAnswerActivity in downstream scope', () => {
    const doc: DiagramDocument = {
      viewport: { panX: 0, panY: 0, zoom: 1 },
      cards: [],
      models: [],
      nodes: [
        {
          id: 'start',
          type: 'StartNode',
          name: 'Start',
          x: 0,
          y: 0,
          ports: [{ id: 's-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }],
          context: { reads: [], writes: [] },
          data: {}
        },
        {
          id: 'qc1',
          type: 'QuickAnswerActivity',
          name: 'Quick Choices',
          x: 100,
          y: 0,
          ports: [
            { id: 'qc-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
            { id: 'qc-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
          ],
          context: { reads: [], writes: [] },
          data: {
            question: 'Would you like an instant quote or to talk to an agent?',
            answers: 'Yes | No | Maybe',
            outputVariable: 'selectedChoice',
          }
        },
        {
          id: 'if1',
          type: 'ConditionalActivity',
          name: 'If Then Else',
          x: 250,
          y: 0,
          ports: [
            { id: 'if-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
            { id: 'if-yes', name: 'Yes', direction: 'output', role: 'main', type: 'flow', position: 'right' },
            { id: 'if-no', name: 'No', direction: 'output', role: 'main', type: 'flow', position: 'bottom' },
          ],
          context: { reads: [], writes: [] },
          data: { selectorKey: 'selectedChoice' }
        }
      ],
      edges: [
        { id: 'e1', from: { node: 'start', port: 's-out' }, to: { node: 'qc1', port: 'qc-in' } },
        { id: 'e2', from: { node: 'qc1', port: 'qc-out' }, to: { node: 'if1', port: 'if-in' } },
      ]
    };

    const varsAtIf = getGuaranteedUpstreamVariables(doc, 'if1');
    expect(varsAtIf).toHaveLength(1);
    expect(varsAtIf[0].name).toBe('selectedChoice');
    expect(varsAtIf[0].type).toBe('string');
    expect(varsAtIf[0].sourceNodeId).toBe('qc1');
  });

  it('guarantees iteration variable (e.g. count) in scope inside RepeatActivity loop body', () => {
    // Start -> Repeat (default iterationVariable: "count") -> SetVariable
    const doc: DiagramDocument = {
      viewport: { panX: 0, panY: 0, zoom: 1 },
      cards: [],
      models: [],
      nodes: [
        {
          id: 'start',
          type: 'StartNode',
          name: 'Start',
          x: 0,
          y: 0,
          ports: [{ id: 's-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }],
          context: { reads: [], writes: [] },
          data: {}
        },
        {
          id: 'rep1',
          type: 'RepeatActivity',
          name: 'Repeat Loop',
          x: 100,
          y: 0,
          ports: [
            { id: 'rep-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
            { id: 'rep-body', name: 'Loop Body', direction: 'output', role: 'main', type: 'flow', position: 'right' },
            { id: 'rep-done', name: 'Completed', direction: 'output', role: 'main', type: 'flow', position: 'bottom' },
          ],
          context: { reads: [], writes: [] },
          data: {
            loopType: 'Count',
            count: '3',
            iterationVariable: 'count'
          }
        },
        {
          id: 'set1',
          type: 'SetVariableActivity',
          name: 'Set Variable',
          x: 250,
          y: 0,
          ports: [
            { id: 'set-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
            { id: 'set-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
          ],
          context: { reads: [], writes: [] },
          data: {
            variableName: 'myCounter',
            value: '{count}'
          }
        }
      ],
      edges: [
        { id: 'e1', from: { node: 'start', port: 's-out' }, to: { node: 'rep1', port: 'rep-in' } },
        { id: 'e2', from: { node: 'rep1', port: 'rep-body' }, to: { node: 'set1', port: 'set-in' } },
      ]
    };

    const varsAtSet = getGuaranteedUpstreamVariables(doc, 'set1');
    const varNames = varsAtSet.map((v) => v.name);
    expect(varNames).toContain('count');
    const countVar = varsAtSet.find((v) => v.name === 'count');
    expect(countVar).toBeDefined();
    expect(countVar?.type).toBe('int');
    expect(countVar?.sourceNodeId).toBe('rep1');
  });
});

