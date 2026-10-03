import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BotMessageEditor } from '../components/BotMessageEditor';
import { Inspector } from '../components/Inspector';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramDocument } from '../schema/diagram';

describe('BotMessageEditor', () => {
  const sampleDoc: DiagramDocument = {
    viewport: { panX: 0, panY: 0, zoom: 1 },
    cards: [],
    models: [],
    nodes: [
      {
        id: 'set1',
        type: 'SetVariableActivity',
        name: 'InitUser',
        x: 0,
        y: 0,
        ports: [
          { id: 'set1-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }
        ],
        context: { reads: [], writes: ['Global_UserName'] },
        data: { variableName: 'Global_UserName', value: 'Alice' },
      },
      {
        id: 'msg1',
        type: 'SimpleActivity',
        name: 'Greet',
        x: 200,
        y: 0,
        ports: [
          { id: 'msg1-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
          { id: 'msg1-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' }
        ],
        context: { reads: [], writes: [] },
        data: { message: 'Welcome to our service!' },
      }
    ],
    edges: [
      { id: 'e1', from: { node: 'set1', port: 'set1-out' }, to: { node: 'msg1', port: 'msg1-in' } }
    ]
  };

  it('renders available upstream variables in the pill bar', () => {
    const onChange = vi.fn();
    render(
      <BotMessageEditor
        nodeId="msg1"
        data={{ message: 'Hello!' }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    expect(screen.getByText('⚡ Upstream Variables (1)')).toBeInTheDocument();
    expect(screen.getByTestId('insert-var-Global_UserName')).toBeInTheDocument();
    expect(screen.getByText('{Global_UserName}')).toBeInTheDocument();
  });

  it('inserts variable token into textarea when variable pill is clicked', () => {
    const onChange = vi.fn();
    render(
      <BotMessageEditor
        nodeId="msg1"
        data={{ message: 'Hello ' }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    const pill = screen.getByTestId('insert-var-Global_UserName');
    fireEvent.click(pill);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Hello {Global_UserName}',
        compositionMode: 'template',
      })
    );
  });

  it('switches to Variable Only mode and selects variable', () => {
    const onChange = vi.fn();
    render(
      <BotMessageEditor
        nodeId="msg1"
        data={{ message: 'Hello' }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    const directTab = screen.getByTestId('mode-tab-direct');
    fireEvent.click(directTab);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '{Global_UserName}',
        compositionMode: 'direct',
      })
    );
  });

  it('displays live preview with substituted variable value', () => {
    render(
      <BotMessageEditor
        nodeId="msg1"
        data={{ message: 'Hello {Global_UserName}, welcome!' }}
        document={sampleDoc}
        onChange={vi.fn()}
      />
    );

    const preview = screen.getByTestId('bot-message-preview');
    expect(preview).toHaveTextContent('Hello [Alice], welcome!');
  });

  it('is rendered by Inspector for SimpleActivity nodes', () => {
    useDiagramStore.setState({ document: sampleDoc });
    const onUpdateData = vi.fn();
    render(
      <Inspector
        node={sampleDoc.nodes[1]}
        onUpdateData={onUpdateData}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('bot-message-textarea')).toBeInTheDocument();
    expect(screen.getByText('Message Composition')).toBeInTheDocument();
    expect(screen.getByText('⚡ Upstream Variables (1)')).toBeInTheDocument();
  });

  it('detects out-of-scope variables, highlights with squiggly underline, and shows warning banner', () => {
    const onChange = vi.fn();
    render(
      <BotMessageEditor
        nodeId="msg1"
        data={{ message: 'Hello {Global_Example} !' }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    // Warning banner should be displayed
    const warning = screen.getByTestId('out-of-scope-warning');
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent('Variable {Global_Example} is not in scope');

    // Squiggly underline token rendered in the backdrop
    const squigglyToken = screen.getByTestId('out-of-scope-token-Global_Example');
    expect(squigglyToken).toBeInTheDocument();
    expect(squigglyToken).toHaveStyle({ textDecoration: 'underline wavy #ef4444 2px' });

    // Emits hasScopeError: 'true'
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        hasScopeError: 'true'
      })
    );
  });

  it('provides quick action to remove out-of-scope variables', () => {
    const onChange = vi.fn();
    render(
      <BotMessageEditor
        nodeId="msg1"
        data={{ message: 'Hello {Global_Example} !' }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    const removeBtn = screen.getByTestId('remove-out-of-scope-btn');
    expect(removeBtn).toBeInTheDocument();
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Hello !',
        hasScopeError: 'false'
      })
    );
  });

  it('provides quick action to replace out-of-scope variable with an in-scope variable', () => {
    const onChange = vi.fn();
    render(
      <BotMessageEditor
        nodeId="msg1"
        data={{ message: 'Hello {Global_Example} !' }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    const replaceBtn = screen.getByTestId('replace-with-Global_UserName');
    expect(replaceBtn).toBeInTheDocument();
    fireEvent.click(replaceBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Hello {Global_UserName} !',
        hasScopeError: 'false'
      })
    );
  });

  it('flags out-of-scope variable in direct Variable Only mode and allows fixing it', () => {
    const onChange = vi.fn();
    render(
      <BotMessageEditor
        nodeId="msg1"
        data={{ message: '{Global_Example}', compositionMode: 'direct' }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    expect(screen.getByTestId('direct-var-out-of-scope-warning')).toBeInTheDocument();
    const fixBtn = screen.getByTestId('fix-direct-var-btn');
    fireEvent.click(fixBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '{Global_UserName}',
        hasScopeError: 'false'
      })
    );
  });
});
