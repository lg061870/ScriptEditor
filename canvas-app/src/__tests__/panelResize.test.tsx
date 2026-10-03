import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { sampleDocument } from '../fixtures/sampleDocument';

describe('Draggable panel resizing', () => {
  beforeEach(() => {
    localStorage.clear();
    useDiagramStore.setState({
      document: sampleDocument,
      versionId: 0,
      codeRegenRequestCount: 0,
      selectedNodeIds: new Set(),
      pendingConnection: null,
    });
  });

  it('renders resize handles for palette and code panel', () => {
    render(<App />);

    const paletteHandle = screen.getByTestId('palette-resize-handle');
    expect(paletteHandle).toBeInTheDocument();
    expect(paletteHandle).toHaveAttribute('role', 'separator');
    expect(paletteHandle).toHaveAttribute('aria-orientation', 'vertical');

    const codePanelHandle = screen.getByTestId('code-panel-resize-handle');
    expect(codePanelHandle).toBeInTheDocument();
    expect(codePanelHandle).toHaveAttribute('role', 'separator');
    expect(codePanelHandle).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('resizes the palette when dragging the palette handle', () => {
    render(<App />);

    const palette = screen.getByTestId('toolbox-panel');
    const handle = screen.getByTestId('palette-resize-handle');

    // Default width is 220px
    expect(palette).toHaveStyle({ width: '220px' });

    // Simulate pointer drag by +50px
    fireEvent.pointerDown(handle, { clientX: 220, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 270, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(palette).toHaveStyle({ width: '270px' });
  });

  it('clamps palette width to minimum limit (160px)', () => {
    render(<App />);

    const palette = screen.getByTestId('toolbox-panel');
    const handle = screen.getByTestId('palette-resize-handle');

    // Drag far to the left (-200px)
    fireEvent.pointerDown(handle, { clientX: 220, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 20, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(palette).toHaveStyle({ width: '160px' });
  });

  it('resizes the code panel when dragging the code panel handle', () => {
    render(<App />);

    const codePanel = screen.getByTestId('mock-code-panel');
    const handle = screen.getByTestId('code-panel-resize-handle');

    // Default height is 200px
    expect(codePanel).toHaveStyle({ height: '200px' });

    // Dragging UP (negative delta) increases height from 200px to 280px
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 600, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 500, clientY: 520, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(codePanel).toHaveStyle({ height: '280px' });
  });

  it('resets to default size on double-click', () => {
    render(<App />);

    const palette = screen.getByTestId('toolbox-panel');
    const handle = screen.getByTestId('palette-resize-handle');

    // Resize away from default
    fireEvent.pointerDown(handle, { clientX: 220, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 300, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(palette).toHaveStyle({ width: '300px' });

    // Double click resets to 220px
    fireEvent.doubleClick(handle);
    expect(palette).toHaveStyle({ width: '220px' });
  });

  it('collapses the palette to the left and expands it back', () => {
    render(<App />);

    const palette = screen.getByTestId('toolbox-panel');
    expect(palette).toHaveStyle({ width: '220px' });
    expect(palette).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('palette-resize-handle')).toBeInTheDocument();

    // Click collapse button
    const collapseBtn = screen.getByTestId('collapse-toolbox-button');
    fireEvent.click(collapseBtn);

    expect(palette).toHaveStyle({ width: '28px' });
    expect(palette).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByTestId('palette-resize-handle')).not.toBeInTheDocument();
    expect(localStorage.getItem('scripteditor:paletteCollapsed')).toBe('true');

    // Click expand button
    const expandBtn = screen.getByTestId('expand-toolbox-button');
    fireEvent.click(expandBtn);

    expect(palette).toHaveStyle({ width: '220px' });
    expect(palette).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('palette-resize-handle')).toBeInTheDocument();
    expect(localStorage.getItem('scripteditor:paletteCollapsed')).toBe('false');
  });

  it('collapses the code panel down and expands it back', () => {
    render(<App />);

    const codePanel = screen.getByTestId('mock-code-panel');
    expect(codePanel).toHaveStyle({ height: '200px' });
    expect(codePanel).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('code-panel-resize-handle')).toBeInTheDocument();

    // Click collapse button
    const collapseBtn = screen.getByTestId('collapse-code-panel-button');
    fireEvent.click(collapseBtn);

    expect(codePanel).toHaveStyle({ height: '28px' });
    expect(codePanel).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByTestId('code-panel-resize-handle')).not.toBeInTheDocument();
    expect(localStorage.getItem('scripteditor:codePanelCollapsed')).toBe('true');

    // Click expand button
    const expandBtn = screen.getByTestId('expand-code-panel-button');
    fireEvent.click(expandBtn);

    expect(codePanel).toHaveStyle({ height: '200px' });
    expect(codePanel).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('code-panel-resize-handle')).toBeInTheDocument();
    expect(localStorage.getItem('scripteditor:codePanelCollapsed')).toBe('false');
  });

  it('supports keyboard shortcuts Ctrl+B to toggle toolbox and Ctrl+J to toggle code panel', () => {
    render(<App />);

    const palette = screen.getByTestId('toolbox-panel');
    const codePanel = screen.getByTestId('mock-code-panel');

    // Ctrl+B collapses palette
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(palette).toHaveAttribute('data-collapsed', 'true');
    expect(palette).toHaveStyle({ width: '28px' });

    // Ctrl+B expands palette
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(palette).toHaveAttribute('data-collapsed', 'false');
    expect(palette).toHaveStyle({ width: '220px' });

    // Ctrl+J collapses code panel
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(codePanel).toHaveAttribute('data-collapsed', 'true');
    expect(codePanel).toHaveStyle({ height: '28px' });

    // Ctrl+J expands code panel
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(codePanel).toHaveAttribute('data-collapsed', 'false');
    expect(codePanel).toHaveStyle({ height: '200px' });
  });
});
