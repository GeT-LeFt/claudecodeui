import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import BackendSwitcher from '../BackendSwitcher';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockSwitchBackend = vi.fn();

const presetBackends = [
  { id: 'current', name: 'Current Server', url: '' },
  { id: 'local', name: 'Local Mac', url: 'http://localhost:3001' },
];

vi.mock('../../../../../contexts/BackendContext', () => ({
  useBackend: () => ({
    backends: presetBackends,
    activeBackend: presetBackends[0],
    switchBackend: mockSwitchBackend,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Mock fetch for health check.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('OK', { status: 200 }));
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BackendSwitcher', () => {
  it('renders active backend name', () => {
    render(<BackendSwitcher />);
    expect(screen.getByText('Current Server')).toBeInTheDocument();
  });

  it('opens dropdown on click', async () => {
    const user = userEvent.setup();
    render(<BackendSwitcher />);
    await user.click(screen.getByText('Current Server'));
    // Both backends should appear in the dropdown.
    expect(screen.getByText('Local Mac')).toBeInTheDocument();
  });

  it('calls switchBackend when selecting a different backend', async () => {
    const user = userEvent.setup();
    render(<BackendSwitcher />);
    await user.click(screen.getByText('Current Server'));
    await user.click(screen.getByText('Local Mac'));
    expect(mockSwitchBackend).toHaveBeenCalledWith('local');
  });

  it('closes dropdown on outside click', async () => {
    const user = userEvent.setup();
    render(<BackendSwitcher />);
    await user.click(screen.getByText('Current Server'));
    expect(screen.getByText('Local Mac')).toBeInTheDocument();
    // Click outside.
    await user.click(document.body);
    await waitFor(() => {
      expect(screen.queryByText('Local Mac')).not.toBeInTheDocument();
    });
  });

  it('shows green status dot when health check succeeds', async () => {
    render(<BackendSwitcher />);
    await waitFor(() => {
      const dots = document.querySelectorAll('.bg-green-500');
      expect(dots.length).toBeGreaterThan(0);
    });
  });
});
