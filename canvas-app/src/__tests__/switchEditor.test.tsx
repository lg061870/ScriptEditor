import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SwitchEditor } from '../components/SwitchEditor';
import { Inspector } from '../components/Inspector';
import { useDiagramStore } from '../store/diagramStore';
import { ReactFlowProvider } from '@xyflow/react';
import { DiagramNode } from '../components/DiagramNode';
import type { DiagramDocument, DiagramNode as DiagramNodeType, DiagramPort } from '../schema/diagram';

const makePort = (id: string, name: string, direction: 'input' | 'output', position: 'left' | 'right' | 'bottom' = 'right'): DiagramPort => ({
  id,
  name,
  direction,
  role: 'main',
  type: 'flow',
  position,
});

describe('SwitchEditor Component & Inspector Integration', () => {
  const sampleDoc: DiagramDocument = {
    viewport: { panX: 0, panY: 0, zoom: 1 },
    cards: [],
    models: [],
    nodes: [
      {
        id: 'setTier',
        type: 'SetVariableActivity',
        x: 100,
        y: 100,
        ports: [makePort('setTier_out', 'Out', 'output', 'right')],
        context: { reads: [], writes: ['userTier'] },
        data: { variableName: 'userTier', value: '"Gold"' },
      },
      {
        id: 'switch1',
        type: 'SwitchActivity',
        x: 100,
        y: 250,
        ports: [
          makePort('switch1_in', 'In', 'input', 'left'),
          makePort('switch1_caseA', 'case-a', 'output', 'right'),
          makePort('switch1_caseB', 'case-b', 'output', 'right'),
        ],
        context: { reads: [], writes: [] },
        data: {
          valueContextKey: 'userTier',
          caseKeys: 'Gold | Silver | Bronze',
          defaultCase: 'Standard',
          loopAfterCase: 'false',
        },
      },
    ],
    edges: [
      { id: 'e1', from: { node: 'setTier', port: 'setTier_out' }, to: { node: 'switch1', port: 'switch1_in' } },
    ],
  };

  beforeEach(() => {
    useDiagramStore.getState().replaceDocument(sampleDoc, null);
  });

  it('renders SwitchEditor inside Inspector when a SwitchActivity node is selected', () => {
    const onUpdateData = vi.fn();
    const switchNode = sampleDoc.nodes.find((n) => n.id === 'switch1')!;

    render(
      <Inspector
        width={320}
        node={switchNode}
        onUpdateData={onUpdateData}
        onClose={vi.fn()}
        isActive={true}
      />
    );

    expect(screen.getByTestId('switch-editor')).toBeInTheDocument();
    expect(screen.getByText('Switch Logic')).toBeInTheDocument();
  });

  it('shows in-scope variables from upstream nodes (userTier)', () => {
    const switchNode = sampleDoc.nodes.find((n) => n.id === 'switch1')!;

    render(
      <SwitchEditor
        nodeId={switchNode.id}
        data={switchNode.data}
        document={sampleDoc}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('switch-var-chip-userTier')).toBeInTheDocument();
    expect(screen.getByText('1 available')).toBeInTheDocument();
  });

  it('shows helpful hint banner when no upstream variables are in scope', () => {
    const emptyDoc: DiagramDocument = {
      ...sampleDoc,
      edges: [],
    };
    const switchNode = sampleDoc.nodes.find((n) => n.id === 'switch1')!;

    render(
      <SwitchEditor
        nodeId={switchNode.id}
        data={switchNode.data}
        document={emptyDoc}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('switch-no-vars-hint')).toBeInTheDocument();
    expect(screen.getByText(/No upstream variables found/i)).toBeInTheDocument();
  });

  it('allows managing cases (editing, adding, and deleting)', () => {
    const onChange = vi.fn();
    const switchNode = sampleDoc.nodes.find((n) => n.id === 'switch1')!;

    render(
      <SwitchEditor
        nodeId={switchNode.id}
        data={switchNode.data}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    // Initial 3 cases rendered
    expect(screen.getByTestId('switch-case-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('switch-case-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('switch-case-row-2')).toBeInTheDocument();

    // Edit Case 0
    const case0Input = screen.getByTestId('switch-case-input-0');
    fireEvent.change(case0Input, { target: { value: 'Platinum' } });
    expect(onChange).toHaveBeenCalledWith({ caseKeys: 'Platinum | Silver | Bronze' });

    // Add new case
    const addBtn = screen.getByTestId('switch-add-case-btn');
    fireEvent.click(addBtn);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        caseKeys: expect.stringContaining('case-'),
      })
    );

    // Delete case 2
    const delBtn = screen.getByTestId('switch-case-delete-2');
    fireEvent.click(delBtn);
    expect(onChange).toHaveBeenCalledWith({ caseKeys: 'Platinum | Silver | case-d' });
  });

  it('allows adding and removing default fallback port via button and active card', () => {
    const onChange = vi.fn();
    const switchNode = sampleDoc.nodes.find((n) => n.id === 'switch1')!;

    // switchNode initially has defaultCase: 'Standard'
    const { unmount } = render(
      <SwitchEditor
        nodeId={switchNode.id}
        data={switchNode.data}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    // Active default port card is shown
    expect(screen.getByTestId('switch-default-port-card')).toBeInTheDocument();
    expect(screen.getByText('Default Port')).toBeInTheDocument();

    // Click remove default port
    const removeBtn = screen.getByTestId('switch-remove-default-port-btn');
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith({ defaultCase: '' });

    // Loop after case toggle
    const loopCheckbox = screen.getByTestId('switch-loop-checkbox');
    fireEvent.click(loopCheckbox);
    expect(onChange).toHaveBeenCalledWith({ loopAfterCase: 'true' });

    unmount();

    // Now test with no default port initially
    const nodeNoDefault = {
      ...switchNode,
      data: { ...switchNode.data, defaultCase: '' },
    };
    render(
      <SwitchEditor
        nodeId={nodeNoDefault.id}
        data={nodeNoDefault.data}
        document={sampleDoc}
        onChange={onChange}
      />
    );

    // Button to add default port is visible
    const addDefaultBtn = screen.getByTestId('switch-add-default-port-btn');
    expect(addDefaultBtn).toBeInTheDocument();
    fireEvent.click(addDefaultBtn);
    expect(onChange).toHaveBeenCalledWith({ defaultCase: 'Default' });
  });

  it('displays shape label preview and C# evaluation preview', () => {
    const switchNode = sampleDoc.nodes.find((n) => n.id === 'switch1')!;

    render(
      <SwitchEditor
        nodeId={switchNode.id}
        data={switchNode.data}
        document={sampleDoc}
        onChange={vi.fn()}
      />
    );

    const previewLabel = screen.getByTestId('switch-preview-label');
    expect(previewLabel).toBeInTheDocument();
    expect(previewLabel).toHaveTextContent('Switch on userTier: [Gold | Silver | Bronze]');
    expect(screen.getByText(/switch \(context\.Get<string>\("userTier"\)\)/i)).toBeInTheDocument();
  });

  it('does not trigger infinite loop or call onChange when inspecting newly dropped Switch with default SwitchKey', () => {
    const onChange = vi.fn();
    const freshSwitchData = {
      valueContextKey: 'SwitchKey',
      caseKeys: 'case-a | case-b',
      loopAfterCase: 'false',
      defaultCase: '',
    };
    const emptyDoc: DiagramDocument = {
      viewport: { panX: 0, panY: 0, zoom: 1 },
      cards: [],
      models: [],
      nodes: [
        {
          id: 'freshSwitch',
          type: 'SwitchActivity',
          x: 200,
          y: 200,
          ports: [],
          context: { reads: [], writes: [] },
          data: freshSwitchData,
        },
      ],
      edges: [],
    };

    render(
      <SwitchEditor
        nodeId="freshSwitch"
        data={freshSwitchData}
        document={emptyDoc}
        onChange={onChange}
      />
    );

    // Should render smoothly with no infinite loop
    expect(screen.getByTestId('switch-editor')).toBeInTheDocument();
    expect(screen.getByTestId('switch-no-vars-hint')).toBeInTheDocument();
    // onChange must NOT be called repeatedly with SwitchKey
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders Inspector with newly dropped SwitchActivity smoothly with no crash', () => {
    const freshSwitchNode: DiagramNodeType = {
      id: 'freshSwitch',
      type: 'SwitchActivity',
      x: 200,
      y: 200,
      ports: [],
      context: { reads: [], writes: [] },
      data: {
        valueContextKey: 'SwitchKey',
        caseKeys: 'case-a | case-b',
        loopAfterCase: 'false',
        defaultCase: '',
      },
    };

    const docWithFreshSwitch: DiagramDocument = {
      viewport: { panX: 0, panY: 0, zoom: 1 },
      cards: [],
      models: [],
      nodes: [freshSwitchNode],
      edges: [],
    };
    useDiagramStore.getState().replaceDocument(docWithFreshSwitch, null);

    const onUpdateData = vi.fn();

    render(
      <Inspector
        width={320}
        node={freshSwitchNode}
        onUpdateData={onUpdateData}
        onClose={vi.fn()}
        isActive={true}
      />
    );

    expect(screen.getByTestId('switch-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('renders amber Default port and badge on DiagramNode when defaultCase is configured', () => {
    render(
      <ReactFlowProvider>
        <DiagramNode
          id="switch1"
          data={{
            label: 'Switch',
            type: 'SwitchActivity',
            ports: [
              { id: 'switch1-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
              { id: 'switch1-case-a', name: 'case-a', direction: 'output', role: 'main', type: 'flow', position: 'right' },
              { id: 'switch1-case-b', name: 'case-b', direction: 'output', role: 'main', type: 'flow', position: 'right' },
              { id: 'switch1-case-default', name: 'Default', direction: 'output', role: 'main', type: 'flow', position: 'right' },
              { id: 'switch1-exc', name: 'Exception', direction: 'output', role: 'exception', type: 'flow', position: 'bottom' },
            ],
            rawData: {
              valueContextKey: 'userTier',
              caseKeys: 'case-a | case-b',
              defaultCase: 'Default',
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
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
        />
      </ReactFlowProvider>
    );

    const defaultBadge = screen.getByTestId('default-port-badge-switch1-case-default');
    expect(defaultBadge).toBeInTheDocument();
    expect(defaultBadge).toHaveTextContent('Default');
  });
});
