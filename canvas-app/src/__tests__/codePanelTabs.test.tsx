import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Unmock CodePanel so we test the real component
vi.unmock('../components/CodePanel');

import { CodePanel } from '../components/CodePanel';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramDocument } from '../schema/diagram';

describe('CodePanel Multi-Tab Support (C# & JSON Structure)', () => {
  const sampleDoc: DiagramDocument = {
    viewport: { panX: 0, panY: 0, zoom: 1 },
    cards: [],
    models: [],
    nodes: [
      {
        id: 'node1',
        type: 'SetVariableActivity',
        x: 100,
        y: 100,
        ports: [],
        context: { reads: [], writes: ['Global_Example'] },
        data: { variableName: 'Global_Example', value: '"Test"' },
      },
      {
        id: 'node2',
        type: 'SwitchActivity',
        x: 300,
        y: 100,
        ports: [],
        context: { reads: ['Global_Example'], writes: [] },
        data: { valueContextKey: 'Global_Example', caseKeys: 'case-a | case-b' },
      },
    ],
    edges: [
      { id: 'e1', from: { node: 'node1', port: 'node1-out' }, to: { node: 'node2', port: 'node2-in' } },
    ],
  };

  beforeEach(() => {
    useDiagramStore.getState().replaceDocument(sampleDoc, null);
  });

  it('renders both C# source code and JSON structure tabs in the tab well', () => {
    render(<CodePanel document={sampleDoc} isActive={true} />);

    expect(screen.getByTestId('code-panel-tab-csharp')).toBeInTheDocument();
    expect(screen.getByTestId('code-panel-tab-json')).toBeInTheDocument();
    expect(screen.getByText(/MainConversation\.cs/)).toBeInTheDocument();
    expect(screen.getByText(/MainConversation\.json/)).toBeInTheDocument();
  });

  it('switches to the JSON tab and displays the formatted JSON structure', () => {
    render(<CodePanel document={sampleDoc} isActive={true} />);

    const jsonTab = screen.getByTestId('code-panel-tab-json');
    fireEvent.click(jsonTab);

    // Mock Monaco editor receives the formatted JSON value
    const monacoEditor = screen.getByTestId('mock-monaco-editor');
    expect(monacoEditor).toBeInTheDocument();
    const value = monacoEditor.getAttribute('data-value') || '';
    expect(value).toContain('"node1"');
    expect(value).toContain('"SetVariableActivity"');
    expect(value).toContain('"node2"');
    expect(value).toContain('"SwitchActivity"');
  });

  it('switches between C# and JSON tabs seamlessly', () => {
    render(<CodePanel document={sampleDoc} isActive={true} />);

    const csharpTab = screen.getByTestId('code-panel-tab-csharp');
    const jsonTab = screen.getByTestId('code-panel-tab-json');

    // Click JSON tab
    fireEvent.click(jsonTab);
    expect(screen.getByTestId('mock-monaco-editor')).toBeInTheDocument();

    // Click back to C# tab
    fireEvent.click(csharpTab);
    expect(screen.getByTestId('mock-monaco-editor')).toBeInTheDocument();
  });

  it('renders collapsed tab strip when isCollapsed is true and expands on toggle or tab click', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<CodePanel document={sampleDoc} isActive={true} isCollapsed={true} onToggleCollapse={onToggle} />);

    const panel = screen.getByTestId('code-panel');
    expect(panel).toHaveAttribute('data-collapsed', 'true');
    expect(panel).toHaveStyle({ height: '28px' });
    expect(screen.queryByTestId('code-panel-editor')).not.toBeInTheDocument();

    // Clicking expand button calls onToggleCollapse
    const expandBtn = screen.getByTestId('expand-code-panel-button');
    fireEvent.click(expandBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);

    // Clicking a tab while collapsed also triggers expansion
    const jsonTab = screen.getByTestId('code-panel-tab-json');
    fireEvent.click(jsonTab);
    expect(onToggle).toHaveBeenCalledTimes(2);

    // When re-rendered expanded, editor is shown
    rerender(<CodePanel document={sampleDoc} isActive={true} isCollapsed={false} onToggleCollapse={onToggle} />);
    expect(panel).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('code-panel-editor')).toBeInTheDocument();
    expect(screen.getByTestId('collapse-code-panel-button')).toBeInTheDocument();
  });
});
