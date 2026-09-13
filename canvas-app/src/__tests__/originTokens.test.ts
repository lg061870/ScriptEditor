import { describe, it, expect, beforeEach } from 'vitest';
import { useDiagramStore } from '../store/diagramStore';
import { sampleDocument } from '../fixtures/sampleDocument';

/**
 * Phase 2.3 / ADR 0002 (docs/adr/0002-origin-token-sync-protocol.md):
 * every mutation carries an origin tag, and the one loop-prevention rule
 * it exists to enforce is that a CodeEditor-origin mutation must NOT
 * re-trigger a new code-regen request -- because that state IS the code
 * editor's own text reflected back; re-requesting a transcription of it is
 * the loop. Every other origin propagates unconditionally.
 *
 * codeRegenRequestCount is the store's stand-in for "a code-regen request
 * was triggered" (Phase 2.4's preview panel derives straight from
 * `document`, cheap and synchronous; this counter is the signal Phase
 * 3.3's real debounced API call will actually gate on). This test
 * exercises the rule directly against the store, simulating a
 * CodeEditor-origin mutation the way Phase 3.2's real C#-to-JSON parser
 * eventually will, since no code editor UI exists yet to produce one for
 * real.
 */
describe('origin-token loop prevention (ADR 0002)', () => {
  beforeEach(() => {
    useDiagramStore.setState({
      document: sampleDocument,
      versionId: 0,
      codeRegenRequestCount: 0,
      selectedNodeIds: new Set(),
      pendingConnection: null,
    });
  });

  it('does not bump codeRegenRequestCount for a CodeEditor-origin mutation', () => {
    const before = useDiagramStore.getState().codeRegenRequestCount;

    useDiagramStore.getState().updateNodeData('n1', 'message', 'edited via code', 'CodeEditor');

    expect(useDiagramStore.getState().codeRegenRequestCount).toBe(before);
    // The mutation itself still applies -- only the regen trigger is
    // suppressed, per ADR 0002 ("Canvas and Inspector both re-render
    // unconditionally regardless of origin").
    expect(useDiagramStore.getState().document.nodes.find((n) => n.id === 'n1')?.data.message).toBe(
      'edited via code',
    );
  });

  it('bumps codeRegenRequestCount for a Canvas-origin mutation', () => {
    const before = useDiagramStore.getState().codeRegenRequestCount;

    useDiagramStore.getState().moveNode('n1', { x: 42, y: 42 }, 'Canvas');

    expect(useDiagramStore.getState().codeRegenRequestCount).toBe(before + 1);
  });

  it('bumps codeRegenRequestCount for an Inspector-origin mutation', () => {
    const before = useDiagramStore.getState().codeRegenRequestCount;

    useDiagramStore.getState().updateNodeData('n1', 'message', 'edited via inspector', 'Inspector');

    expect(useDiagramStore.getState().codeRegenRequestCount).toBe(before + 1);
  });

  it('does not bump codeRegenRequestCount across a sequence of CodeEditor-origin mutations, then resumes on the next Canvas-origin one', () => {
    const start = useDiagramStore.getState().codeRegenRequestCount;

    useDiagramStore.getState().updateNodeData('n1', 'message', 'first code edit', 'CodeEditor');
    useDiagramStore.getState().updateNodeData('n1', 'message', 'second code edit', 'CodeEditor');
    useDiagramStore.getState().moveNode('n2', { x: 1, y: 1 }, 'CodeEditor');

    expect(useDiagramStore.getState().codeRegenRequestCount).toBe(start);

    useDiagramStore.getState().addNode('DelayActivity', { x: 0, y: 0 }, 'Canvas');

    expect(useDiagramStore.getState().codeRegenRequestCount).toBe(start + 1);
  });

  it('every mutation type accepts and respects an origin tag', () => {
    const store = useDiagramStore.getState();
    const before = store.codeRegenRequestCount;

    const nodeId = store.addNode('SimpleActivity', { x: 0, y: 0 }, 'CodeEditor');
    store.connectEdge({ node: 'n1', port: 'n1-out' }, { node: nodeId, port: `${nodeId}-in` }, 'CodeEditor');
    store.removeEdges(['e1'], 'CodeEditor');
    store.removeNodes([nodeId], 'CodeEditor');

    // Four CodeEditor-origin mutations of four different kinds -- none of
    // them should have bumped the counter.
    expect(useDiagramStore.getState().codeRegenRequestCount).toBe(before);
  });
});
