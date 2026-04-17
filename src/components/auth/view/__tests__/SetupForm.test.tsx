import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { renderWithProviders } from '../../../../test/test-utils';
import SetupForm from '../SetupForm';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockRegister = vi.fn();

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ register: mockRegister }),
}));

vi.mock('../../../../constants/config', () => ({ IS_PLATFORM: false }));

beforeEach(() => {
  mockRegister.mockReset();
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function fillForm(
  user: ReturnType<typeof import('@testing-library/user-event')['default']['setup']>,
  { username = 'admin', password = 'secret123', confirm = 'secret123' } = {},
) {
  await user.type(screen.getByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), password);
  await user.type(screen.getByLabelText('Confirm Password'), confirm);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SetupForm', () => {
  it('renders username, password, confirm password fields and submit button', () => {
    renderWithProviders(<SetupForm />);
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
  });

  it('shows error when fields are empty', async () => {
    renderWithProviders(<SetupForm />);
    // Use fireEvent.submit to bypass HTML5 required validation.
    fireEvent.submit(screen.getByRole('button', { name: 'Create Account' }));
    await waitFor(() => {
      expect(screen.getByText('Please fill in all fields.')).toBeInTheDocument();
    });
  });

  it('shows error when username is too short', async () => {
    const { user } = renderWithProviders(<SetupForm />);
    await fillForm(user, { username: 'ab' });
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(screen.getByText('Username must be at least 3 characters long.')).toBeInTheDocument();
  });

  it('shows error when password is too short', async () => {
    const { user } = renderWithProviders(<SetupForm />);
    await fillForm(user, { password: '12345', confirm: '12345' });
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(screen.getByText('Password must be at least 6 characters long.')).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    const { user } = renderWithProviders(<SetupForm />);
    await fillForm(user, { confirm: 'different' });
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  });

  it('calls register with trimmed username on valid submit', async () => {
    mockRegister.mockResolvedValue({ success: true });
    const { user } = renderWithProviders(<SetupForm />);
    await fillForm(user, { username: '  admin  ' });
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('admin', 'secret123');
    });
  });

  it('displays error from failed registration', async () => {
    mockRegister.mockResolvedValue({ success: false, error: 'Username taken' });
    const { user } = renderWithProviders(<SetupForm />);
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    await waitFor(() => {
      expect(screen.getByText('Username taken')).toBeInTheDocument();
    });
  });
});
