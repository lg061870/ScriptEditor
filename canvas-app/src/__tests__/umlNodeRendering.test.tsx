import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { DiagramNode } from '../components/DiagramNode';
import { calculateNodeDimensions } from '../rendering/portStyle';
import type { DiagramNodeData } from '../mapping/toReactFlow';

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  return {
    ...actual,
    Handle: (props: any) => <div data-testid={`handle-${props.id}`} {...props} />,
  };
});

function renderDiagramNode(nodeId: string, data: DiagramNodeData, selected = false) {
  return render(
    <ReactFlowProvider>
      <DiagramNode
        id={nodeId}
        data={data}
        selected={selected}
        type="diagramNode"
        zIndex={1}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        selectable={true}
        deletable={true}
        draggable={true}
      />
    </ReactFlowProvider>,
  );
}

describe('UML Circular Workflow Shapes (StartNode & EndActivity)', () => {
  it('calculates correct circular dimensions: 14x14 for StartNode and 16x16 for EndActivity', () => {
    const startDims = calculateNodeDimensions([], undefined, undefined, 'StartNode');
    expect(startDims).toEqual({ width: 14, height: 14 });

    const endDims = calculateNodeDimensions([], undefined, undefined, 'EndActivity');
    expect(endDims).toEqual({ width: 16, height: 16 });
  });

  it('renders StartNode as a solid black filled circle with output handle on the right and no delete button', () => {
    const startData: DiagramNodeData = {
      label: 'Start',
      type: 'StartNode',
      rawData: {},
      ports: [
        { id: 'start-1-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
      ],
      connectedOutputPortIds: [],
    };

    renderDiagramNode('start-1', startData);

    const circle = screen.getByTestId('uml-start-node-start-1');
    expect(circle).toBeInTheDocument();
    expect(circle.style.borderRadius).toBe('50%');
    expect(circle.style.backgroundColor).toBe('rgb(24, 24, 27)'); // #18181b

    // Label underneath
    const title = screen.getByTestId('node-title-start-1');
    expect(title).toHaveTextContent('Start');

    // Right output handle
    const handle = screen.getByTestId('handle-start-1-out');
    expect(handle).toBeInTheDocument();

    // Start node is protected and must NEVER render a delete button
    expect(screen.queryByTestId('delete-node-start-1')).not.toBeInTheDocument();
  });

  it('renders EndActivity as a bullseye circle (outer ring + solid inner dot) with input handle on left', () => {
    const endData: DiagramNodeData = {
      label: 'End Conversation',
      type: 'EndActivity',
      rawData: { endMessage: 'Goodbye!' },
      ports: [
        { id: 'end-1-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
      ],
      connectedOutputPortIds: [],
    };

    renderDiagramNode('end-1', endData);

    const outerCircle = screen.getByTestId('uml-end-node-end-1');
    expect(outerCircle).toBeInTheDocument();
    expect(outerCircle.style.borderRadius).toBe('50%');
    expect(outerCircle.style.border).toContain('solid rgb(24, 24, 27)');

    // Inner bullseye center
    const innerDot = outerCircle.querySelector('div');
    expect(innerDot).toBeInTheDocument();
    expect(innerDot?.style.borderRadius).toBe('50%');
    expect(innerDot?.style.backgroundColor).toBe('rgb(24, 24, 27)');

    // Label underneath reflects endMessage
    const title = screen.getByTestId('node-title-end-1');
    expect(title).toHaveTextContent('Goodbye!');

    // Left input handle
    const handle = screen.getByTestId('handle-end-1-in');
    expect(handle).toBeInTheDocument();

    // End node CAN be deleted, unlike StartNode
    expect(screen.getByTestId('delete-node-end-1')).toBeInTheDocument();
  });

  it('renders dashed ring and unconnected badge when EndActivity is free-floating', () => {
    const endData: DiagramNodeData = {
      label: 'End Conversation',
      type: 'EndActivity',
      isFreeFloating: true,
      rawData: {},
      ports: [
        { id: 'end-orphan-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
      ],
      connectedOutputPortIds: [],
    };

    renderDiagramNode('end-orphan', endData);

    const outerCircle = screen.getByTestId('uml-end-node-end-orphan');
    expect(outerCircle.style.border).toContain('dashed rgb(245, 158, 11)'); // #f59e0b

    const badge = screen.getByTestId('free-floating-badge-end-orphan');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Unconnected');
  });
});
