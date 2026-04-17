import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { renderWithProviders } from '../../../../test/test-utils';
import LoginForm from '../LoginForm';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockLogin = vi.fn();

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

// AuthScreenLayout depends on IS_PLATFORM constant — provide a stable default.
vi.mock('../../../../constants/config', () => ({ IS_PLATFORM: false }));

beforeEach(() => {
  mockLogin.mockReset();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('LoginForm', () => {
  it('renders username, password fields and submit button', () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('shows validation error when fields are empty', async () => {
    renderWithProviders(<LoginForm />);
    // Use fireEvent.submit to bypass HTML5 required validation (jsdom/userEvent blocks empty required fields).
    fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => {
      expect(screen.getByText('Please fill in all fields')).toBeInTheDocument();
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('shows validation error when username has only spaces', async () => {
    const { user } = renderWithProviders(<LoginForm />);
    await user.type(screen.getByLabelText('Username'), '   ');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => {
      expect(screen.getByText('Please fill in all fields')).toBeInTheDocument();
    });
  });

  it('calls login with trimmed username on valid submit', async () => {
    mockLogin.mockResolvedValue({ success: true });
    const { user } = renderWithProviders(<LoginForm />);
    await user.type(screen.getByLabelText('Username'), '  admin  ');
    await user.type(screen.getByLabelText('Password'), 'pass123');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin', 'pass123');
    });
  });

  it('displays error message from failed login', async () => {
    mockLogin.mockResolvedValue({ success: false, error: 'Invalid credentials' });
    const { user } = renderWithProviders(<LoginForm />);
    await user.type(screen.getByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('disables submit button and shows loading text while submitting', async () => {
    // Keep the login promise pending so we can assert the loading state.
    let resolveLogin!: (v: { success: boolean }) => void;
    mockLogin.mockReturnValue(new Promise((res) => { resolveLogin = res; }));

    const { user } = renderWithProviders(<LoginForm />);
    await user.type(screen.getByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'pass');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled();

    // Resolve to clean up.
    resolveLogin({ success: true });
  });

  it('clears previous error on new submission', async () => {
    mockLogin
      .mockResolvedValueOnce({ success: false, error: 'Bad creds' })
      .mockResolvedValueOnce({ success: true });

    const { user } = renderWithProviders(<LoginForm />);
    await user.type(screen.getByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(screen.getByText('Bad creds')).toBeInTheDocument());

    // Second attempt — error should clear.
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(screen.queryByText('Bad creds')).not.toBeInTheDocument());
  });
});
