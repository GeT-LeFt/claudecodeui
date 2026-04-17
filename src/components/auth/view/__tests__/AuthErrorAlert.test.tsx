import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import AuthErrorAlert from '../AuthErrorAlert';

describe('AuthErrorAlert', () => {
  it('renders error message when provided', () => {
    render(<AuthErrorAlert errorMessage="Invalid credentials" />);
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });

  it('renders nothing when errorMessage is empty', () => {
    const { container } = render(<AuthErrorAlert errorMessage="" />);
    expect(container.firstChild).toBeNull();
  });
});
