import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TopicTabBar } from '../components/TopicTabBar';
import { ChatPreviewPanel } from '../components/ChatPreviewPanel';
import { useDiagramStore } from '../store/diagramStore';
import { sampleDocument } from '../fixtures/sampleDocument';

// Mock transcription client
vi.mock('../api/transcriptionClient', () => ({
  API_BASE_URL: 'http://localhost:5093',
  jsonToCSharp: vi.fn().mockResolvedValue('// Generated C# code'),
  csharpToJson: vi.fn().mockResolvedValue({
    version: '2.0',
    metadata: { title: 'Mock' },
    nodes: [],
    edges: [],
  }),
  compileAndRun: vi.fn().mockResolvedValue({
    success: true,
    diagnostics: [],
    generatedTypeName: 'ScriptEditor.Generated.MainConversation',
    generatedCSharp: '// Generated C# code',
  }),
}));

describe('Multi-Topic Visual Studio IDE Integration', () => {
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
          isDirty: false,
          document: {
            ...sampleDocument,
            nodes: [
              {
                id: 'q1',
                type: 'SimpleActivity',
                x: 0,
                y: 0,
                data: { message: 'Quote message' },
                ports: [],
                context: { reads: [], writes: [] },
              },
            ],
          },
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

  it('renders topic tabs and switches active topic in store', () => {
    render(<TopicTabBar nodeCount={2} edgeCount={1} />);

    // Initial state: MainConversation is active
    expect(screen.getByText('MainConversation')).toBeDefined();
    expect(screen.getByText('QuoteTopic')).toBeDefined();
    expect(screen.getByText('🏠')).toBeDefined();

    // Switch to QuoteTopic
    const quoteTab = screen.getByText('QuoteTopic');
    act(() => {
      fireEvent.click(quoteTab);
    });

    expect(useDiagramStore.getState().activeTopicId).toBe('QuoteTopic');
  });

  it('renders chat preview with execution scope selector for full flow and isolated topic', () => {
    render(<ChatPreviewPanel document={sampleDocument} onClose={() => {}} />);

    const scopeSelect = screen.getByLabelText('Execution Scope') as HTMLSelectElement;
    expect(scopeSelect).toBeDefined();
    expect(scopeSelect.value).toBe('full');

    // Should offer both full flow and current topic options
    expect(screen.getByText(/Full Flow \(MainConversation\)/)).toBeDefined();
    expect(screen.getByText(/Topic \(MainConversation\)/)).toBeDefined();

    // Switch scope to isolated topic
    act(() => {
      fireEvent.change(scopeSelect, { target: { value: 'current' } });
    });
    expect(scopeSelect.value).toBe('current');
  });

  it('displays a spinning compilation loader while compiling', () => {
    render(<ChatPreviewPanel document={sampleDocument} onClose={() => {}} />);

    // Shows the compiling loader while Roslyn compiles
    expect(screen.getByTestId('chat-compiling-loader')).toBeDefined();
    expect(screen.getByText('Compiling Workflow…')).toBeDefined();
    expect(screen.getByText(/Roslyn is compiling topic classes/)).toBeDefined();
  });
});
