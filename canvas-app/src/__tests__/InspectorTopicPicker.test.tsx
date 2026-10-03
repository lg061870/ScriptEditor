import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inspector } from '../components/Inspector';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramNode } from '../schema/diagram';

describe('Inspector Topic Picker (Call Subtopic / TriggerTopicActivity)', () => {
  const mockTriggerNode: DiagramNode = {
    id: 'triggerNode1',
    type: 'TriggerTopicActivity',
    x: 100,
    y: 100,
    ports: [],
    context: { reads: [], writes: [] },
    data: {
      topicToTrigger: 'QuoteGenerationTopic',
      waitForCompletion: 'true',
    },
  };

  beforeEach(() => {
    // Reset store to a clean state with two topics
    useDiagramStore.setState({
      topics: [
        {
          id: 'MainConversation',
          name: 'Main Conversation',
          isInitial: true,
          document: { viewport: { panX: 0, panY: 0, zoom: 1 }, nodes: [], edges: [], cards: [], models: [] },
        },
        {
          id: 'QuoteGenerationTopic',
          name: 'Quote Generation',
          isInitial: false,
          document: { viewport: { panX: 0, panY: 0, zoom: 1 }, nodes: [], edges: [], cards: [], models: [] },
        },
      ],
      activeTopicId: 'MainConversation',
    });
  });

  it('renders a topic dropdown listing all available topics in the workspace', () => {
    const onUpdateData = vi.fn();
    const onClose = vi.fn();

    render(
      <Inspector
        node={mockTriggerNode}
        onUpdateData={onUpdateData}
        onClose={onClose}
        isActive={true}
      />
    );

    // Dropdown exists
    const select = screen.getByTestId('topic-to-trigger-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('QuoteGenerationTopic');

    // Both topics are listed
    expect(screen.getByText(/Main Conversation/)).toBeInTheDocument();
    expect(screen.getByText(/Quote Generation/)).toBeInTheDocument();
  });

  it('updates topicToTrigger when a topic is selected from the dropdown', () => {
    const onUpdateData = vi.fn();
    const onClose = vi.fn();

    render(
      <Inspector
        node={mockTriggerNode}
        onUpdateData={onUpdateData}
        onClose={onClose}
        isActive={true}
      />
    );

    const select = screen.getByTestId('topic-to-trigger-select');
    fireEvent.change(select, { target: { value: 'MainConversation' } });

    expect(onUpdateData).toHaveBeenCalledWith('triggerNode1', 'topicToTrigger', 'MainConversation');
  });

  it('displays an infinite loop warning when the node references the currently active topic', () => {
    const onUpdateData = vi.fn();
    const onClose = vi.fn();

    // Node that triggers MainConversation while activeTopicId is MainConversation
    const recursiveNode: DiagramNode = {
      ...mockTriggerNode,
      data: {
        ...mockTriggerNode.data,
        topicToTrigger: 'MainConversation',
      },
    };

    render(
      <Inspector
        node={recursiveNode}
        onUpdateData={onUpdateData}
        onClose={onClose}
        isActive={true}
      />
    );

    // Recursive warning appears
    expect(screen.getByTestId('recursive-topic-warning')).toBeInTheDocument();
    expect(screen.getByText(/Calling the current topic may create an infinite loop/)).toBeInTheDocument();
  });

  it('allows switching to custom topic name input', () => {
    const onUpdateData = vi.fn();
    const onClose = vi.fn();

    render(
      <Inspector
        node={mockTriggerNode}
        onUpdateData={onUpdateData}
        onClose={onClose}
        isActive={true}
      />
    );

    const select = screen.getByTestId('topic-to-trigger-select');
    fireEvent.change(select, { target: { value: '__custom__' } });

    // Custom input appears
    const customInput = screen.getByTestId('topic-to-trigger-custom-input');
    expect(customInput).toBeInTheDocument();

    fireEvent.change(customInput, { target: { value: 'SpecialPaymentTopic' } });
    expect(onUpdateData).toHaveBeenCalledWith('triggerNode1', 'topicToTrigger', 'SpecialPaymentTopic');

    // Switch back to list
    const switchBackBtn = screen.getByTestId('switch-to-dropdown-btn');
    fireEvent.click(switchBackBtn);
    expect(screen.getByTestId('topic-to-trigger-select')).toBeInTheDocument();
  });

  it('creates a new topic and selects it when clicking "+ New"', () => {
    const onUpdateData = vi.fn();
    const onClose = vi.fn();

    render(
      <Inspector
        node={mockTriggerNode}
        onUpdateData={onUpdateData}
        onClose={onClose}
        isActive={true}
      />
    );

    const addBtn = screen.getByTestId('add-topic-from-inspector-btn');
    fireEvent.click(addBtn);

    // Should create Topic_3 in store and call onUpdateData with it
    expect(useDiagramStore.getState().topics.length).toBe(3);
    const newTopicId = useDiagramStore.getState().topics[2].id;
    expect(onUpdateData).toHaveBeenCalledWith('triggerNode1', 'topicToTrigger', newTopicId);
  });
});
