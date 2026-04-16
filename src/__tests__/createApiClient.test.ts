import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (same pattern as authenticatedFetch.test.ts) ─────────────────────

const mockFetch = vi.fn(() => Promise.resolve(new Response('ok', { status: 200 })));
const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, val: string) => { storage[key] = val; }),
  removeItem: vi.fn((key: string) => { delete storage[key]; }),
};

vi.stubGlobal('fetch', mockFetch);
vi.stubGlobal('localStorage', mockLocalStorage);
vi.stubGlobal('window', { location: { hostname: 'localhost' } });

const mod = await import('../utils/api.js');
const createApiClient = (mod as Record<string, unknown>).createApiClient as (
  baseUrl: string,
  tokenKey: string,
) => Record<string, any>;

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createApiClient (C1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(storage).forEach((k) => delete storage[k]);
  });

  it('routes API calls through the provided baseUrl', async () => {
    const client = createApiClient('http://remote:3002', 'auth-token');
    await client.projects();
    const url = (mockFetch.mock.calls[0] as unknown[])?.[0];
    expect(url).toBe('http://remote:3002/api/projects');
  });

  it('uses the provided tokenKey for Authorization header', async () => {
    storage['custom-backend-token'] = 'secret-tok';
    const client = createApiClient('', 'custom-backend-token');
    await client.projects();
    const opts = (mockFetch.mock.calls[0] as unknown[])?.[1] as Record<string, Record<string, string>> | undefined;
    expect(opts?.headers?.['Authorization']).toBe('Bearer secret-tok');
  });

  it('auth.status uses raw fetch with baseUrl (no auth header)', async () => {
    const client = createApiClient('http://remote:3002', 'k');
    await client.auth.status();
    const url = (mockFetch.mock.calls[0] as unknown[])?.[0];
    expect(url).toBe('http://remote:3002/api/auth/status');
    // auth.status uses raw fetch, not authenticatedFetch — should NOT have auth header
    const opts = (mockFetch.mock.calls[0] as unknown[])?.[1] as Record<string, Record<string, string>> | undefined;
    expect(opts?.headers?.['Authorization']).toBeUndefined();
  });

  it('auth.login sends POST to baseUrl without auth header', async () => {
    const client = createApiClient('http://remote:3002', 'k');
    await client.auth.login('user1', 'pass1');
    const url = (mockFetch.mock.calls[0] as unknown[])?.[0];
    const opts = (mockFetch.mock.calls[0] as unknown[])?.[1] as Record<string, unknown> | undefined;
    expect(url).toBe('http://remote:3002/api/auth/login');
    expect(opts?.method).toBe('POST');
    expect(JSON.parse(opts?.body as string)).toEqual({ username: 'user1', password: 'pass1' });
  });

  it('defaults to same-origin when baseUrl is empty string', async () => {
    const client = createApiClient('', 'auth-token');
    await client.projects();
    const url = (mockFetch.mock.calls[0] as unknown[])?.[0];
    expect(url).toBe('/api/projects');
  });

  it('two clients with different backends are independent', async () => {
    storage['key-a'] = 'tok-a';
    storage['key-b'] = 'tok-b';
    const clientA = createApiClient('http://a:3001', 'key-a');
    const clientB = createApiClient('http://b:3002', 'key-b');

    await clientA.projects();
    await clientB.projects();

    expect(mockFetch.mock.calls).toHaveLength(2);
    // First call → clientA
    expect((mockFetch.mock.calls[0] as unknown[])?.[0]).toBe('http://a:3001/api/projects');
    const optsA = (mockFetch.mock.calls[0] as unknown[])?.[1] as Record<string, Record<string, string>>;
    expect(optsA?.headers?.['Authorization']).toBe('Bearer tok-a');
    // Second call → clientB
    expect((mockFetch.mock.calls[1] as unknown[])?.[0]).toBe('http://b:3002/api/projects');
    const optsB = (mockFetch.mock.calls[1] as unknown[])?.[1] as Record<string, Record<string, string>>;
    expect(optsB?.headers?.['Authorization']).toBe('Bearer tok-b');
  });
});
