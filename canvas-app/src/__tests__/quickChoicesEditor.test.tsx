import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QuickChoicesEditor } from '../components/QuickChoicesEditor';

describe('QuickChoicesEditor', () => {
  it('renders with static choices mode and displays choice chips', () => {
    const handleUpdate = vi.fn();
    const data = {
      question: 'Which car do you drive?',
      optionsMode: 'static',
      answers: 'Sedan | SUV | Truck',
      outputVariable: 'carType',
      required: 'true',
    };

    render(
      <QuickChoicesEditor
        nodeId="node_1"
        data={data}
        onUpdateData={handleUpdate}
      />
    );

    expect(screen.getByTestId('quick-choices-editor')).toBeInTheDocument();
    expect(screen.getByTestId('qc-question-input')).toHaveValue('Which car do you drive?');
    expect(screen.getByTestId('qc-chip-0')).toHaveTextContent('Sedan');
    expect(screen.getByTestId('qc-chip-1')).toHaveTextContent('SUV');
    expect(screen.getByTestId('qc-chip-2')).toHaveTextContent('Truck');
    expect(screen.getByTestId('qc-output-variable-input')).toHaveValue('carType');
    expect(screen.getByTestId('qc-required-checkbox')).toBeChecked();
  });

  it('adds and removes static choice chips', () => {
    const handleUpdate = vi.fn();
    const data = {
      question: 'Select an option:',
      optionsMode: 'static',
      answers: 'Alpha | Beta',
      required: 'true',
    };

    render(
      <QuickChoicesEditor
        nodeId="node_1"
        data={data}
        onUpdateData={handleUpdate}
      />
    );

    // Add new chip
    const input = screen.getByTestId('qc-new-chip-input');
    fireEvent.change(input, { target: { value: 'Gamma' } });
    fireEvent.click(screen.getByTestId('qc-add-chip-btn'));

    expect(handleUpdate).toHaveBeenCalledWith('node_1', 'answers', 'Alpha | Beta | Gamma');

    // Remove first chip
    fireEvent.click(screen.getByTestId('qc-chip-remove-0'));
    expect(handleUpdate).toHaveBeenCalledWith('node_1', 'answers', 'Beta');
  });

  it('switches to context variable mode and updates answersVariable', () => {
    const handleUpdate = vi.fn();
    const data = {
      question: 'Which policy?',
      optionsMode: 'static',
      answers: 'Basic | Premium',
      required: 'true',
    };

    render(
      <QuickChoicesEditor
        nodeId="node_2"
        data={data}
        onUpdateData={handleUpdate}
      />
    );

    // Click variable mode button
    fireEvent.click(screen.getByTestId('qc-mode-variable-btn'));
    expect(handleUpdate).toHaveBeenCalledWith('node_2', 'optionsMode', 'variable');
  });

  it('renders variable mode input and updates variable and output names', () => {
    const handleUpdate = vi.fn();
    const data = {
      question: 'Choose your vehicle:',
      optionsMode: 'variable',
      answersVariable: 'userVehicles',
      outputVariable: 'selectedVehicle',
      required: 'false',
    };

    render(
      <QuickChoicesEditor
        nodeId="node_3"
        data={data}
        onUpdateData={handleUpdate}
      />
    );

    const varInput = screen.getByTestId('qc-answers-variable-input');
    expect(varInput).toHaveValue('userVehicles');

    fireEvent.change(varInput, { target: { value: 'activeCars' } });
    expect(handleUpdate).toHaveBeenCalledWith('node_3', 'answersVariable', 'activeCars');

    const outInput = screen.getByTestId('qc-output-variable-input');
    fireEvent.change(outInput, { target: { value: 'pickedCar' } });
    expect(handleUpdate).toHaveBeenCalledWith('node_3', 'outputVariable', 'pickedCar');
  });
});
