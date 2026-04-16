import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for BackendContext module-level logic (L4 / migration):
 * - migrateBackendStorage() runs on import, migrating old 'cloud' → 'current'
 * - loadActiveBackendId() guards against 'local' on non-localhost hosts
 *
 * Strategy: mock localStorage + window.location, then dynamic-import the module.
 * migrateBackendStorage runs at module init time; loadActiveBackendId runs when
 * BackendProvider is called (it's a useState initializer).
 */

// ─── Shared mock setup ──────────────────────────────────────────────────────

const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, val: string) => { storage[key] = val; }),
  removeItem: vi.fn((key: string) => { delete storage[key]; }),
};

vi.stubGlobal('localStorage', mockLocalStorage);

// Track useState initializer calls so we can capture loadActiveBackendId's return value
let lastUseStateInitResult: unknown = undefined;

vi.mock('react', () => ({
  createContext: vi.fn(() => ({ Provider: vi.fn(({ children }: any) => children) })),
  useContext: vi.fn(),
  useCallback: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  useMemo: vi.fn((fn: () => unknown) => fn()),
  useRef: vi.fn((v: unknown) => ({ current: v })),
  useState: vi.fn((v: unknown) => {
    const resolved = typeof v === 'function' ? (v as () => unknown)() : v;
    lastUseStateInitResult = resolved;
    return [resolved, vi.fn()];
  }),
}));

const ACTIVE_KEY = 'active-backend-id';
const MIGRATION_KEY = 'backend-migration-v1';
const AUTH_TOKEN_KEY = 'auth-token';
const OLD_CLOUD_URL = 'http://47.113.190.177:3001';
const OLD_CLOUD_TOKEN_KEY = `${AUTH_TOKEN_KEY}::${OLD_CLOUD_URL}`;

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(storage).forEach((k) => delete storage[k]);
  lastUseStateInitResult = undefined;
  vi.resetModules();
});

/** Import module fresh and invoke BackendProvider to trigger loadActiveBackendId */
async function importAndInit(hostname: string) {
  vi.stubGlobal('window', { location: { hostname, origin: `http://${hostname}:5173` } });
  const mod = await import('../contexts/BackendContext');
  // Call BackendProvider to trigger useState → loadActiveBackendId
  const BackendProvider = (mod as any).BackendProvider;
  if (typeof BackendProvider === 'function') {
    try { BackendProvider({ children: null }); } catch { /* ignore React errors */ }
  }
  return mod;
}

describe('migrateBackendStorage (module init)', () => {
  it('migrates old "cloud" backend ID to "current"', async () => {
    storage[ACTIVE_KEY] = 'cloud';
    vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'http://localhost:5173' } });
    await import('../contexts/BackendContext');
    expect(storage[ACTIVE_KEY]).toBe('current');
    expect(storage[MIGRATION_KEY]).toBe('1');
  });

  it('migrates orphaned cloud token to same-origin key', async () => {
    storage[ACTIVE_KEY] = 'cloud';
    storage[OLD_CLOUD_TOKEN_KEY] = 'old-cloud-tok';
    vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'http://localhost:5173' } });
    await import('../contexts/BackendContext');
    expect(storage[AUTH_TOKEN_KEY]).toBe('old-cloud-tok');
    expect(storage[OLD_CLOUD_TOKEN_KEY]).toBeUndefined();
  });

  it('does not overwrite existing same-origin token during migration', async () => {
    storage[ACTIVE_KEY] = 'cloud';
    storage[OLD_CLOUD_TOKEN_KEY] = 'old-cloud-tok';
    storage[AUTH_TOKEN_KEY] = 'existing-tok';
    vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'http://localhost:5173' } });
    await import('../contexts/BackendContext');
    expect(storage[AUTH_TOKEN_KEY]).toBe('existing-tok');
  });

  it('skips migration if already done', async () => {
    storage[MIGRATION_KEY] = '1';
    storage[ACTIVE_KEY] = 'cloud';
    vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'http://localhost:5173' } });
    await import('../contexts/BackendContext');
    expect(storage[ACTIVE_KEY]).toBe('cloud');
  });

  it('migrates "local" to "current" only when old cloud token exists', async () => {
    // Case 1: local + cloud token → migrate
    storage[ACTIVE_KEY] = 'local';
    storage[OLD_CLOUD_TOKEN_KEY] = 'old-tok';
    vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'http://localhost:5173' } });
    await import('../contexts/BackendContext');
    expect(storage[ACTIVE_KEY]).toBe('current');

    // Reset for case 2
    Object.keys(storage).forEach((k) => delete storage[k]);
    vi.resetModules();

    // Case 2: local + no cloud token → preserve local
    storage[ACTIVE_KEY] = 'local';
    vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'http://localhost:5173' } });
    await import('../contexts/BackendContext');
    expect(storage[ACTIVE_KEY]).toBe('local');
  });
});

// ─── loadActiveBackendId guard tests ────────────────────────────────────────

describe('loadActiveBackendId guard logic (L4)', () => {
  it('preserves "local" on localhost', async () => {
    storage[MIGRATION_KEY] = '1';
    storage[ACTIVE_KEY] = 'local';
    await importAndInit('localhost');
    expect(storage[ACTIVE_KEY]).toBe('local');
  });

  it('resets "local" to "current" on non-localhost host', async () => {
    storage[MIGRATION_KEY] = '1';
    storage[ACTIVE_KEY] = 'local';
    await importAndInit('47.113.190.177');
    expect(storage[ACTIVE_KEY]).toBe('current');
  });

  it('"current" is valid on any host', async () => {
    storage[MIGRATION_KEY] = '1';
    storage[ACTIVE_KEY] = 'current';
    await importAndInit('47.113.190.177');
    expect(storage[ACTIVE_KEY]).toBe('current');
  });
});
