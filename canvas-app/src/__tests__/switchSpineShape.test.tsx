import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { DiagramNode } from '../components/DiagramNode';
import { calculateNodeDimensions } from '../rendering/portStyle';

describe('SwitchActivity Vertical Bus-Rail Spine Shape', () => {
  const switchNodeProps = {
    id: 'switch-node-1',
    data: {
      label: 'Switch',
      type: 'SwitchActivity',
      ports: [
        { id: 'switch-in', name: 'Input', direction: 'input' as const, role: 'main' as const, type: 'flow', position: 'left' as const },
        { id: 'switch-case-1', name: 'VIP', direction: 'output' as const, role: 'main' as const, type: 'flow', position: 'right' as const },
        { id: 'switch-case-2', name: 'Standard', direction: 'output' as const, role: 'main' as const, type: 'flow', position: 'right' as const },
        { id: 'switch-case-3', name: 'Trial', direction: 'output' as const, role: 'main' as const, type: 'flow', position: 'right' as const },
        { id: 'switch-case-default', name: 'Default', direction: 'output' as const, role: 'main' as const, type: 'flow', position: 'right' as const },
        { id: 'switch-exc', name: 'Exception', direction: 'output' as const, role: 'exception' as const, type: 'flow', position: 'bottom' as const },
      ],
      rawData: {
        valueContextKey: 'Global_UserTier',
        caseKeys: 'VIP | Standard | Trial',
        defaultCase: 'Default',
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

  it('renders the vertical bus rail with SWITCH text and top variable chip', () => {
    render(
      <ReactFlowProvider>
        <DiagramNode {...switchNodeProps} />
      </ReactFlowProvider>
    );

    // Spine rail text
    const railText = screen.getByTestId('switch-rail-text-switch-node-1');
    expect(railText).toBeInTheDocument();
    expect(railText).toHaveTextContent(/switch/i);

    // Top variable pill chip
    const variableChip = screen.getByTestId('switch-variable-chip-switch-node-1');
    expect(variableChip).toBeInTheDocument();
    expect(variableChip).toHaveTextContent('Global_UserTier');
  });

  it('renders distinct colored case badges for each case output tier', () => {
    render(
      <ReactFlowProvider>
        <DiagramNode {...switchNodeProps} />
      </ReactFlowProvider>
    );

    const case1Badge = screen.getByTestId('switch-case-badge-switch-case-1');
    const case2Badge = screen.getByTestId('switch-case-badge-switch-case-2');
    const case3Badge = screen.getByTestId('switch-case-badge-switch-case-3');
    const defaultBadge = screen.getByTestId('default-port-badge-switch-case-default');

    expect(case1Badge).toHaveTextContent('VIP');
    expect(case2Badge).toHaveTextContent('Standard');
    expect(case3Badge).toHaveTextContent('Trial');
    expect(defaultBadge).toHaveTextContent('Default');
  });

  it('dynamically calculates narrow width and height based on case count in calculateNodeDimensions', () => {
    const dims2Cases = calculateNodeDimensions(
      [
        { position: 'left', role: 'main' },
        { position: 'right', role: 'main' },
        { position: 'right', role: 'main' },
      ],
      undefined,
      undefined,
      'SwitchActivity'
    );

    // Width should be narrow (24px)
    expect(dims2Cases.width).toBe(24);
    expect(dims2Cases.height).toBeGreaterThanOrEqual(110);

    const dims5Cases = calculateNodeDimensions(
      [
        { position: 'left', role: 'main' },
        { position: 'right', role: 'main' },
        { position: 'right', role: 'main' },
        { position: 'right', role: 'main' },
        { position: 'right', role: 'main' },
        { position: 'right', role: 'main' },
        { position: 'bottom', role: 'exception' },
      ],
      undefined,
      undefined,
      'SwitchActivity'
    );

    // 5 cases should be taller than 2 cases
    expect(dims5Cases.width).toBe(24);
    expect(dims5Cases.height).toBeGreaterThan(dims2Cases.height);
  });
});
