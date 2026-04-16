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
// 'current' uses same-origin (empty URL) so API calls follow the page's own URL.
// This is the correct default for any deployment (staging, production, local dev via Vite proxy).
const PRESET_BACKENDS: BackendConfig[] = [
  {
    id: 'current',
    name: 'Current Server',
    url: '',
  },
  {
    id: 'local',
    name: 'Local Dev',
    url: 'http://localhost:3001',
  },
];

// ────────────────────── Migration ──────────────────────
// Commit 55e45bd changed presets:
//   OLD: 'local' → localhost:3001, 'cloud' → 47.113.190.177:3001
//   NEW: 'current' → '' (same-origin), 'local' → localhost:3001
// Old 'cloud'/'local' users may have stale backend IDs and orphaned tokens.

const MIGRATION_DONE_KEY = 'backend-migration-v1';

function migrateBackendStorage(): void {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return;

  const activeId = localStorage.getItem(ACTIVE_BACKEND_STORAGE_KEY);
  const OLD_CLOUD_URL = 'http://47.113.190.177:3001';
  const OLD_CLOUD_TOKEN_KEY = `${AUTH_TOKEN_STORAGE_KEY}::${OLD_CLOUD_URL}`;

  if (activeId === 'cloud' || activeId === 'local') {
    localStorage.setItem(ACTIVE_BACKEND_STORAGE_KEY, 'current');
  }

  const orphanedCloudToken = localStorage.getItem(OLD_CLOUD_TOKEN_KEY);
  const sameOriginToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (orphanedCloudToken && !sameOriginToken) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, orphanedCloudToken);
  }
  localStorage.removeItem(OLD_CLOUD_TOKEN_KEY);

  localStorage.setItem(MIGRATION_DONE_KEY, '1');
}

migrateBackendStorage();

// ────────────────────── Helpers ──────────────────────

export const getBackendTokenKey = (backendUrl: string): string => {
  if (!backendUrl) return AUTH_TOKEN_STORAGE_KEY;
  try {
    const backendOrigin = new URL(backendUrl).origin;
    if (backendOrigin === window.location.origin) return AUTH_TOKEN_STORAGE_KEY;
  } catch { /* invalid URL, treat as remote */ }
  return `${AUTH_TOKEN_STORAGE_KEY}::${backendUrl}`;
};

const loadActiveBackendId = (): string => {
  return localStorage.getItem(ACTIVE_BACKEND_STORAGE_KEY) || 'current';
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
