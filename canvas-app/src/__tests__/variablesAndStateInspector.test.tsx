import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inspector } from '../components/Inspector';
import { createDiagramNode } from '../actions/createNode';
import { getNodeProducedVariables } from '../analysis/scopeAnalysis';

describe('Variables & State Inspector & Scope Integration', () => {
  it('renders SetVariableEditor for SetVariableActivity', () => {
    const node = createDiagramNode('SetVariableActivity', { x: 100, y: 100 });
    const updateSpy = () => {};

    const { container } = render(
      <Inspector node={node} onUpdateData={updateSpy} onClose={() => {}} />
    );

    expect(screen.getByText('Variable Name')).toBeDefined();
    expect(screen.getByText(/Value Composition/i)).toBeDefined();
    expect(container.querySelector('input[value="Global_Example"]')).toBeDefined();
  });

  it('renders GlobalVariableEditor for GlobalVariableActivity with All and Specific modes', () => {
    const node = createDiagramNode('GlobalVariableActivity', { x: 100, y: 100 });
    const updates: Record<string, string> = {};
    const onUpdateData = (_id: string, key: string, val: string) => {
      updates[key] = val;
    };

    render(
      <Inspector node={node} onUpdateData={onUpdateData} onClose={() => {}} />
    );

    expect(screen.getByText('Promotion Scope')).toBeDefined();
    expect(screen.getByText(/All Variables/i)).toBeDefined();
    const specificBtn = screen.getByText(/Specific Variable/i);
    expect(specificBtn).toBeDefined();

    // Click Specific Variable mode
    fireEvent.click(specificBtn);
    expect(updates.promotionMode).toBe('specific');
  });

  it('renders dedicated controls for DumpCtxActivity', () => {
    const node = createDiagramNode('DumpCtxActivity', { x: 100, y: 100 });
    const updates: Record<string, string> = {};
    const onUpdateData = (_id: string, key: string, val: string) => {
      updates[key] = val;
    };

    render(
      <Inspector node={node} onUpdateData={onUpdateData} onClose={() => {}} />
    );

    expect(screen.getByText(/Context Diagnostics/i)).toBeDefined();
    expect(screen.getByText('Development Mode')).toBeDefined();

    const checkbox = screen.getByRole('checkbox');
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    fireEvent.click(checkbox);
    expect(updates.developmentMode).toBe('false');
  });

  it('renders dedicated controls for ResetActivity', () => {
    const node = createDiagramNode('ResetActivity', { x: 100, y: 100 });
    const updates: Record<string, string> = {};
    const onUpdateData = (_id: string, key: string, val: string) => {
      updates[key] = val;
    };

    render(
      <Inspector node={node} onUpdateData={onUpdateData} onClose={() => {}} />
    );

    expect(screen.getByText(/Reset Conversation/i)).toBeDefined();
    expect(screen.getByText('Reset Message')).toBeDefined();

    const textarea = screen.getByPlaceholderText('e.g. Session reset completed');
    fireEvent.change(textarea, { target: { value: 'Restarting system...' } });
    expect(updates.resetMessage).toBe('Restarting system...');
  });

  it('registers promoted global variable in scope analysis for downstream nodes', () => {
    const node = createDiagramNode('GlobalVariableActivity', { x: 100, y: 100 });
    node.data = {
      promotionMode: 'specific',
      sourceKey: 'totalScore',
      globalKey: 'Global_TotalScore',
    };

    const vars = getNodeProducedVariables(node);
    expect(vars.length).toBe(1);
    expect(vars[0].name).toBe('Global_TotalScore');
  });
});
