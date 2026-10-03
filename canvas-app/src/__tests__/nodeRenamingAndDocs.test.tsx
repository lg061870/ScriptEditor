import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { DiagramNode } from '../components/DiagramNode';
import { Inspector } from '../components/Inspector';
import { CompositeSequenceEditor } from '../components/CompositeSequenceEditor';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramDocument } from '../schema/diagram';
import { getActivityDoc } from '../registry/activityDocs';

describe('Activity In-Place Renaming and Contextual Reference Guide', () => {
  const testDoc: DiagramDocument = {
    viewport: { panX: 0, panY: 0, zoom: 1 },
    nodes: [
      {
        id: 'comp1',
        type: 'CompositeActivity',
        x: 150,
        y: 120,
        ports: [
          { id: 'comp1-in', name: 'Input', direction: 'input', role: 'main', type: 'flow', position: 'left' },
          { id: 'comp1-out', name: 'Output', direction: 'output', role: 'main', type: 'flow', position: 'right' },
        ],
        context: { reads: [], writes: [] },
        data: {
          steps: JSON.stringify([
            { id: 's1', type: 'SimpleActivity', name: 'Step1_Notice', data: { message: 'Notice' } },
          ]),
        },
      },
    ],
    edges: [],
    cards: [],
    models: [],
  };

  beforeEach(() => {
    useDiagramStore.setState({
      document: JSON.parse(JSON.stringify(testDoc)),
      topics: [
        {
          id: 'MainConversation',
          name: 'MainConversation',
          isInitial: true,
          document: JSON.parse(JSON.stringify(testDoc)),
        },
      ],
      activeTopicId: 'MainConversation',
      selectedNodeIds: new Set(['comp1']),
      versionId: 0,
    });
  });

  it('allows editing the activity name in the Inspector and updates the store', () => {
    const node = useDiagramStore.getState().document.nodes[0];
    const updateDataMock = vi.fn();
    const closeMock = vi.fn();

    render(
      <Inspector
        node={node}
        onUpdateData={updateDataMock}
        onClose={closeMock}
      />
    );

    // Initial inspector shows default title in input and framework badge
    const nameInput = screen.getByTestId('inspector-activity-name-input') as HTMLInputElement;
    expect(screen.getByTestId('inspector-activity-type-badge')).toHaveTextContent('CompositeActivity');
    expect(nameInput.value).toBe('Composite Sequence');

    // Change name to "Process Steps"
    fireEvent.change(nameInput, { target: { value: 'Process Steps' } });
    fireEvent.blur(nameInput);

    // Store was updated with new custom name
    const updatedNode = useDiagramStore.getState().document.nodes.find((n) => n.id === 'comp1');
    expect(updatedNode?.name).toBe('Process Steps');
  });

  it('renders custom name and supports double-click in-place editing on canvas shape', () => {
    const renameMock = vi.fn();

    const nodeData = {
      label: 'Composite Sequence',
      customName: 'Process Steps',
      type: 'CompositeActivity',
      ports: [
        { id: 'comp1-in', name: 'Input', direction: 'input' as const, role: 'main' as const, type: 'flow', position: 'left' as const },
        { id: 'comp1-out', name: 'Output', direction: 'output' as const, role: 'main' as const, type: 'flow', position: 'right' as const },
      ],
      rawData: { steps: '[]' },
      connectedOutputPortIds: [],
      connectedInputPortIds: [],
      onRequestRenameNode: renameMock,
    };

    render(
      <ReactFlowProvider>
        <DiagramNode
          id="comp1"
          data={nodeData}
          selected={false}
          selectable={true}
          deletable={true}
          draggable={true}
          zIndex={1}
          isConnectable={true}
          positionAbsoluteX={100}
          positionAbsoluteY={100}
          dragging={false}
          type="diagramNode"
        />
      </ReactFlowProvider>
    );

    // Renders the custom title on the canvas shape
    const titleSpan = screen.getByTestId('node-title-comp1');
    expect(titleSpan).toHaveTextContent('Process Steps');

    // Double clicking enters edit mode
    fireEvent.doubleClick(titleSpan);

    const inlineInput = screen.getByTestId('inline-node-name-input-comp1') as HTMLInputElement;
    expect(inlineInput).toBeDefined();
    expect(inlineInput.value).toBe('Process Steps');

    // Type a new name and press Enter
    fireEvent.change(inlineInput, { target: { value: 'Legal Disclosures' } });
    fireEvent.keyDown(inlineInput, { key: 'Enter', code: 'Enter' });

    expect(renameMock).toHaveBeenCalledWith('comp1', 'Legal Disclosures');
  });

  it('renders contextual help, reference use case, and graphical explanation in Inspector', () => {
    const node = useDiagramStore.getState().document.nodes[0];
    render(
      <Inspector
        node={node}
        onUpdateData={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Inspector has activity docs section
    expect(screen.getByTestId('inspector-activity-doc-details')).toBeDefined();
    expect(screen.getByText(/Real-World Reference Scenario/i)).toBeDefined();
    expect(screen.getAllByText(/Federal and State/i).length).toBeGreaterThan(0);

    // Graphical explanation is displayed in preformatted ASCII box
    const pre = screen.getByTestId('inspector-graphical-explanation');
    expect(pre.textContent).toContain('Process Steps (CompositeActivity)');
    expect(pre.textContent).toContain('Step1_Notice');
  });

  it('renders the reference use case callout banner in CompositeSequenceEditor', () => {
    const updateDataMock = vi.fn();
    render(
      <CompositeSequenceEditor
        nodeId="comp1"
        data={{ steps: '[]' }}
        onUpdateData={updateDataMock}
      />
    );

    const banner = screen.getByTestId('composite-reference-usecase-banner');
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain('Legal & Compliance Disclosures');
    expect(banner.textContent).toContain('federal and state disclosures');
  });

  it('returns documentation for all high-priority activities from getActivityDoc', () => {
    const compositeDoc = getActivityDoc('CompositeActivity');
    expect(compositeDoc.referenceUseCase).toContain('Federal and State');

    const promptDoc = getActivityDoc('PromptActivity');
    expect(promptDoc.referenceUseCase).toContain('risk');

    const cardDoc = getActivityDoc('AdaptiveCardActivity');
    expect(cardDoc.referenceUseCase).toContain('contact and coverage');

    const fallbackDoc = getActivityDoc('SomeRandomUnknownActivity');
    expect(fallbackDoc.summary).toContain('SomeRandomUnknownActivity');
  });
});
