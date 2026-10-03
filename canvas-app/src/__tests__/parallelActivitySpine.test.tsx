import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { DiagramNode } from '../components/DiagramNode';
import { calculateNodeDimensions } from '../rendering/portStyle';

describe('ParallelActivity Vertical Bus-Rail Spine Shape', () => {
  const parallelNodeProps = {
    id: 'parallel-node-1',
    data: {
      label: 'Parallel',
      type: 'ParallelActivity',
      ports: [
        { id: 'parallel-in', name: 'Input', direction: 'input' as const, role: 'main' as const, type: 'flow', position: 'left' as const },
        { id: 'parallel-branch-1', name: 'Branch 1', direction: 'output' as const, role: 'main' as const, type: 'flow', position: 'right' as const },
        { id: 'parallel-branch-2', name: 'Branch 2', direction: 'output' as const, role: 'main' as const, type: 'flow', position: 'right' as const },
        { id: 'parallel-branch-3', name: 'Branch 3', direction: 'output' as const, role: 'main' as const, type: 'flow', position: 'right' as const },
        { id: 'parallel-exc', name: 'Exception', direction: 'output' as const, role: 'exception' as const, type: 'flow', position: 'bottom' as const },
      ],
      rawData: {
        customName: 'RunAllTasks',
        branches: 'Branch 1 | Branch 2 | Branch 3',
        branchCount: '3',
        continueOnError: 'true',
        completeMessage: 'Done',
      },
      connectedOutputPortIds: [],
    },
    selected: true,
    selectable: true,
    deletable: true,
    draggable: true,
    type: 'diagramNode',
    zIndex: 1,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
  };

  it('renders the vertical bus rail with PARALLEL text and top title', () => {
    render(
      <ReactFlowProvider>
        <DiagramNode {...parallelNodeProps} />
      </ReactFlowProvider>
    );

    // Spine rail text
    const railText = screen.getByTestId('parallel-rail-text-parallel-node-1');
    expect(railText).toBeInTheDocument();
    expect(railText).toHaveTextContent(/parallel/i);

    // Top title chip
    const titleChip = screen.getByTestId('parallel-variable-chip-parallel-node-1');
    expect(titleChip).toBeInTheDocument();
    expect(titleChip).toHaveTextContent('RunAllTasks');
  });

  it('renders branch badges for each parallel branch output port', () => {
    render(
      <ReactFlowProvider>
        <DiagramNode {...parallelNodeProps} />
      </ReactFlowProvider>
    );

    expect(screen.getByTestId('parallel-branch-badge-parallel-branch-1')).toHaveTextContent('Branch 1');
    expect(screen.getByTestId('parallel-branch-badge-parallel-branch-2')).toHaveTextContent('Branch 2');
    expect(screen.getByTestId('parallel-branch-badge-parallel-branch-3')).toHaveTextContent('Branch 3');
  });

  it('dynamically calculates narrow 24px width and scalable height for ParallelActivity', () => {
    const dims3Branches = calculateNodeDimensions(
      [
        { position: 'left' },
        { position: 'right' },
        { position: 'right' },
        { position: 'right' },
        { position: 'bottom' },
      ],
      undefined,
      undefined,
      'ParallelActivity'
    );
    expect(dims3Branches.width).toBe(24);
    expect(dims3Branches.height).toBeGreaterThanOrEqual(110);
  });
});
