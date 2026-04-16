import { useMemo } from 'react';
import { useBackend } from '../contexts/BackendContext';
import { createApiClient, authenticatedFetch } from '../utils/api';

/**
 * Returns a backend-aware API client that routes all requests
 * through the currently active backend (baseUrl + tokenKey).
 *
 * Drop-in replacement for the `api` singleton from `src/utils/api.js`.
 */
export function useBackendApi() {
  const { getBaseUrl, getAuthTokenKey } = useBackend();
  const baseUrl = getBaseUrl();
  const tokenKey = getAuthTokenKey();

  return useMemo(() => createApiClient(baseUrl, tokenKey), [baseUrl, tokenKey]);
}

/**
 * Returns a `backendOpts` object suitable for passing as the 3rd argument
 * to `authenticatedFetch(url, options, backendOpts)`.
 */
export function useBackendOpts() {
  const { getBaseUrl, getAuthTokenKey } = useBackend();
  const baseUrl = getBaseUrl();
  const tokenKey = getAuthTokenKey();

  return useMemo(() => ({ baseUrl, tokenKey }), [baseUrl, tokenKey]);
}

/**
 * Returns a backend-aware `fetch` wrapper — same signature as
 * `authenticatedFetch(url, options)` but pre-bound to the active backend.
 */
export function useBackendFetch() {
  const opts = useBackendOpts();

  return useMemo(
    () => (url: string, options: RequestInit = {}) => authenticatedFetch(url, options, opts),
    [opts],
  );
}
