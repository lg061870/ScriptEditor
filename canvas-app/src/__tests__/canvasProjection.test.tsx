import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { sampleDocument } from '../fixtures/sampleDocument';

/**
 * Phase 2.2: "Canvas as a pure projection of JSON" -- verified here by
 * mutating the store directly (no simulated drag/drop, no click, no
 * canvas-originated write of any kind) and asserting the rendered DOM
 * picks it up. If the canvas held any of its own local state instead of
 * purely deriving from the store, this would fail (the new node would
 * exist in the store but never appear on screen).
 */
describe('canvas as a pure projection of the store', () => {
  beforeEach(() => {
    // Reset to a known document before each test -- the store is a
    // module-level singleton, so state from one test would otherwise leak
    // into the next.
    useDiagramStore.setState({
      document: sampleDocument,
      versionId: 0,
      codeRegenRequestCount: 0,
      selectedNodeIds: new Set(),
      pendingConnection: null,
    });
  });

  it('renders a node added via a direct store mutation, with no canvas interaction', async () => {
    render(<App />);
    // "Bot Message"/"Pacing Pause" are also palette item labels, so queries
    // are scoped to the canvas surface specifically, not the whole page.
    const canvas = within(screen.getByTestId('canvas-surface'));

    // Sanity check: the fixture's own nodes render before any mutation.
    expect(await canvas.findByText('Bot Message')).toBeInTheDocument();
    expect(canvas.queryByText('Pacing Pause')).not.toBeInTheDocument();

    // The mutation under test: call the store action directly. No
    // fireEvent, no user-event, nothing that touches the DOM at all.
    useDiagramStore.getState().addNode('DelayActivity', { x: 500, y: 500 }, 'Canvas');

    // The canvas must pick this up purely from the store re-render.
    await waitFor(() => {
      expect(canvas.getByText('Pacing Pause')).toBeInTheDocument();
    });
  });

  it('reflects a direct updateNodeData mutation in the node summary, with no Inspector interaction', async () => {
    render(<App />);
    const canvas = within(screen.getByTestId('canvas-surface'));
    expect(await canvas.findByText('Thanks for chatting! How can I help you today?')).toBeInTheDocument();

    useDiagramStore.getState().updateNodeData('n1', 'message', 'Mutated straight through the store', 'Canvas');

    await waitFor(() => {
      expect(canvas.getByText('Mutated straight through the store')).toBeInTheDocument();
    });
  });
});
