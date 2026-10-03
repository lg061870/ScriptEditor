import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SetVariableEditor } from '../components/SetVariableEditor';
import { Inspector } from '../components/Inspector';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramDocument } from '../schema/diagram';

describe('SetVariableEditor', () => {
  const sampleDoc: DiagramDocument = {
    viewport: { panX: 0, panY: 0, zoom: 1 },
    cards: [],
    models: [],
    nodes: [
      {
        id: 'node-prompt',
        type: 'PromptActivity',
        name: 'AskUserName',
        x: 0,
        y: 0,
        ports: [
          { id: 'p-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }
        ],
        context: { reads: [], writes: ['UserName'] },
        data: { resultVariable: 'UserName', message: 'What is your name?' },
      },
      {
        id: 'node-set1',
        type: 'SetVariableActivity',
        name: 'SetGreeting',
        x: 200,
        y: 0,
        ports: [
          { id: 's-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
          { id: 's-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }
        ],
        context: { reads: ['UserName'], writes: ['Global_Greeting'] },
        data: {
          variableName: 'Global_Greeting',
          value: 'Hello {UserName}',
          isGlobal: 'true',
          validateNaming: 'true',
        },
      }
    ],
    edges: [
      { id: 'e1', from: { node: 'node-prompt', port: 'p-out' }, to: { node: 'node-set1', port: 's-in' } }
    ]
  };

  it('renders variable name, upstream variables bar, value textarea, mode switcher, and checkboxes', () => {
    const onChange = vi.fn();
    render(
      <SetVariableEditor
        nodeId="node-set1"
        data={{
          variableName: 'Global_Greeting',
          value: 'Hello {UserName}',
          isGlobal: 'true',
          validateNaming: 'true',
        }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    expect(screen.getByTestId('set-variable-name-input')).toHaveValue('Global_Greeting');
    expect(screen.getByText('⚡ Upstream Variables (1)')).toBeInTheDocument();
    expect(screen.getByTestId('insert-var-UserName')).toBeInTheDocument();
    expect(screen.getByTestId('set-variable-value-textarea')).toHaveValue('Hello {UserName}');
    expect(screen.getByTestId('mode-tab-template')).toBeInTheDocument();
    expect(screen.getByTestId('mode-tab-direct')).toBeInTheDocument();
    expect(screen.getByTestId('set-variable-is-global-checkbox')).toBeChecked();
    expect(screen.getByTestId('set-variable-validate-naming-checkbox')).toBeChecked();
  });

  it('inserts variable token into value textarea when upstream variable chip is clicked', () => {
    const onChange = vi.fn();
    render(
      <SetVariableEditor
        nodeId="node-set1"
        data={{
          variableName: 'Global_Greeting',
          value: 'Welcome ',
          isGlobal: 'true',
          validateNaming: 'true',
        }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    const chip = screen.getByTestId('insert-var-UserName');
    fireEvent.click(chip);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 'Welcome {UserName}',
        compositionMode: 'template',
      })
    );
  });

  it('switches to Variable Only mode and selects variable', () => {
    const onChange = vi.fn();
    render(
      <SetVariableEditor
        nodeId="node-set1"
        data={{
          variableName: 'Global_Greeting',
          value: 'Static text',
          isGlobal: 'true',
          validateNaming: 'true',
        }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    const directTab = screen.getByTestId('mode-tab-direct');
    fireEvent.click(directTab);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        value: '{UserName}',
        compositionMode: 'direct',
      })
    );
  });

  it('displays live simulation preview with resolved sample token value', () => {
    render(
      <SetVariableEditor
        nodeId="node-set1"
        data={{
          variableName: 'Global_Greeting',
          value: 'Welcome {UserName} to our service!',
          isGlobal: 'true',
          validateNaming: 'true',
        }}
        document={sampleDoc}
        onChange={vi.fn()}
      />
    );

    const preview = screen.getByTestId('set-variable-preview');
    expect(preview).toHaveTextContent('Welcome [Alice Smith] to our service!');
  });

  it('detects out-of-scope variables, renders squiggly underline in backdrop, and shows warning alert', () => {
    const onChange = vi.fn();
    render(
      <SetVariableEditor
        nodeId="node-set1"
        data={{
          variableName: 'Global_Greeting',
          value: 'Hello {UnknownVar} !',
          isGlobal: 'true',
          validateNaming: 'true',
        }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    const warning = screen.getByTestId('out-of-scope-warning');
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent('Variable {UnknownVar} is not in scope');

    const squigglyToken = screen.getByTestId('out-of-scope-token-UnknownVar');
    expect(squigglyToken).toBeInTheDocument();
    expect(squigglyToken).toHaveStyle({ textDecoration: 'underline wavy #ef4444 2px' });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        hasScopeError: 'true',
      })
    );
  });

  it('provides quick action to remove out-of-scope variable', () => {
    const onChange = vi.fn();
    render(
      <SetVariableEditor
        nodeId="node-set1"
        data={{
          variableName: 'Global_Greeting',
          value: 'Hello {UnknownVar} !',
          isGlobal: 'true',
          validateNaming: 'true',
        }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    const removeBtn = screen.getByTestId('remove-out-of-scope-btn');
    expect(removeBtn).toBeInTheDocument();
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 'Hello !',
        hasScopeError: 'false',
      })
    );
  });

  it('provides quick action to replace out-of-scope variable with an in-scope variable', () => {
    const onChange = vi.fn();
    render(
      <SetVariableEditor
        nodeId="node-set1"
        data={{
          variableName: 'Global_Greeting',
          value: 'Hello {UnknownVar} !',
          isGlobal: 'true',
          validateNaming: 'true',
        }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    const replaceBtn = screen.getByTestId('replace-with-UserName');
    expect(replaceBtn).toBeInTheDocument();
    fireEvent.click(replaceBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 'Hello {UserName} !',
        hasScopeError: 'false',
      })
    );
  });

  it('flags out-of-scope variable in direct mode and allows switching to in-scope variable', () => {
    const onChange = vi.fn();
    render(
      <SetVariableEditor
        nodeId="node-set1"
        data={{
          variableName: 'Global_Greeting',
          value: '{NonExistentVar}',
          compositionMode: 'direct',
        }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    expect(screen.getByTestId('direct-var-out-of-scope-warning')).toBeInTheDocument();
    const fixBtn = screen.getByTestId('fix-direct-var-btn');
    fireEvent.click(fixBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        value: '{UserName}',
        hasScopeError: 'false',
      })
    );
  });

  it('shows naming convention warning when global variable does not start with Global_', () => {
    const onChange = vi.fn();
    render(
      <SetVariableEditor
        nodeId="node-set1"
        data={{
          variableName: 'InvalidName',
          value: '42',
          isGlobal: 'true',
          validateNaming: 'true',
        }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    expect(screen.getByTestId('naming-convention-warning')).toBeInTheDocument();
    expect(screen.getByText(/Global variables should start with/)).toBeInTheDocument();
  });

  it('toggles isGlobal and validateNaming checkboxes', () => {
    const onChange = vi.fn();
    render(
      <SetVariableEditor
        nodeId="node-set1"
        data={{
          variableName: 'Global_Greeting',
          value: '42',
          isGlobal: 'true',
          validateNaming: 'true',
        }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    const isGlobalCheckbox = screen.getByTestId('set-variable-is-global-checkbox');
    fireEvent.click(isGlobalCheckbox);
    expect(onChange).toHaveBeenCalledWith({ isGlobal: 'false' });

    const validateNamingCheckbox = screen.getByTestId('set-variable-validate-naming-checkbox');
    fireEvent.click(validateNamingCheckbox);
    expect(onChange).toHaveBeenCalledWith({ validateNaming: 'false' });
  });

  it('is rendered by Inspector for SetVariableActivity nodes', () => {
    useDiagramStore.setState({ document: sampleDoc });
    const onUpdateData = vi.fn();
    render(
      <Inspector
        node={sampleDoc.nodes[1]}
        onUpdateData={onUpdateData}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('set-variable-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('set-variable-value-textarea')).toBeInTheDocument();
    expect(screen.getByText('Value Composition')).toBeInTheDocument();
    expect(screen.getByText('⚡ Upstream Variables (1)')).toBeInTheDocument();
    expect(screen.getByTestId('set-variable-is-global-checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('set-variable-validate-naming-checkbox')).toBeInTheDocument();
  });
});
