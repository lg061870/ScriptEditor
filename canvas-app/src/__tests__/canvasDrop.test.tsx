import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { PALETTE_DND_TYPE } from '../components/Palette';

import { sampleDocument } from '../fixtures/sampleDocument';

describe('Canvas Drag and Drop', () => {
  beforeEach(() => {
    useDiagramStore.setState({
      document: sampleDocument,
      selectedNodeIds: new Set(),
      pendingConnection: null,
      versionId: 0,
      codeRegenRequestCount: 0,
    });
  });

  it('creates exactly one node when an activity is dropped onto the canvas', () => {
    render(<App />);

    const initialCount = useDiagramStore.getState().document.nodes.length;
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Find the canvas drop target inside canvas-surface
    const dropZone = screen.getByTestId('canvas-drop-zone');
    // Drop on canvas surface
    fireEvent.drop(dropZone, {
      clientX: 350,
      clientY: 200,
      dataTransfer: {
        getData: (type: string) => (type === PALETTE_DND_TYPE ? 'AdaptiveCardActivity' : ''),
      },
    });

    const nodes = useDiagramStore.getState().document.nodes;
    // Exactly initialCount + 1 nodes (NOT duplicated)
    expect(nodes).toHaveLength(initialCount + 1);
    expect(nodes[nodes.length - 1].type).toBe('AdaptiveCardActivity');
  });

  it('clicking on a dropped node to inspect properties does not duplicate it', async () => {
    render(<App />);

    const initialCount = useDiagramStore.getState().document.nodes.length;
    const dropZone = screen.getByTestId('canvas-drop-zone');
    fireEvent.drop(dropZone, {
      clientX: 350,
      clientY: 200,
      dataTransfer: {
        getData: (type: string) => (type === PALETTE_DND_TYPE ? 'AdaptiveCardActivity' : ''),
      },
    });

    const store = useDiagramStore.getState();
    expect(store.document.nodes).toHaveLength(initialCount + 1);
    const droppedNode = store.document.nodes[store.document.nodes.length - 1];

    // Select the node (as clicking it does in ReactFlow)
    act(() => {
      useDiagramStore.getState().setSelection(new Set([droppedNode.id]));
    });

    // Inspector should open for the selected node
    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel')).toBeTruthy();
      expect(screen.getByText('PROPERTIES: User Form')).toBeTruthy();
    });

    // The node count in the store must remain strictly initialCount + 1
    expect(useDiagramStore.getState().document.nodes).toHaveLength(initialCount + 1);
  });
});
