import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// ────────────────────── Types ──────────────────────

export type BackendConfig = {
  id: string;
  name: string;
  url: string;        // '' = same-origin (default)
};

type BackendContextValue = {
  backends: BackendConfig[];
  activeBackend: BackendConfig;
  switchBackend: (id: string) => void;
  getBaseUrl: () => string;
  getAuthTokenKey: () => string;
};

// ────────────────────── Constants ──────────────────────

const ACTIVE_BACKEND_STORAGE_KEY = 'active-backend-id';
const AUTH_TOKEN_STORAGE_KEY = 'auth-token';

// Pre-configured environments — no manual setup needed
const PRESET_BACKENDS: BackendConfig[] = [
  {
    id: 'local',
    name: 'Local Mac',
    url: '',  // same-origin
  },
  {
    id: 'cloud',
    name: 'Cloud Server',
    url: 'http://47.113.190.177:3001',
  },
];

// ────────────────────── Helpers ──────────────────────

export const getBackendTokenKey = (backendUrl: string): string =>
  backendUrl ? `${AUTH_TOKEN_STORAGE_KEY}::${backendUrl}` : AUTH_TOKEN_STORAGE_KEY;

const loadActiveBackendId = (): string => {
  return localStorage.getItem(ACTIVE_BACKEND_STORAGE_KEY) || 'local';
};

const saveActiveBackendId = (id: string) => {
  localStorage.setItem(ACTIVE_BACKEND_STORAGE_KEY, id);
};

// ────────────────────── Context ──────────────────────

const BackendContext = createContext<BackendContextValue | null>(null);

export function useBackend(): BackendContextValue {
  const context = useContext(BackendContext);
  if (!context) {
    throw new Error('useBackend must be used within a BackendProvider');
  }
  return context;
}

// ────────────────────── Provider ──────────────────────

export function BackendProvider({ children }: { children: React.ReactNode }) {
  const [activeBackendId, setActiveBackendId] = useState<string>(loadActiveBackendId);

  const activeBackend = useMemo(
    () => PRESET_BACKENDS.find((b) => b.id === activeBackendId) || PRESET_BACKENDS[0],
    [activeBackendId],
  );

  const switchBackend = useCallback(
    (id: string) => {
      if (PRESET_BACKENDS.some((b) => b.id === id)) {
        setActiveBackendId(id);
        saveActiveBackendId(id);
      }
    },
    [],
  );

  const getBaseUrl = useCallback(() => activeBackend.url, [activeBackend]);

  const getAuthTokenKey = useCallback(
    () => getBackendTokenKey(activeBackend.url),
    [activeBackend],
  );

  const contextValue = useMemo<BackendContextValue>(
    () => ({
      backends: PRESET_BACKENDS,
      activeBackend,
      switchBackend,
      getBaseUrl,
      getAuthTokenKey,
    }),
    [activeBackend, switchBackend, getBaseUrl, getAuthTokenKey],
  );

  return <BackendContext.Provider value={contextValue}>{children}</BackendContext.Provider>;
}

export default BackendContext;
