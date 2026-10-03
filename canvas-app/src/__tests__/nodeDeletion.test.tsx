import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { DiagramNode } from '../components/DiagramNode';
import { Inspector } from '../components/Inspector';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramDocument } from '../schema/diagram';

describe('Node Deletion Affordance', () => {
  const initialDoc: DiagramDocument = {
    viewport: { panX: 0, panY: 0, zoom: 1 },
    nodes: [
      {
        id: 'node1',
        type: 'SimpleActivity',
        name: 'Greeting',
        x: 100,
        y: 100,
        ports: [
          { id: 'node1-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
        ],
        context: { reads: [], writes: [] },
        data: { message: 'Hello' },
      },
      {
        id: 'node2',
        type: 'EndActivity',
        name: 'End',
        x: 300,
        y: 100,
        ports: [
          { id: 'node2-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
        ],
        context: { reads: [], writes: [] },
        data: { endMessage: 'Bye' },
      },
    ],
    edges: [
      { id: 'e1', from: { node: 'node1', port: 'node1-out' }, to: { node: 'node2', port: 'node2-in' } },
    ],
    cards: [],
    models: [],
  };

  beforeEach(() => {
    useDiagramStore.setState({
      document: initialDoc,
      topics: [
        {
          id: 'MainConversation',
          name: 'MainConversation',
          isInitial: true,
          document: initialDoc,
        },
      ],
      activeTopicId: 'MainConversation',
      selectedNodeIds: new Set(['node1']),
    });
  });

  it('renders a delete "x" button on the canvas node shape', () => {
    const onRequestDeleteNode = vi.fn();

    render(
      <ReactFlowProvider>
        <DiagramNode
          id="node1"
          data={{
            label: 'Greeting',
            type: 'SimpleActivity',
            ports: [
              { id: 'node1-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
            ],
            rawData: { message: 'Hello' },
            connectedOutputPortIds: ['node1-out'],
            onRequestDeleteNode,
          }}
          selected={true}
          selectable={true}
          deletable={true}
          draggable={true}
          type="diagramNode"
          zIndex={1}
          isConnectable={true}
          positionAbsoluteX={100}
          positionAbsoluteY={100}
          dragging={false}
        />
      </ReactFlowProvider>
    );

    const deleteBtn = screen.getByTestId('delete-node-node1');
    expect(deleteBtn).toBeInTheDocument();
    expect(deleteBtn).toHaveAttribute('title', 'Delete Bot Message');

    fireEvent.click(deleteBtn);
    expect(onRequestDeleteNode).toHaveBeenCalledWith('node1');
  });

  it('deletes the node and connected edges directly from the store when "x" is clicked without callback', () => {
    render(
      <ReactFlowProvider>
        <DiagramNode
          id="node1"
          data={{
            label: 'Greeting',
            type: 'SimpleActivity',
            ports: [
              { id: 'node1-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
            ],
            rawData: { message: 'Hello' },
            connectedOutputPortIds: ['node1-out'],
          }}
          selected={true}
          selectable={true}
          deletable={true}
          draggable={true}
          type="diagramNode"
          zIndex={1}
          isConnectable={true}
          positionAbsoluteX={100}
          positionAbsoluteY={100}
          dragging={false}
        />
      </ReactFlowProvider>
    );

    const deleteBtn = screen.getByTestId('delete-node-node1');
    fireEvent.click(deleteBtn);

    const state = useDiagramStore.getState();
    // node1 should be gone from the document
    expect(state.document.nodes.some((n) => n.id === 'node1')).toBe(false);
    expect(state.document.nodes.length).toBe(1);
    expect(state.document.nodes[0].id).toBe('node2');

    // Edge connected to node1 should also be pruned
    expect(state.document.edges.length).toBe(0);

    // Selection should be cleared
    expect(state.selectedNodeIds.has('node1')).toBe(false);
  });

  it('renders a "Delete Activity" button in the Inspector that deletes the node from the workspace', () => {
    const onUpdateData = vi.fn();
    const onClose = vi.fn();

    render(
      <Inspector
        node={initialDoc.nodes[0]}
        onUpdateData={onUpdateData}
        onClose={onClose}
        isActive={true}
      />
    );

    const inspectorDeleteBtn = screen.getByTestId('inspector-delete-node-btn');
    expect(inspectorDeleteBtn).toBeInTheDocument();
    expect(inspectorDeleteBtn).toHaveTextContent(/Delete Activity/);

    fireEvent.click(inspectorDeleteBtn);

    const state = useDiagramStore.getState();
    expect(state.document.nodes.some((n) => n.id === 'node1')).toBe(false);
    expect(state.document.nodes.length).toBe(1);
  });
});
