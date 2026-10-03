import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { DiagramNode } from '../components/DiagramNode';
import { calculateNodeDimensions } from '../rendering/portStyle';

describe('RepeatActivity Vertical Bus-Rail Spine Shape', () => {
  const repeatNodeProps = {
    id: 'repeat-node-1',
    data: {
      label: 'Repeat Loop',
      type: 'RepeatActivity',
      ports: [
        { id: 'repeat-in', name: 'Input', direction: 'input' as const, role: 'main' as const, type: 'flow', position: 'left' as const },
        { id: 'repeat-loop-body', name: 'Loop Body', direction: 'output' as const, role: 'main' as const, type: 'flow', position: 'right' as const },
        { id: 'repeat-loop-done', name: 'Done', direction: 'output' as const, role: 'main' as const, type: 'flow', position: 'right' as const },
        { id: 'repeat-exc', name: 'Exception', direction: 'output' as const, role: 'exception' as const, type: 'flow', position: 'bottom' as const },
      ],
      rawData: {
        customName: 'CollectBeneficiaries',
        loopMode: 'user_prompt',
        continuePrompt: 'Would you like to add another beneficiary?',
        collectionKey: 'Beneficiaries_List',
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

  it('renders the vertical bus rail with WHILE text and top prompt chip', () => {
    render(
      <ReactFlowProvider>
        <DiagramNode {...repeatNodeProps} />
      </ReactFlowProvider>
    );

    // Spine rail text
    const railText = screen.getByTestId('repeat-rail-text-repeat-node-1');
    expect(railText).toBeInTheDocument();
    expect(railText).toHaveTextContent(/while/i);

    // Top chip with prompt or custom name
    const modeChip = screen.getByTestId('repeat-mode-chip-repeat-node-1');
    expect(modeChip).toBeInTheDocument();
    expect(modeChip).toHaveTextContent(/Would you like to add another beneficiary\?/i);
  });

  it('renders Loop Body and Done port badges on the right side of the spine', () => {
    render(
      <ReactFlowProvider>
        <DiagramNode {...repeatNodeProps} />
      </ReactFlowProvider>
    );

    const loopBadge = screen.getByTestId('repeat-loop-badge-repeat-loop-body');
    expect(loopBadge).toBeInTheDocument();
    expect(loopBadge).toHaveTextContent('Loop Body');

    const doneBadge = screen.getByTestId('repeat-done-badge-repeat-loop-done');
    expect(doneBadge).toBeInTheDocument();
    expect(doneBadge).toHaveTextContent('Done');
  });

  it('computes comfortable height and 24px rail width', () => {
    const dims = calculateNodeDimensions(repeatNodeProps.data.ports, undefined, undefined, 'RepeatActivity');
    expect(dims.width).toBe(24);
    expect(dims.height).toBeGreaterThanOrEqual(110);
  });
});
