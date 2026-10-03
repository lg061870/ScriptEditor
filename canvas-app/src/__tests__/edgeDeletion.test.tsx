import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider, Position } from '@xyflow/react';
import { RoleEdge } from '../components/RoleEdge';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramDocument } from '../schema/diagram';

describe('Edge Selection & Deletion Affordance', () => {
  const initialDoc: DiagramDocument = {
    viewport: { panX: 0, panY: 0, zoom: 1 },
    nodes: [
      {
        id: 'node1',
        type: 'SetVariableActivity',
        name: 'Set1',
        x: 100,
        y: 100,
        ports: [
          { id: 'node1-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
        ],
        context: { reads: [], writes: ['TheWorldPart'] },
        data: { variableName: 'TheWorldPart', value: 'World' },
      },
      {
        id: 'node2',
        type: 'SimpleActivity',
        name: 'BotMessage',
        x: 400,
        y: 100,
        ports: [
          { id: 'node2-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
        ],
        context: { reads: [], writes: [] },
        data: { message: 'Hello' },
      },
    ],
    edges: [
      { id: 'edge-to-delete', from: { node: 'node1', port: 'node1-out' }, to: { node: 'node2', port: 'node2-in' } },
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
      selectedEdgeIds: new Set(),
      selectedNodeIds: new Set(),
    });
  });

  it('renders a delete button when the edge is selected', () => {
    const onDelete = vi.fn();
    render(
      <ReactFlowProvider>
        <svg>
          <RoleEdge
            id="edge-to-delete"
            source="node1"
            target="node2"
            sourceX={150}
            sourceY={100}
            targetX={400}
            targetY={100}
            sourcePosition={Position.Right}
            targetPosition={Position.Left}
            selected={true}
            data={{ onDelete, sourceRole: 'main' }}
          />
        </svg>
      </ReactFlowProvider>
    );

    const deleteBtn = screen.getByTestId('delete-edge-edge-to-delete');
    expect(deleteBtn).toBeInTheDocument();
    expect(deleteBtn).toHaveAttribute('title', 'Delete connector');

    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith('edge-to-delete');
  });

  it('renders a delete button on hover even if not selected', () => {
    const { container } = render(
      <ReactFlowProvider>
        <svg>
          <RoleEdge
            id="edge-hover-test"
            source="node1"
            target="node2"
            sourceX={150}
            sourceY={100}
            targetX={400}
            targetY={100}
            sourcePosition={Position.Right}
            targetPosition={Position.Left}
            selected={false}
            data={{ sourceRole: 'main' }}
          />
        </svg>
      </ReactFlowProvider>
    );

    expect(screen.queryByTestId('delete-edge-edge-hover-test')).not.toBeInTheDocument();

    const group = container.querySelector('.role-edge-group');
    expect(group).toBeTruthy();
    fireEvent.mouseEnter(group!);

    expect(screen.getByTestId('delete-edge-edge-hover-test')).toBeInTheDocument();
  });

  it('removes the edge from document and selectedEdgeIds when removeEdges is called', () => {
    useDiagramStore.getState().setEdgeSelection(new Set(['edge-to-delete']));
    expect(useDiagramStore.getState().selectedEdgeIds.has('edge-to-delete')).toBe(true);

    useDiagramStore.getState().removeEdges(['edge-to-delete'], 'Canvas');

    const state = useDiagramStore.getState();
    expect(state.document.edges.some((e) => e.id === 'edge-to-delete')).toBe(false);
    expect(state.selectedEdgeIds.has('edge-to-delete')).toBe(false);
  });
});
