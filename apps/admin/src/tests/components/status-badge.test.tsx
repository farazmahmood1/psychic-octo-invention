/**
 * StatusBadge component tests.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/status-badge';

describe('StatusBadge', () => {
  it('renders with active status (capitalized label)', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders with closed status', () => {
    render(<StatusBadge status="closed" />);
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('renders with failed status', () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('renders unknown status as-is with underscore replacement', () => {
    render(<StatusBadge status="not_mapped" />);
    expect(screen.getByText('not mapped')).toBeInTheDocument();
  });
});
