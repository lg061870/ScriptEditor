import { describe, expect, it } from 'vitest';
import { createDiagramNode } from '../actions/createNode';
import { advance, findEntryNode } from '../execution/simulateFlow';
import type { DiagramDocument, DiagramEdge, DiagramNode } from '../schema/diagram';

function doc(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramDocument {
  return { viewport: { panX: 0, panY: 0, zoom: 1 }, nodes, edges, cards: [], models: [] };
}

function edge(fromNode: DiagramNode, fromPortName: string, toNode: DiagramNode, toPortName = 'Input'): DiagramEdge {
  const from = fromNode.ports.find((p) => p.name === fromPortName)!;
  const to = toNode.ports.find((p) => p.name === toPortName)!;
  return { id: `${from.id}->${to.id}`, from: { node: fromNode.id, port: from.id }, to: { node: toNode.id, port: to.id } };
}

describe('findEntryNode', () => {
  it('picks the node nothing points at', () => {
    const a = createDiagramNode('SimpleActivity', { x: 0, y: 0 });
    const b = createDiagramNode('EndActivity', { x: 0, y: 0 });
    const d = doc([b, a], [edge(a, 'Output', b)]);
    expect(findEntryNode(d)?.id).toBe(a.id);
  });

  it('returns null for an empty document', () => {
    expect(findEntryNode(doc([], []))).toBeNull();
  });
});

describe('advance: linear flow', () => {
  it('walks SimpleActivity -> DelayActivity -> EndActivity to completion in one turn', () => {
    const greet = createDiagramNode('SimpleActivity', { x: 0, y: 0 });
    greet.data = { message: 'Hi there!' };
    const pause = createDiagramNode('DelayActivity', { x: 0, y: 0 });
    pause.data = { durationMs: '500' };
    const end = createDiagramNode('EndActivity', { x: 0, y: 0 });
    end.data = { endMessage: 'Bye!' };

    const d = doc([greet, pause, end], [edge(greet, 'Output', pause), edge(pause, 'Output', end)]);
    const result = advance(d, null);

    expect(result.ended).toBe(true);
    expect(result.deadEnd).toBe(false);
    expect(result.steps).toEqual([
      { kind: 'bot', text: 'Hi there!' },
      { kind: 'delay', ms: 500 },
      { kind: 'bot', text: 'Bye!' },
    ]);
  });

  it('reports a dead end when the last node has no wired outgoing edge', () => {
    const greet = createDiagramNode('SimpleActivity', { x: 0, y: 0 });
    greet.data = { message: 'Hi' };
    const d = doc([greet], []);
    const result = advance(d, null);
    expect(result.ended).toBe(false);
    expect(result.deadEnd).toBe(true);
    expect(result.currentNodeId).toBeNull();
  });

  it('reports nothing to simulate for an empty canvas', () => {
    const result = advance(doc([], []), null);
    expect(result.deadEnd).toBe(true);
    expect(result.steps[0].kind).toBe('system');
  });
});

describe('advance: QuickAnswerActivity (chip choice, single continuation edge)', () => {
  it('pauses for a choice, then continues via the one main output edge regardless of which chip was picked', () => {
    const quick = createDiagramNode('QuickAnswerActivity', { x: 0, y: 0 });
    quick.data = { answers: 'Yes | No' };
    const end = createDiagramNode('EndActivity', { x: 0, y: 0 });
    const d = doc([quick, end], [edge(quick, 'Output', end)]);

    const first = advance(d, null);
    expect(first.waiting).toBe('choice');
    expect(first.waitOptions).toEqual(['Yes', 'No']);
    expect(first.currentNodeId).toBe(quick.id);

    const second = advance(d, first.currentNodeId, 'Yes');
    expect(second.steps[0]).toEqual({ kind: 'user', text: 'Yes' });
    expect(second.ended).toBe(true);
  });
});

describe('advance: branching node (per-case output ports)', () => {
  it('pauses for a case choice and follows the chosen case\'s own wired edge', () => {
    const branch = createDiagramNode('ConditionalActivity', { x: 0, y: 0 });
    branch.data = { selectorKey: 'k', cases: 'left | right' };
    // Regenerate ports the way updateNodeData would, since createDiagramNode
    // seeds from defaultData, not this test's overridden `cases`.
    branch.ports = [
      { id: 'b-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
      { id: 'b-left', name: 'left', direction: 'output', role: 'main', type: 'flow', position: 'right' },
      { id: 'b-right', name: 'right', direction: 'output', role: 'main', type: 'flow', position: 'right' },
    ];
    const leftEnd = createDiagramNode('EndActivity', { x: 0, y: 0 });
    leftEnd.data = { endMessage: 'Went left' };
    const rightEnd = createDiagramNode('EndActivity', { x: 0, y: 0 });
    rightEnd.data = { endMessage: 'Went right' };

    const d = doc(
      [branch, leftEnd, rightEnd],
      [
        { id: 'e-left', from: { node: branch.id, port: 'b-left' }, to: { node: leftEnd.id, port: leftEnd.ports[0].id } },
        { id: 'e-right', from: { node: branch.id, port: 'b-right' }, to: { node: rightEnd.id, port: rightEnd.ports[0].id } },
      ],
    );

    const first = advance(d, null);
    expect(first.waiting).toBe('choice');
    expect(first.waitOptions).toEqual(['left', 'right']);

    const second = advance(d, first.currentNodeId, 'right');
    expect(second.ended).toBe(true);
    expect(second.steps.some((s) => s.kind === 'bot' && s.text === 'Went right')).toBe(true);
    expect(second.steps.some((s) => s.kind === 'bot' && s.text === 'Went left')).toBe(false);
  });
});

describe('advance: WaitForUserInputActivity (free text)', () => {
  it('pauses for text and echoes it back as a user bubble on resume', () => {
    const wait = createDiagramNode('WaitForUserInputActivity', { x: 0, y: 0 });
    wait.data = { prompt: 'What is your name?' };
    const end = createDiagramNode('EndActivity', { x: 0, y: 0 });
    const d = doc([wait, end], [edge(wait, 'Output', end)]);

    const first = advance(d, null);
    expect(first.waiting).toBe('text');
    expect(first.steps).toEqual([{ kind: 'bot', text: 'What is your name?' }]);

    const second = advance(d, first.currentNodeId, 'Ada');
    expect(second.steps[0]).toEqual({ kind: 'user', text: 'Ada' });
    expect(second.ended).toBe(true);
  });
});

describe('advance: ChatPromptAttentionActivity (fire-and-forget, does not wait)', () => {
  it('surfaces promptAttention and continues immediately in the same turn', () => {
    const attn = createDiagramNode('ChatPromptAttentionActivity', { x: 0, y: 0 });
    attn.data = { message: 'Please respond', durationMs: '2000' };
    const end = createDiagramNode('EndActivity', { x: 0, y: 0 });
    const d = doc([attn, end], [edge(attn, 'Output', end)]);

    const result = advance(d, null);
    expect(result.ended).toBe(true);
    expect(result.promptAttention).toEqual({ text: 'Please respond', durationMs: 2000 });
  });
});
