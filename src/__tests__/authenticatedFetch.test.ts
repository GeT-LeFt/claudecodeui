import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test authenticatedFetch's backendOpts parameter: baseUrl prefixing and tokenKey selection.
// The function lives in src/utils/api.js — a plain JS module that uses fetch() and localStorage.

// Mock fetch globally
const mockFetch = vi.fn(() => Promise.resolve(new Response('ok', { status: 200 })));

// Mock localStorage
const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, val: string) => { storage[key] = val; }),
  removeItem: vi.fn((key: string) => { delete storage[key]; }),
};

// Setup DOM globals before import
vi.stubGlobal('fetch', mockFetch);
vi.stubGlobal('localStorage', mockLocalStorage);
vi.stubGlobal('window', { location: { hostname: 'localhost' } });

const mod = await import('../utils/api.js');
const authenticatedFetch = (mod as Record<string, unknown>).authenticatedFetch as (
  url: string,
  options?: Record<string, unknown>,
  backendOpts?: { baseUrl?: string; tokenKey?: string },
) => Promise<Response>;

describe('authenticatedFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(storage).forEach((k) => delete storage[k]);
  });

  it('calls fetch with the original URL when no backendOpts', async () => {
    await authenticatedFetch('/api/projects');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = (mockFetch.mock.calls[0] as unknown[])?.[0];
    expect(url).toBe('/api/projects');
  });

  it('prepends baseUrl when provided in backendOpts', async () => {
    await authenticatedFetch('/api/projects', {}, { baseUrl: 'http://remote:3002' });
    const url = (mockFetch.mock.calls[0] as unknown[])?.[0];
    expect(url).toBe('http://remote:3002/api/projects');
  });

  it('uses custom tokenKey from backendOpts for Authorization header', async () => {
    storage['custom-token'] = 'my-secret-token';
    await authenticatedFetch('/api/data', {}, { tokenKey: 'custom-token' });
    const opts = (mockFetch.mock.calls[0] as unknown[])?.[1] as Record<string, Record<string, string>> | undefined;
    expect(opts?.headers?.['Authorization']).toBe('Bearer my-secret-token');
  });

  it('uses default "auth-token" key when tokenKey is not provided', async () => {
    storage['auth-token'] = 'default-token';
    await authenticatedFetch('/api/data');
    const opts = (mockFetch.mock.calls[0] as unknown[])?.[1] as Record<string, Record<string, string>> | undefined;
    expect(opts?.headers?.['Authorization']).toBe('Bearer default-token');
  });

  it('does not set Authorization when token is not in storage', async () => {
    await authenticatedFetch('/api/data');
    const opts = (mockFetch.mock.calls[0] as unknown[])?.[1] as Record<string, Record<string, string>> | undefined;
    expect(opts?.headers?.['Authorization']).toBeUndefined();
  });

  it('sets Content-Type to application/json by default', async () => {
    await authenticatedFetch('/api/data');
    const opts = (mockFetch.mock.calls[0] as unknown[])?.[1] as Record<string, Record<string, string>> | undefined;
    expect(opts?.headers?.['Content-Type']).toBe('application/json');
  });

  it('does not override Content-Type for FormData body', async () => {
    const formData = new FormData();
    await authenticatedFetch('/api/upload', { body: formData });
    const opts = (mockFetch.mock.calls[0] as unknown[])?.[1] as Record<string, Record<string, string>> | undefined;
    // FormData: browser sets Content-Type automatically, so we should NOT set it
    expect(opts?.headers?.['Content-Type']).toBeUndefined();
  });

  it('combines baseUrl and tokenKey together', async () => {
    storage['remote-token'] = 'rt-123';
    await authenticatedFetch('/api/health', {}, { baseUrl: 'https://api.example.com', tokenKey: 'remote-token' });
    const url = (mockFetch.mock.calls[0] as unknown[])?.[0];
    const opts = (mockFetch.mock.calls[0] as unknown[])?.[1] as Record<string, Record<string, string>> | undefined;
    expect(url).toBe('https://api.example.com/api/health');
    expect(opts?.headers?.['Authorization']).toBe('Bearer rt-123');
  });
});
