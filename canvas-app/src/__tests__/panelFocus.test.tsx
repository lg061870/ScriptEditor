import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { sampleDocument } from '../fixtures/sampleDocument';

describe('Visual Studio-style active panel focus', () => {
  beforeEach(() => {
    useDiagramStore.setState({
      document: sampleDocument,
      versionId: 0,
      codeRegenRequestCount: 0,
      selectedNodeIds: new Set(),
      pendingConnection: null,
    });
  });

  it('defaults to canvas having active focus on initial load', () => {
    render(<App />);

    const canvas = screen.getByTestId('canvas-surface');
    const toolbox = screen.getByTestId('toolbox-panel');
    const codePanel = screen.getByTestId('mock-code-panel');

    expect(canvas.getAttribute('data-active')).toBe('true');
    expect(toolbox.getAttribute('data-active')).toBe('false');
    expect(codePanel.getAttribute('data-active')).toBe('false');

    const statusBar = screen.getByTestId('ide-status-bar');
    expect(statusBar.textContent).toContain('Pane: canvas');
  });

  it('switches active focus to toolbox when clicked', () => {
    render(<App />);

    const toolbox = screen.getByTestId('toolbox-panel');
    fireEvent.mouseDown(toolbox);

    expect(toolbox.getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('canvas-surface').getAttribute('data-active')).toBe('false');

    const statusBar = screen.getByTestId('ide-status-bar');
    expect(statusBar.textContent).toContain('Pane: toolbox');
  });

  it('switches active focus to code panel when clicked', () => {
    render(<App />);

    const codePanel = screen.getByTestId('mock-code-panel');
    fireEvent.mouseDown(codePanel);

    expect(codePanel.getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('canvas-surface').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('toolbox-panel').getAttribute('data-active')).toBe('false');

    const statusBar = screen.getByTestId('ide-status-bar');
    expect(statusBar.textContent).toContain('Pane: code');
  });

  it('switches active focus back to canvas when clicking on canvas surface', () => {
    render(<App />);

    // First focus code panel
    fireEvent.mouseDown(screen.getByTestId('mock-code-panel'));
    expect(screen.getByTestId('mock-code-panel').getAttribute('data-active')).toBe('true');

    // Then click canvas document header / surface
    const canvas = screen.getByTestId('canvas-surface');
    fireEvent.mouseDown(canvas);

    expect(canvas.getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('mock-code-panel').getAttribute('data-active')).toBe('false');
  });

  it('renders a distinct canvas document header with active topic tab', () => {
    render(<App />);

    const docHeader = screen.getByTestId('canvas-document-header');
    expect(docHeader.textContent).toContain('MainConversation');
    expect(docHeader.textContent).toContain('nodes');
  });
});
