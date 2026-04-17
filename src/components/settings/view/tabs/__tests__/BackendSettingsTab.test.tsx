import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { renderWithProviders } from '../../../../../test/test-utils';
import BackendSettingsTab from '../BackendSettingsTab';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockSwitchBackend = vi.fn();
const mockAddBackend = vi.fn().mockReturnValue('custom-123');
const mockRemoveBackend = vi.fn();

const presetBackends = [
  { id: 'current', name: 'Current Server', url: '' },
  { id: 'local', name: 'Local Mac', url: 'http://localhost:3001' },
];

const customBackend = { id: 'custom-1', name: 'My Cloud', url: 'https://cloud.example.com' };

function mockBackendContext(overrides: Record<string, unknown> = {}) {
  return {
    backends: [...presetBackends, customBackend],
    activeBackend: presetBackends[0],
    switchBackend: mockSwitchBackend,
    addBackend: mockAddBackend,
    removeBackend: mockRemoveBackend,
    updateBackend: vi.fn(),
    getBaseUrl: () => '',
    getAuthTokenKey: () => 'auth-token',
    backendVersion: 0,
    ...overrides,
  };
}

vi.mock('../../../../../contexts/BackendContext', () => ({
  useBackend: () => mockBackendContext(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BackendSettingsTab', () => {
  it('renders all backends', () => {
    renderWithProviders(<BackendSettingsTab />);
    expect(screen.getByText('Current Server')).toBeInTheDocument();
    expect(screen.getByText('Local Mac')).toBeInTheDocument();
    expect(screen.getByText('My Cloud')).toBeInTheDocument();
  });

  it('shows Active badge on active backend', () => {
    renderWithProviders(<BackendSettingsTab />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows Default badge on preset backends', () => {
    renderWithProviders(<BackendSettingsTab />);
    const badges = screen.getAllByText('Default');
    // Both 'current' and 'local' should have Default badge.
    expect(badges).toHaveLength(2);
  });

  it('does not show Switch button on active backend', () => {
    renderWithProviders(<BackendSettingsTab />);
    // 2 non-active backends should show "Switch to" buttons.
    const switchButtons = screen.getAllByText('Switch to');
    expect(switchButtons).toHaveLength(2);
  });

  it('calls switchBackend when Switch button is clicked', async () => {
    const { user } = renderWithProviders(<BackendSettingsTab />);
    const switchButtons = screen.getAllByText('Switch to');
    await user.click(switchButtons[0]);
    expect(mockSwitchBackend).toHaveBeenCalled();
  });

  it('does not show delete button on preset backends', () => {
    renderWithProviders(<BackendSettingsTab />);
    // Only 1 custom backend should have a delete button.
    const deleteButtons = screen.getAllByTitle('Remove');
    expect(deleteButtons).toHaveLength(1);
  });

  it('calls removeBackend after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = renderWithProviders(<BackendSettingsTab />);
    const deleteButton = screen.getByTitle('Remove');
    await user.click(deleteButton);
    expect(window.confirm).toHaveBeenCalled();
    expect(mockRemoveBackend).toHaveBeenCalledWith('custom-1');
  });

  it('shows validation error when adding backend with empty name', async () => {
    const { user } = renderWithProviders(<BackendSettingsTab />);
    // Fill URL but leave name empty, click Add.
    const urlInput = screen.getByPlaceholderText('https://example.com:8080');
    await user.type(urlInput, 'http://test:3001');
    const addButtons = screen.getAllByText('Add Backend');
    // The second "Add Backend" is the form button (first is the heading).
    await user.click(addButtons[addButtons.length - 1]);
    expect(screen.getByText('Please enter a name')).toBeInTheDocument();
  });
});
