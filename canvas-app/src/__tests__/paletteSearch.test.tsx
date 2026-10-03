import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Palette } from '../components/Palette';

describe('Palette Dashicons Grid & Search Filter', () => {
  it('renders all categories and icon tiles by default', () => {
    render(<Palette />);

    // Check toolbox header
    expect(screen.getByTestId('toolbox-panel')).toBeInTheDocument();

    // Check search input and category select
    const searchInput = screen.getByPlaceholderText('Search...');
    expect(searchInput).toBeInTheDocument();
    expect(screen.getByLabelText('Filter activities by category')).toBeInTheDocument();

    // Check group headers
    expect(screen.getByText('Sequence')).toBeInTheDocument();
    expect(screen.getByText('Selection')).toBeInTheDocument();
    expect(screen.getByText('Iteration')).toBeInTheDocument();

    // Check specific tiles
    expect(screen.getByTestId('palette-item-StartNode')).toBeInTheDocument();
    expect(screen.getByTestId('palette-item-ForEachActivity')).toBeInTheDocument();
    expect(screen.getByTestId('palette-item-RepeatActivity')).toBeInTheDocument();
  });

  it('filters shapes by search query while respecting groups', () => {
    render(<Palette />);

    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: 'each' } });

    // For Each is in Iteration category
    expect(screen.getByText('Iteration')).toBeInTheDocument();
    expect(screen.getByTestId('palette-item-ForEachActivity')).toBeInTheDocument();

    // Other categories with no matching items should be hidden
    expect(screen.queryByText('Security')).not.toBeInTheDocument();
    expect(screen.queryByTestId('palette-item-StartNode')).not.toBeInTheDocument();
  });

  it('filters shapes by category dropdown selection', () => {
    render(<Palette />);

    const select = screen.getByLabelText('Filter activities by category');
    fireEvent.change(select, { target: { value: 'Iteration' } });

    // Only Iteration should be shown
    expect(screen.getByText('Iteration')).toBeInTheDocument();
    expect(screen.getByTestId('palette-item-RepeatActivity')).toBeInTheDocument();
    expect(screen.getByTestId('palette-item-ForEachActivity')).toBeInTheDocument();

    expect(screen.queryByText('Sequence')).not.toBeInTheDocument();
    expect(screen.queryByTestId('palette-item-StartNode')).not.toBeInTheDocument();
  });

  it('shows empty state when no shapes match query and can clear filter', () => {
    render(<Palette />);

    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent123' } });

    expect(screen.getByText('No shapes found')).toBeInTheDocument();

    const clearButton = screen.getByText('Clear filters');
    fireEvent.click(clearButton);

    // Clears and restores shapes
    expect(screen.getByText('Sequence')).toBeInTheDocument();
    expect(screen.getByTestId('palette-item-StartNode')).toBeInTheDocument();
  });

  it('toggles category group collapse when clicking group header', () => {
    render(<Palette />);

    const sequenceHeader = screen.getByTitle('Collapse Sequence');
    expect(screen.getByTestId('palette-item-StartNode')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(sequenceHeader);
    expect(screen.queryByTestId('palette-item-StartNode')).not.toBeInTheDocument();

    // Click to expand back
    fireEvent.click(screen.getByTitle('Expand Sequence'));
    expect(screen.getByTestId('palette-item-StartNode')).toBeInTheDocument();
  });
});
