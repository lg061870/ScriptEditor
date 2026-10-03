import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inspector } from '../components/Inspector';
import type { DiagramNode } from '../schema/diagram';

describe('AdaptiveCard Inline Inspector', () => {
  const mockAdaptiveCardNode: DiagramNode = {
    id: 'adaptiveNode1',
    type: 'AdaptiveCardActivity',
    x: 100,
    y: 100,
    ports: [],
    context: { reads: [], writes: [] },
    data: {
      title: 'Client Questionnaire',
      cardFields: JSON.stringify({
        title: 'Policy Intake',
        desc: 'Please fill out all details',
        submitText: 'Submit Application',
        fields: [
          { id: 'client_name', type: 'input-text', label: 'Client Full Name', required: true },
        ],
      }),
      submissionContextKey: 'clientIntakePayload',
      required: 'true',
    },
  };

  it('renders the form editor directly inside the inspector without any modal dialog', () => {
    const onUpdateData = vi.fn();
    const onClose = vi.fn();

    render(
      <Inspector
        width={460}
        node={mockAdaptiveCardNode}
        onUpdateData={onUpdateData}
        onClose={onClose}
        isActive={true}
      />
    );

    // Form editor is rendered inside the inspector panel
    expect(screen.getByTestId('adaptive-card-form-editor')).toBeInTheDocument();
    // No modal backdrop
    expect(screen.queryByTestId('adaptive-card-designer-modal')).not.toBeInTheDocument();

    // Title and fields are rendered directly
    expect(screen.getByDisplayValue('Policy Intake')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Client Full Name')).toBeInTheDocument();

    // Top-right corner Edit / Preview toggle buttons are present
    expect(screen.getByTestId('mode-edit-btn')).toBeInTheDocument();
    expect(screen.getByTestId('mode-preview-btn')).toBeInTheDocument();
  });

  it('auto-saves form edits directly to node.data.cardFields on change', () => {
    const onUpdateData = vi.fn();
    const onClose = vi.fn();

    render(
      <Inspector
        width={460}
        node={mockAdaptiveCardNode}
        onUpdateData={onUpdateData}
        onClose={onClose}
        isActive={true}
      />
    );

    // Click "+ Add Question"
    const addBtn = screen.getByTestId('add-field-btn');
    fireEvent.click(addBtn);

    // Click Phone Number option
    const phoneBtn = screen.getByText('Phone Number');
    fireEvent.click(phoneBtn);

    // onUpdateData should have been called with 'adaptiveNode1', 'cardFields', and JSON containing the new field
    expect(onUpdateData).toHaveBeenCalledWith(
      'adaptiveNode1',
      'cardFields',
      expect.stringContaining('Phone Number')
    );
  });

  it('toggles seamlessly between Edit and Preview mode within the inspector', () => {
    const onUpdateData = vi.fn();
    const onClose = vi.fn();

    render(
      <Inspector
        width={460}
        node={mockAdaptiveCardNode}
        onUpdateData={onUpdateData}
        onClose={onClose}
        isActive={true}
      />
    );

    // Switch to Preview mode
    const previewBtn = screen.getByTestId('mode-preview-btn');
    fireEvent.click(previewBtn);

    expect(screen.getByText(/Interactive Card Preview/)).toBeInTheDocument();
    expect(screen.getByTestId('preview-submit-btn')).toBeInTheDocument();

    // Switch back to Edit mode
    const editBtn = screen.getByTestId('mode-edit-btn');
    fireEvent.click(editBtn);

    expect(screen.getByTestId('add-field-btn')).toBeInTheDocument();
  });

  it('keeps activity properties collapsible below the card form', () => {
    const onUpdateData = vi.fn();
    const onClose = vi.fn();

    render(
      <Inspector
        width={460}
        node={mockAdaptiveCardNode}
        onUpdateData={onUpdateData}
        onClose={onClose}
        isActive={true}
      />
    );

    expect(screen.getByText(/Activity Properties/)).toBeInTheDocument();
  });
});
