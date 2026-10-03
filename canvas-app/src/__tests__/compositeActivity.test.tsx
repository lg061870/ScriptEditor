import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { DiagramNode } from '../components/DiagramNode';
import { CompositeSequenceEditor } from '../components/CompositeSequenceEditor';
import { Inspector } from '../components/Inspector';
import type { DiagramNode as SchemaNode } from '../schema/diagram';

describe('CompositeActivity Graphical Representation & Pipeline Editor', () => {
  const sampleStepsJson = JSON.stringify([
    { id: 's1', type: 'SimpleActivity', name: 'Step1_Notice', data: { message: 'Welcome to flow' } },
    { id: 's2', type: 'DelayActivity', name: 'Step2_Wait', data: { durationMs: '1500' } },
    { id: 's3', type: 'SimpleActivity', name: 'Step3_Complete', data: { message: 'Finished' } },
  ]);

  it('renders an embedded sequential pipeline of child activities on the canvas shape', () => {
    render(
      <ReactFlowProvider>
        <DiagramNode
          id="node_composite"
          data={{
            label: 'OnboardingPipeline',
            type: 'CompositeActivity',
            ports: [
              { id: 'node_composite-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
              { id: 'node_composite-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
              { id: 'node_composite-exc', name: 'Exception', direction: 'output', role: 'exception', type: 'flow', position: 'bottom' },
            ],
            rawData: {
              isolateContext: 'true',
              completeMessage: 'Pipeline complete!',
              steps: sampleStepsJson,
            },
            connectedOutputPortIds: [],
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

    // Header & Badge
    expect(screen.getByText('Composite Sequence')).toBeInTheDocument();
    expect(screen.getByText('ISOLATED')).toBeInTheDocument();

    // Expanded Steps Pipeline
    expect(screen.getByTestId('composite-expanded-steps-node_composite')).toBeInTheDocument();
    expect(screen.getByText('3 Sequential Steps')).toBeInTheDocument();
    expect(screen.getByText('Step1_Notice')).toBeInTheDocument();
    expect(screen.getByText('Step2_Wait')).toBeInTheDocument();
    expect(screen.getByText('Step3_Complete')).toBeInTheDocument();
    expect(screen.getByText('Welcome to flow')).toBeInTheDocument();
    expect(screen.getByText('1500ms')).toBeInTheDocument();

    // Complete message
    expect(screen.getByText('💬 "Pipeline complete!"')).toBeInTheDocument();
  });

  it('toggles between expanded pipeline view and compact summary pill strip on the canvas', () => {
    render(
      <ReactFlowProvider>
        <DiagramNode
          id="node_composite"
          data={{
            label: 'OnboardingPipeline',
            type: 'CompositeActivity',
            ports: [
              { id: 'node_composite-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
              { id: 'node_composite-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
            ],
            rawData: {
              isolateContext: 'false',
              steps: sampleStepsJson,
            },
            connectedOutputPortIds: [],
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

    const toggleBtn = screen.getByTestId('toggle-composite-node_composite');
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent('▾');
    expect(screen.getByTestId('composite-expanded-steps-node_composite')).toBeInTheDocument();

    // Click toggle to collapse
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveTextContent('▸');
    expect(screen.queryByTestId('composite-expanded-steps-node_composite')).not.toBeInTheDocument();
    expect(screen.getByTestId('composite-collapsed-strip-node_composite')).toBeInTheDocument();
    expect(screen.getByText('(3 steps)')).toBeInTheDocument();

    // Click toggle to expand back
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveTextContent('▾');
    expect(screen.getByTestId('composite-expanded-steps-node_composite')).toBeInTheDocument();
  });

  it('allows managing steps, reordering, and updating step parameters in CompositeSequenceEditor', () => {
    const onUpdateData = vi.fn();

    render(
      <CompositeSequenceEditor
        nodeId="node_composite"
        data={{
          isolateContext: 'true',
          completeMessage: 'Done',
          steps: sampleStepsJson,
        }}
        onUpdateData={onUpdateData}
      />
    );

    // Isolate context toggle
    const isolateCheckbox = screen.getByTestId('composite-isolate-context-checkbox');
    expect(isolateCheckbox).toBeChecked();
    fireEvent.click(isolateCheckbox);
    expect(onUpdateData).toHaveBeenCalledWith('node_composite', 'isolateContext', 'false');

    // Complete message input
    const completeMsgInput = screen.getByTestId('composite-complete-message-input');
    expect(completeMsgInput).toHaveValue('Done');
    fireEvent.change(completeMsgInput, { target: { value: 'All steps completed successfully' } });
    expect(onUpdateData).toHaveBeenCalledWith('node_composite', 'completeMessage', 'All steps completed successfully');

    // Step selection & active step form
    const step2 = screen.getByTestId('composite-step-item-1');
    fireEvent.click(step2);

    expect(screen.getByText('Step 2 Properties')).toBeInTheDocument();
    const durationInput = screen.getByTestId('composite-step-duration-input');
    expect(durationInput).toHaveValue(1500);

    fireEvent.change(durationInput, { target: { value: '2500' } });
    expect(onUpdateData).toHaveBeenCalledWith(
      'node_composite',
      'steps',
      expect.stringContaining('"durationMs":"2500"')
    );

    // Add step button opens the elaborate ActivityPickerPopover
    const addBtn = screen.getByTestId('composite-add-step-btn');
    fireEvent.click(addBtn);
    expect(screen.getByTestId('activity-picker-popover')).toBeInTheDocument();
    expect(screen.getByTestId('activity-picker-search-input')).toBeInTheDocument();

    const addPromptBtn = screen.getByTestId('activity-picker-item-PromptActivity');
    fireEvent.click(addPromptBtn);

    expect(onUpdateData).toHaveBeenCalledWith(
      'node_composite',
      'steps',
      expect.stringContaining('PromptActivity')
    );
  });

  it('renders CompositeSequenceEditor when inspecting CompositeActivity in Inspector', () => {
    const mockNode: SchemaNode = {
      id: 'node_composite',
      type: 'CompositeActivity',
      name: 'RenewalPipeline',
      x: 100,
      y: 100,
      ports: [],
      context: { reads: [], writes: [] },
      data: {
        isolateContext: 'true',
        completeMessage: 'Success',
        steps: sampleStepsJson,
      },
    };

    render(
      <Inspector
        node={mockNode}
        onUpdateData={vi.fn()}
        onClose={vi.fn()}
        isActive={true}
      />
    );

    expect(screen.getByText('PROPERTIES: Composite Sequence')).toBeInTheDocument();
    expect(screen.getByTestId('composite-isolate-context-checkbox')).toBeInTheDocument();
    expect(screen.getByText('Sequential Steps (3)')).toBeInTheDocument();
  });

  it('supports search-as-you-type and category filtering in ActivityPickerPopover', () => {
    const onUpdateData = vi.fn();

    render(
      <CompositeSequenceEditor
        nodeId="node_composite"
        data={{
          steps: sampleStepsJson,
        }}
        onUpdateData={onUpdateData}
      />
    );

    // Open popover
    fireEvent.click(screen.getByTestId('composite-add-step-btn'));
    const popover = screen.getByTestId('activity-picker-popover');
    expect(popover).toBeInTheDocument();

    const searchInput = screen.getByTestId('activity-picker-search-input');
    expect(searchInput).toHaveFocus();

    // Type to filter
    fireEvent.change(searchInput, { target: { value: 'subtopic' } });
    expect(screen.getByTestId('activity-picker-item-TriggerTopicActivity')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-picker-item-DelayActivity')).not.toBeInTheDocument();

    // Clear search
    const clearBtn = screen.getByTitle('Clear search');
    fireEvent.click(clearBtn);
    expect(searchInput).toHaveValue('');
    expect(screen.getByTestId('activity-picker-item-DelayActivity')).toBeInTheDocument();

    // Filter by Category Chip
    const flowTab = screen.getByTestId('activity-picker-cat-Flow & Pause');
    fireEvent.click(flowTab);
    expect(screen.getByTestId('activity-picker-item-DelayActivity')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-picker-item-TriggerTopicActivity')).not.toBeInTheDocument();

    // Pick activity from filtered list
    fireEvent.click(screen.getByTestId('activity-picker-item-DelayActivity'));
    expect(onUpdateData).toHaveBeenCalledWith(
      'node_composite',
      'steps',
      expect.stringContaining('PauseStep_')
    );
    expect(screen.queryByTestId('activity-picker-popover')).not.toBeInTheDocument();
  });

  it('dismisses ActivityPickerPopover when Escape is pressed', () => {
    render(
      <CompositeSequenceEditor
        nodeId="node_composite"
        data={{ steps: sampleStepsJson }}
        onUpdateData={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('composite-add-step-btn'));
    expect(screen.getByTestId('activity-picker-popover')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('activity-picker-popover')).not.toBeInTheDocument();
  });
});

