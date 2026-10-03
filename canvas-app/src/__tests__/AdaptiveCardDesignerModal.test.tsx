import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AdaptiveCardDesignerModal, deduceCSharpModel, INSURANCE_PRESETS } from '../components/AdaptiveCardDesignerModal';

describe('AdaptiveCardDesignerModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a fresh blank card by default and can add questions from scratch', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <AdaptiveCardDesignerModal
        nodeId="testCardNode"
        nodeTitle="Customer Feedback"
        onSave={onSave}
        onClose={onClose}
      />
    );

    expect(screen.getByTestId('adaptive-card-designer-modal')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Customer Feedback')).toBeInTheDocument();
    expect(screen.getByTestId('empty-card-prompt')).toBeInTheDocument();
    expect(screen.getByText(/Blank Card Canvas/)).toBeInTheDocument();

    // Click "+ Add First Question"
    const addFirstBtn = screen.getByTestId('empty-add-field-btn');
    fireEvent.click(addFirstBtn);

    // Pick Short Text
    const textOption = screen.getByText('Short Text');
    fireEvent.click(textOption);

    expect(screen.getByDisplayValue('Text Question')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-card-prompt')).not.toBeInTheDocument();
  });

  it('can reset to a new blank card via toolbar button', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <AdaptiveCardDesignerModal
        nodeId="testCardNode"
        nodeTitle="Contact Info"
        initialFieldsJson={JSON.stringify(INSURANCE_PRESETS['contact-info'])}
        onSave={onSave}
        onClose={onClose}
      />
    );

    expect(screen.getByDisplayValue('📇 Contact Information')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Full Name')).toBeInTheDocument();

    // Click "✨ New Blank Card" in toolbar
    const newBlankBtn = screen.getByTestId('new-blank-card-btn');
    fireEvent.click(newBlankBtn);

    // Verify reset to blank card
    expect(screen.getByTestId('empty-card-prompt')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Full Name')).not.toBeInTheDocument();
  });

  it('can reset to a new blank card via dropdown menu', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <AdaptiveCardDesignerModal
        nodeId="testCardNode"
        nodeTitle="Contact Info"
        initialFieldsJson={JSON.stringify(INSURANCE_PRESETS['contact-info'])}
        onSave={onSave}
        onClose={onClose}
      />
    );

    const presetsBtn = screen.getByTestId('presets-menu-btn');
    fireEvent.click(presetsBtn);

    const blankMenuOption = screen.getByTestId('preset-blank-btn');
    fireEvent.click(blankMenuOption);

    expect(screen.getByTestId('empty-card-prompt')).toBeInTheDocument();
  });

  it('can switch to coverage intent preset with pill tagselect fields', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <AdaptiveCardDesignerModal
        nodeId="coverageNode"
        nodeTitle="Coverage Intent"
        onSave={onSave}
        onClose={onClose}
      />
    );

    const presetsBtn = screen.getByTestId('presets-menu-btn');
    fireEvent.click(presetsBtn);

    const coveragePresetBtn = screen.getByText('🎯 Coverage Intent');
    fireEvent.click(coveragePresetBtn);

    expect(screen.getByDisplayValue('🎯 Coverage Intent')).toBeInTheDocument();
    expect(screen.getByDisplayValue('What type of coverage are you interested in?')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Term Life')).toBeInTheDocument();
  });

  it('can switch to radio button validation demo preset', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <AdaptiveCardDesignerModal
        nodeId="radioNode"
        nodeTitle="Radio Demo"
        onSave={onSave}
        onClose={onClose}
      />
    );

    const presetsBtn = screen.getByTestId('presets-menu-btn');
    fireEvent.click(presetsBtn);

    const radioPresetBtn = screen.getByText('📻 Radio Button Demo');
    fireEvent.click(radioPresetBtn);

    expect(screen.getByDisplayValue('📻 Radio Button Validation Demo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Do you currently have insurance?')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Yes, I have insurance')).toBeInTheDocument();
  });

  it('can add a checklist field and deduces List<string>? in C# model deduction helper', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <AdaptiveCardDesignerModal
        nodeId="customNode"
        nodeTitle="Custom Card"
        onSave={onSave}
        onClose={onClose}
      />
    );

    const addBtn = screen.getByTestId('add-field-btn');
    fireEvent.click(addBtn);

    const checklistBtn = screen.getByText('Checklist');
    fireEvent.click(checklistBtn);

    expect(screen.getByDisplayValue('Select All That Apply (Checklist)')).toBeInTheDocument();

    // Verify visual code drawer is completely removed from the DOM
    expect(screen.queryByText('⚡ REAL-TIME DEDUCED C# MODEL')).not.toBeInTheDocument();
    expect(screen.queryByText('Hide Code')).not.toBeInTheDocument();

    // Verify background C# model deduction produces List<string>?
    const csharpCode = deduceCSharpModel('customNode', [
      { id: 'field_checklist', type: 'input-checklist', label: 'Choices', required: true },
    ]);
    expect(csharpCode).toContain('public List<string>? FieldChecklist { get; set; }');
  });

  it('supports interactive card preview mode with validation and simulated submission', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <AdaptiveCardDesignerModal
        nodeId="previewNode"
        nodeTitle="Preview Test"
        initialFieldsJson={JSON.stringify(INSURANCE_PRESETS['contact-info'])}
        onSave={onSave}
        onClose={onClose}
      />
    );

    // Switch to Interactive Preview mode
    const previewModeBtn = screen.getByTestId('mode-preview-btn');
    fireEvent.click(previewModeBtn);

    expect(screen.getByText(/Interactive Card Preview/)).toBeInTheDocument();

    // Click Submit in Preview mode
    const submitBtn = screen.getByTestId('preview-submit-btn');
    fireEvent.click(submitBtn);

    // Should show validation error for required fields (e.g. Full Name)
    expect(screen.getByText(/Full Name is required/)).toBeInTheDocument();

    // Fill the Full Name
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'John Doe' } });

    // Switch back to Edit Mode
    const editModeBtn = screen.getByTestId('mode-edit-btn');
    fireEvent.click(editModeBtn);

    expect(screen.getByTestId('add-field-btn')).toBeInTheDocument();
  });

  it('saves the updated JSON when Save is clicked', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <AdaptiveCardDesignerModal
        nodeId="saveNode"
        nodeTitle="Save Test"
        initialFieldsJson={JSON.stringify(INSURANCE_PRESETS['contact-info'])}
        onSave={onSave}
        onClose={onClose}
      />
    );

    const saveBtn = screen.getByTestId('save-card-btn');
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedArg = JSON.parse(onSave.mock.calls[0][0]);
    expect(savedArg.title).toBe('📇 Contact Information');
    expect(Array.isArray(savedArg.fields)).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
