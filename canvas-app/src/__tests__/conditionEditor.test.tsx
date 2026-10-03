import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConditionEditor } from '../components/ConditionEditor';
import { Inspector } from '../components/Inspector';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramDocument, DiagramPort } from '../schema/diagram';

const makePort = (id: string, name: string, direction: 'input' | 'output', position: 'left' | 'right' | 'bottom' = 'right'): DiagramPort => ({
  id,
  name,
  direction,
  role: 'main',
  type: 'flow',
  position,
});

describe('ConditionEditor & Flow-Dependent Scope Inspector Integration', () => {
  const sampleDoc: DiagramDocument = {
    viewport: { panX: 0, panY: 0, zoom: 1 },
    cards: [],
    models: [],
    nodes: [
      {
        id: 'setVar1',
        type: 'SetVariableActivity',
        x: 100,
        y: 100,
        ports: [makePort('setVar1_out', 'Out', 'output', 'right')],
        context: { reads: [], writes: ['var1'] },
        data: { variableName: 'var1', variableType: 'int', initialValue: '10' },
      },
      {
        id: 'if1',
        type: 'ConditionalActivity',
        x: 100,
        y: 250,
        ports: [
          makePort('if1_in', 'In', 'input', 'left'),
          makePort('if1_yes', 'Yes', 'output', 'right'),
          makePort('if1_no', 'No', 'output', 'bottom'),
        ],
        context: { reads: [], writes: [] },
        data: { selectorKey: 'var1 == 10', cases: 'Yes | No', leftOperand: 'var1', operator: '==', rightOperand: '10' },
      },
      {
        id: 'setVar2',
        type: 'SetVariableActivity',
        x: 100,
        y: 400,
        ports: [
          makePort('setVar2_in', 'In', 'input', 'left'),
          makePort('setVar2_out', 'Out', 'output', 'right'),
        ],
        context: { reads: [], writes: ['var2'] },
        data: { variableName: 'var2', variableType: 'string', initialValue: '"approved"' },
      },
      {
        id: 'if2',
        type: 'ConditionalActivity',
        x: 100,
        y: 550,
        ports: [
          makePort('if2_in', 'In', 'input', 'left'),
          makePort('if2_yes', 'Yes', 'output', 'right'),
          makePort('if2_no', 'No', 'output', 'bottom'),
        ],
        context: { reads: [], writes: [] },
        data: { selectorKey: 'ConditionKey', cases: 'Yes | No' },
      },
    ],
    edges: [
      { id: 'e1', from: { node: 'setVar1', port: 'setVar1_out' }, to: { node: 'if1', port: 'if1_in' } },
      { id: 'e2', from: { node: 'if1', port: 'if1_yes' }, to: { node: 'setVar2', port: 'setVar2_in' } },
      { id: 'e3', from: { node: 'setVar2', port: 'setVar2_out' }, to: { node: 'if2', port: 'if2_in' } },
    ],
  };

  beforeEach(() => {
    useDiagramStore.getState().replaceDocument(sampleDoc, null);
  });

  it('renders ConditionEditor inside Inspector when a ConditionalActivity node is selected', () => {
    const onUpdateData = vi.fn();
    const onClose = vi.fn();
    const ifNode = sampleDoc.nodes.find((n) => n.id === 'if1')!;

    render(
      <Inspector
        width={320}
        node={ifNode}
        onUpdateData={onUpdateData}
        onClose={onClose}
        isActive={true}
      />
    );

    // Inspector should render ConditionEditor container
    expect(screen.getByTestId('condition-editor')).toBeInTheDocument();
    expect(screen.getByText('Condition Logic')).toBeInTheDocument();
  });

  it('shows only upstream flow-dependent variables for If1 (var1 present, var2 absent)', () => {
    const onUpdateData = vi.fn();
    const if1Node = sampleDoc.nodes.find((n) => n.id === 'if1')!;

    render(
      <Inspector
        width={320}
        node={if1Node}
        onUpdateData={onUpdateData}
        onClose={vi.fn()}
        isActive={true}
      />
    );

    // var1 is upstream of If1 -> visible
    expect(screen.getByTestId('variable-chip-var1')).toBeInTheDocument();
    // var2 is downstream of If1 -> must NOT be visible
    expect(screen.queryByTestId('variable-chip-var2')).toBeNull();
  });

  it('shows both upstream variables for If2 (var1 and var2 present)', () => {
    const onUpdateData = vi.fn();
    const if2Node = sampleDoc.nodes.find((n) => n.id === 'if2')!;

    render(
      <Inspector
        width={320}
        node={if2Node}
        onUpdateData={onUpdateData}
        onClose={vi.fn()}
        isActive={true}
      />
    );

    // Both var1 and var2 are upstream of If2
    expect(screen.getByTestId('variable-chip-var1')).toBeInTheDocument();
    expect(screen.getByTestId('variable-chip-var2')).toBeInTheDocument();
  });

  it('omits var1 from If2 when the upstream link between If1 and SetVar2 is removed', () => {
    // Remove edge e2
    const docDisconnected: DiagramDocument = {
      ...sampleDoc,
      edges: sampleDoc.edges.filter((e) => e.id !== 'e2'),
    };
    useDiagramStore.getState().replaceDocument(docDisconnected, null);

    const onUpdateData = vi.fn();
    const if2Node = sampleDoc.nodes.find((n) => n.id === 'if2')!;

    render(
      <Inspector
        width={320}
        node={if2Node}
        onUpdateData={onUpdateData}
        onClose={vi.fn()}
        isActive={true}
      />
    );

    // var2 is immediately upstream of If2 -> visible
    expect(screen.getByTestId('variable-chip-var2')).toBeInTheDocument();
    // var1 is now disconnected -> must NOT be visible
    expect(screen.queryByTestId('variable-chip-var1')).toBeNull();
  });

  it('updates condition and calls onChange / onUpdateData in Simple Builder mode', () => {
    const onChange = vi.fn();
    const if1Node = sampleDoc.nodes.find((n) => n.id === 'if1')!;

    render(
      <ConditionEditor
        nodeId={if1Node.id}
        data={if1Node.data}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    // Change operator to '>'
    const opSelect = screen.getByTestId('condition-operator-select');
    fireEvent.change(opSelect, { target: { value: '>' } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        operator: '>',
        expression: 'var1 > 10',
        selectorKey: 'var1 > 10',
      })
    );

    // Change right operand to '50'
    const rightInput = screen.getByTestId('condition-right-val-input');
    fireEvent.change(rightInput, { target: { value: '50' } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        rightOperand: '50',
        expression: 'var1 > 50',
        selectorKey: 'var1 > 50',
      })
    );
  });

  it('supports switching to Expression mode and displays C# expression editor', () => {
    const onChange = vi.fn();
    const if1Node = sampleDoc.nodes.find((n) => n.id === 'if1')!;

    render(
      <ConditionEditor
        nodeId={if1Node.id}
        data={if1Node.data}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    // Switch to Expression mode
    const exprModeBtn = screen.getByTestId('mode-expression-btn');
    fireEvent.click(exprModeBtn);

    const textarea = screen.getByTestId('condition-expression-textarea');
    expect(textarea).toBeInTheDocument();

    // Type a custom C# expression
    fireEvent.change(textarea, { target: { value: 'var1 >= 100 && var1 < 500' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionMode: 'expression',
        expression: 'var1 >= 100 && var1 < 500',
        selectorKey: 'var1 >= 100 && var1 < 500',
      })
    );
  });

  it('warns in Expression mode when referencing an out-of-scope variable', () => {
    const onChange = vi.fn();
    const if1Node = sampleDoc.nodes.find((n) => n.id === 'if1')!;

    render(
      <ConditionEditor
        nodeId={if1Node.id}
        data={{
          conditionMode: 'expression',
          expression: 'unknownVar == 42',
        }}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    // Should display out-of-scope warning
    const warning = screen.getByTestId('out-of-scope-warning');
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent(/Not in upstream scope/i);
    expect(warning).toHaveTextContent('unknownVar');
  });
});
