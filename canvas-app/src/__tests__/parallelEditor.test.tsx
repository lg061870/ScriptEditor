import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParallelEditor } from '../components/ParallelEditor';

describe('ParallelEditor Component', () => {
  const initialData = {
    branches: 'Branch 1 | Branch 2',
    branchCount: '2',
    continueOnError: 'false',
    completeMessage: '',
    includeJoinPort: 'false',
  };

  it('renders initial branches and branch count badge', () => {
    const handleChange = vi.fn();
    render(
      <ParallelEditor
        nodeId="node-parallel-1"
        data={initialData}
        onChange={handleChange}
      />
    );

    expect(screen.getByTestId('parallel-branch-count-badge')).toHaveTextContent('2 branches');
    expect(screen.getByTestId('parallel-branch-input-0')).toHaveValue('Branch 1');
    expect(screen.getByTestId('parallel-branch-input-1')).toHaveValue('Branch 2');
  });

  it('allows renaming a branch', () => {
    const handleChange = vi.fn();
    render(
      <ParallelEditor
        nodeId="node-parallel-1"
        data={initialData}
        onChange={handleChange}
      />
    );

    const input0 = screen.getByTestId('parallel-branch-input-0');
    fireEvent.change(input0, { target: { value: 'Fetch Orders' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        branches: 'Fetch Orders | Branch 2',
        branchCount: '2',
      })
    );
  });

  it('adds a new branch when "+ Add Parallel Branch" is clicked', () => {
    const handleChange = vi.fn();
    render(
      <ParallelEditor
        nodeId="node-parallel-1"
        data={initialData}
        onChange={handleChange}
      />
    );

    const addBtn = screen.getByTestId('parallel-add-branch-btn');
    fireEvent.click(addBtn);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        branches: 'Branch 1 | Branch 2 | Branch 3',
        branchCount: '3',
      })
    );
  });

  it('toggles continue on error and join port settings', () => {
    const handleChange = vi.fn();
    render(
      <ParallelEditor
        nodeId="node-parallel-1"
        data={initialData}
        onChange={handleChange}
      />
    );

    const continueToggle = screen.getByTestId('parallel-continue-on-error-toggle');
    fireEvent.click(continueToggle);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        continueOnError: 'true',
      })
    );

    const joinToggle = screen.getByTestId('parallel-join-port-toggle');
    fireEvent.click(joinToggle);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        includeJoinPort: 'true',
      })
    );
  });
});
