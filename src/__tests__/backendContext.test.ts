import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub window.location.origin for getBackendTokenKey
vi.stubGlobal('window', { location: { origin: 'https://47.113.190.177:8444' } });

const { getBackendTokenKey } = await import('../contexts/BackendContext');

describe('getBackendTokenKey – token isolation between backends', () => {
  beforeEach(() => {
    // Reset origin for each test (default: staging)
    Object.defineProperty(window.location, 'origin', {
      value: 'https://47.113.190.177:8444',
      writable: true,
      configurable: true,
    });
  });

  it('returns default key for empty URL (same-origin / "Current Server")', () => {
    expect(getBackendTokenKey('')).toBe('auth-token');
  });

  it('returns default key when backend URL matches current origin', () => {
    // If the user is on https://47.113.190.177:8444 and the backend URL points to the same origin
    expect(getBackendTokenKey('https://47.113.190.177:8444')).toBe('auth-token');
  });

  it('returns namespaced key for a different backend URL', () => {
    expect(getBackendTokenKey('http://localhost:3001')).toBe('auth-token::http://localhost:3001');
  });

  it('returns namespaced key for remote backend on different port', () => {
    expect(getBackendTokenKey('http://47.113.190.177:3001')).toBe('auth-token::http://47.113.190.177:3001');
  });

  it('two different remote backends get different token keys', () => {
    const keyA = getBackendTokenKey('http://localhost:3001');
    const keyB = getBackendTokenKey('http://remote-server:3002');
    expect(keyA).not.toBe(keyB);
    expect(keyA).toBe('auth-token::http://localhost:3001');
    expect(keyB).toBe('auth-token::http://remote-server:3002');
  });

  it('handles invalid URL gracefully (treated as remote)', () => {
    expect(getBackendTokenKey('not-a-valid-url')).toBe('auth-token::not-a-valid-url');
  });

  it('same-origin detection works with production origin', () => {
    Object.defineProperty(window.location, 'origin', {
      value: 'https://47.113.190.177:8443',
      configurable: true,
    });
    // Backend URL matches production origin → same-origin → default key
    expect(getBackendTokenKey('https://47.113.190.177:8443')).toBe('auth-token');
    // Backend URL points to staging → different origin → namespaced key
    expect(getBackendTokenKey('https://47.113.190.177:8444')).toBe('auth-token::https://47.113.190.177:8444');
  });
});

describe('Backend switching – localStorage token isolation', () => {
  const storage: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: vi.fn((key: string) => storage[key] ?? null),
    setItem: vi.fn((key: string, val: string) => { storage[key] = val; }),
    removeItem: vi.fn((key: string) => { delete storage[key]; }),
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.clearAllMocks();
    Object.keys(storage).forEach((k) => delete storage[k]);
  });

  it('current-server and local-dev use different token keys', () => {
    const currentKey = getBackendTokenKey('');                    // Current Server (same-origin)
    const localKey = getBackendTokenKey('http://localhost:3001'); // Local Dev

    // They must be different to avoid cross-contamination
    expect(currentKey).not.toBe(localKey);

    // Simulating login on both backends — tokens stored independently
    storage[currentKey] = 'token-for-current-server';
    storage[localKey] = 'token-for-local-dev';

    expect(mockLocalStorage.getItem(currentKey)).toBe('token-for-current-server');
    expect(mockLocalStorage.getItem(localKey)).toBe('token-for-local-dev');
  });

  it('removing one backend token does not affect the other', () => {
    const currentKey = getBackendTokenKey('');
    const localKey = getBackendTokenKey('http://localhost:3001');

    storage[currentKey] = 'token-current';
    storage[localKey] = 'token-local';

    // Logout from current server
    delete storage[currentKey];

    expect(mockLocalStorage.getItem(currentKey)).toBeNull();
    expect(mockLocalStorage.getItem(localKey)).toBe('token-local'); // unaffected
  });
});
