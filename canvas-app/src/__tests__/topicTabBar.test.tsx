import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TopicTabBar } from '../components/TopicTabBar';
import { useDiagramStore } from '../store/diagramStore';
import { sampleDocument } from '../fixtures/sampleDocument';

describe('TopicTabBar: Visual Studio-style document tabs', () => {
  beforeEach(() => {
    useDiagramStore.setState({
      topics: [
        {
          id: 'MainConversation',
          name: 'MainConversation',
          isInitial: true,
          isDirty: false,
          document: sampleDocument,
        },
        {
          id: 'QuoteTopic',
          name: 'QuoteTopic',
          isInitial: false,
          isDirty: true,
          document: sampleDocument,
        },
      ],
      activeTopicId: 'MainConversation',
      document: sampleDocument,
      versionId: 0,
      codeRegenRequestCount: 0,
      selectedNodeIds: new Set(),
      pendingConnection: null,
    });
  });

  it('renders all topic tabs and identifies the active and initial topic', () => {
    render(<TopicTabBar nodeCount={2} edgeCount={1} />);

    expect(screen.getByText('MainConversation')).toBeDefined();
    expect(screen.getByText(/QuoteTopic/)).toBeDefined();
    expect(screen.getByText('🏠')).toBeDefined();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(2);
    expect(tabs[0].getAttribute('data-active')).toBe('true');
    expect(tabs[1].getAttribute('data-active')).toBeNull();
  });

  it('switches active topic when clicking an inactive tab', () => {
    render(<TopicTabBar />);

    const quoteTab = screen.getByText(/QuoteTopic/);
    fireEvent.click(quoteTab);

    expect(useDiagramStore.getState().activeTopicId).toBe('QuoteTopic');
  });

  it('adds a new topic when clicking the ＋ button', () => {
    render(<TopicTabBar />);

    const addBtn = screen.getByTitle(/Add new topic/);
    fireEvent.click(addBtn);

    expect(useDiagramStore.getState().topics.length).toBe(3);
  });

  it('closes a topic when clicking its × button', () => {
    render(<TopicTabBar />);

    const closeBtns = screen.getAllByTitle('Close topic');
    expect(closeBtns.length).toBe(2);

    fireEvent.click(closeBtns[1]);
    expect(useDiagramStore.getState().topics.length).toBe(1);
    expect(useDiagramStore.getState().topics[0].id).toBe('MainConversation');
  });
});
