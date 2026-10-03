import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { DiagramNode } from '../components/DiagramNode';
import { getActivityDoc } from '../registry/activityDocs';
import { calculateNodeDimensions } from '../rendering/portStyle';

describe('ConditionalActivity Diamond Flowchart Shape & Branching', () => {
  it('calculates custom dimensions for ConditionalActivity diamond shape', () => {
    const defaultDims = calculateNodeDimensions([], undefined, undefined, 'SimpleActivity');
    expect(defaultDims.width).toBe(220);
    expect(defaultDims.height).toBe(54);

    const conditionDims = calculateNodeDimensions([], undefined, undefined, 'ConditionalActivity');
    expect(conditionDims.width).toBe(110);
    expect(conditionDims.height).toBe(95);

    const autoFitDims = calculateNodeDimensions([], undefined, undefined, 'ConditionalActivity', 'EligibilityCheck');
    expect(autoFitDims.width).toBe(140);
    expect(autoFitDims.height).toBe(121);

    const resizedDims = calculateNodeDimensions([], 200, 116, 'ConditionalActivity');
    expect(resizedDims.width).toBe(200);
    expect(resizedDims.height).toBe(116);
  });

  it('renders a diamond polygon, centered condition expression, 5px Yes/No micro-badges, and no internal icon', () => {
    const onRequestAddNode = vi.fn();
    const onRequestDeleteNode = vi.fn();
    const onRequestResizeNode = vi.fn();

    render(
      <ReactFlowProvider>
        <DiagramNode
          id="node_cond"
          data={{
            label: 'If Then Else',
            customName: 'EligibilityCheck',
            type: 'ConditionalActivity',
            ports: [
              { id: 'node_cond-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
              { id: 'node_cond-yes', name: 'Yes', direction: 'output', role: 'main', type: 'flow', position: 'right' },
              { id: 'node_cond-no', name: 'No', direction: 'output', role: 'main', type: 'flow', position: 'bottom' },
              { id: 'node_cond-exc', name: 'Exception', direction: 'output', role: 'exception', type: 'flow', position: 'top' },
            ],
            rawData: {
              selectorKey: 'user.isEligible',
            },
            connectedOutputPortIds: [],
            onRequestAddNode,
            onRequestDeleteNode,
            onRequestResizeNode,
          }}
          selected={true}
          selectable={true}
          deletable={true}
          draggable={true}
          type="diagramNode"
          zIndex={1}
          isConnectable={true}
          positionAbsoluteX={200}
          positionAbsoluteY={200}
          dragging={false}
        />
      </ReactFlowProvider>
    );

    // 1. Diamond SVG Polygon exists with auto-fitted dimensions for EligibilityCheck (140x121)
    const diamondSvg = screen.getByTestId('condition-diamond-node_cond');
    expect(diamondSvg).toBeInTheDocument();
    const polygon = diamondSvg.querySelector('polygon');
    expect(polygon).toBeInTheDocument();
    expect(polygon?.getAttribute('points')).toBe('2,60.5 70,2 138,60.5 70,119');

    // 2. Diamond content container & title: 'If Then Else' text and internal icon are omitted
    expect(screen.getByTestId('condition-diamond-content-node_cond')).toBeInTheDocument();
    expect(screen.queryByText('If Then Else')).toBeNull();
    expect(screen.queryByText('⚖️')).toBeNull();
    const title = screen.getByText('EligibilityCheck');
    expect(title).toBeInTheDocument();
    expect(title.style.wordBreak).toBe('break-word');

    // 3. Output branch badges: Yes on right vertex, No on bottom vertex with 5px micro-font
    const yesBadge = screen.getByTestId('branch-badge-node_cond-yes');
    expect(yesBadge).toBeInTheDocument();
    expect(yesBadge).toHaveTextContent('Yes');
    expect(yesBadge.style.fontSize).toBe('5px');
    expect(yesBadge.style.right).toBe('14px');

    const noBadge = screen.getByTestId('branch-badge-node_cond-no');
    expect(noBadge).toBeInTheDocument();
    expect(noBadge).toHaveTextContent('No');
    expect(noBadge.style.fontSize).toBe('5px');
    expect(noBadge.style.bottom).toBe('12px');

    // 4. Delete button is present at top-right corner
    const deleteBtn = screen.getByTestId('delete-node-node_cond');
    expect(deleteBtn).toBeInTheDocument();
    expect(deleteBtn.style.top).toBe('-4px');
    expect(deleteBtn.style.right).toBe('-4px');

    fireEvent.click(deleteBtn);
    expect(onRequestDeleteNode).toHaveBeenCalledWith('node_cond');
  });

  it('supports in-place renaming inside the diamond on double click', () => {
    const onRequestRenameNode = vi.fn();

    render(
      <ReactFlowProvider>
        <DiagramNode
          id="node_cond_rename"
          data={{
            label: 'If Then Else',
            customName: 'CreditRating',
            type: 'ConditionalActivity',
            ports: [
              { id: 'p1', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
              { id: 'p2', name: 'Approved', direction: 'output', role: 'main', type: 'flow', position: 'right' },
            ],
            rawData: {},
            connectedOutputPortIds: [],
            onRequestRenameNode,
          }}
          selected={false}
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

    const titleEl = screen.getByTestId('node-title-node_cond_rename');
    expect(titleEl).toHaveTextContent('CreditRating');

    // Double-click to start inline editing
    fireEvent.doubleClick(titleEl.parentElement!);

    const input = screen.getByTestId('inline-node-name-input-node_cond_rename') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('CreditRating');

    // Change value and submit via Enter
    fireEvent.change(input, { target: { value: 'RiskAssessment' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onRequestRenameNode).toHaveBeenCalledWith('node_cond_rename', 'RiskAssessment');
  });

  it('provides reference documentation with ASCII flowchart and real-world example', () => {
    const doc = getActivityDoc('ConditionalActivity');
    expect(doc).toBeDefined();
    expect(doc.type).toBe('ConditionalActivity');
    expect(doc.summary).toContain('Evaluates a conditional key or expression');
    expect(doc.graphicalExplanation).toContain('Condition');
    expect(doc.referenceUseCase).toContain('eligibility');
    expect(doc.bestPractices).toBeDefined();
    expect(doc.bestPractices?.length).toBeGreaterThan(0);
  });
});
