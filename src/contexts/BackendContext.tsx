import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { AUTH_TOKEN_STORAGE_KEY, getBackendTokenKey } from '../components/auth/constants';

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
  addBackend: (name: string, url: string) => string;
  removeBackend: (id: string) => void;
  updateBackend: (id: string, name: string, url: string) => void;
  getBaseUrl: () => string;
  getAuthTokenKey: () => string;
  /** Monotonically increasing counter; increments on every switchBackend call.
   *  Components can snapshot this value before an async operation and compare
   *  afterwards to detect (and discard) stale responses from a previous backend. */
  backendVersion: number;
};

// ────────────────────── Constants ──────────────────────

const ACTIVE_BACKEND_STORAGE_KEY = 'active-backend-id';
const CUSTOM_BACKENDS_STORAGE_KEY = 'custom-backends';

// Pre-configured environments — no manual setup needed
// 'current' uses same-origin (empty URL) so API calls follow the page's own URL.
// This is the correct default for any deployment (staging, production, local dev via Vite proxy).
// Users can add more custom backends via Settings → Backends.
const PRESET_BACKENDS: BackendConfig[] = [
  {
    id: 'current',
    name: 'Current Server',
    url: '',
  },
  {
    id: 'local',
    name: 'Local Mac',
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

  // 'cloud' 已删除，必须重置为 'current'
  // 'local' 只在旧用户（有 cloud token 残留）时才重置，否则保留用户的选择
  if (activeId === 'cloud') {
    localStorage.setItem(ACTIVE_BACKEND_STORAGE_KEY, 'current');
  } else if (activeId === 'local' && localStorage.getItem(OLD_CLOUD_TOKEN_KEY)) {
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

const loadCustomBackends = (): BackendConfig[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_BACKENDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b: unknown): b is BackendConfig =>
        typeof b === 'object' && b !== null && 'id' in b && 'name' in b && 'url' in b,
    );
  } catch {
    return [];
  }
};

const saveCustomBackends = (backends: BackendConfig[]) => {
  localStorage.setItem(CUSTOM_BACKENDS_STORAGE_KEY, JSON.stringify(backends));
};

const getAllBackends = (): BackendConfig[] => [...PRESET_BACKENDS, ...loadCustomBackends()];

const loadActiveBackendId = (): string => {
  const stored = localStorage.getItem(ACTIVE_BACKEND_STORAGE_KEY) || 'current';
  // If the stored ID no longer exists (e.g. user deleted a custom backend), fall back to 'current'.
  if (!getAllBackends().some((b) => b.id === stored)) {
    localStorage.setItem(ACTIVE_BACKEND_STORAGE_KEY, 'current');
    return 'current';
  }
  return stored;
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
  const [customBackends, setCustomBackends] = useState<BackendConfig[]>(loadCustomBackends);
  // L4: Monotonic counter so consumers can detect stale in-flight responses after a backend switch.
  const backendVersionRef = useRef(0);
  const [backendVersion, setBackendVersion] = useState(0);

  const allBackends = useMemo(
    () => [...PRESET_BACKENDS, ...customBackends],
    [customBackends],
  );

  const activeBackend = useMemo(
    () => allBackends.find((b) => b.id === activeBackendId) || PRESET_BACKENDS[0],
    [activeBackendId, allBackends],
  );

  const bumpVersion = useCallback(() => {
    backendVersionRef.current += 1;
    setBackendVersion(backendVersionRef.current);
  }, []);

  const switchBackend = useCallback(
    (id: string) => {
      if (allBackends.some((b) => b.id === id)) {
        setActiveBackendId(id);
        saveActiveBackendId(id);
        bumpVersion();
      }
    },
    [allBackends, bumpVersion],
  );

  const addBackend = useCallback(
    (name: string, url: string): string => {
      const id = `custom-${Date.now()}`;
      const newBackend: BackendConfig = { id, name, url };
      setCustomBackends((prev) => {
        const next = [...prev, newBackend];
        saveCustomBackends(next);
        return next;
      });
      return id;
    },
    [],
  );

  const removeBackend = useCallback(
    (id: string) => {
      if (PRESET_BACKENDS.some((b) => b.id === id)) return;
      setCustomBackends((prev) => {
        const next = prev.filter((b) => b.id !== id);
        saveCustomBackends(next);
        return next;
      });
      // If removing the active backend, fall back to 'current'
      setActiveBackendId((prev) => {
        if (prev === id) {
          saveActiveBackendId('current');
          bumpVersion();
          return 'current';
        }
        return prev;
      });
    },
    [bumpVersion],
  );

  const updateBackend = useCallback(
    (id: string, name: string, url: string) => {
      if (PRESET_BACKENDS.some((b) => b.id === id)) return;
      setCustomBackends((prev) => {
        const next = prev.map((b) => (b.id === id ? { ...b, name, url } : b));
        saveCustomBackends(next);
        return next;
      });
      bumpVersion();
    },
    [bumpVersion],
  );

  const getBaseUrl = useCallback(() => activeBackend.url, [activeBackend]);

  const getAuthTokenKey = useCallback(
    () => getBackendTokenKey(activeBackend.url),
    [activeBackend],
  );

  const contextValue = useMemo<BackendContextValue>(
    () => ({
      backends: allBackends,
      activeBackend,
      switchBackend,
      addBackend,
      removeBackend,
      updateBackend,
      getBaseUrl,
      getAuthTokenKey,
      backendVersion,
    }),
    [allBackends, activeBackend, switchBackend, addBackend, removeBackend, updateBackend, getBaseUrl, getAuthTokenKey, backendVersion],
  );

  return <BackendContext.Provider value={contextValue}>{children}</BackendContext.Provider>;
}

export default BackendContext;
