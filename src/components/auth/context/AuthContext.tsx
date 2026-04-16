import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { IS_PLATFORM } from '../../../constants/config';
import { createApiClient } from '../../../utils/api';
import { useBackend } from '../../../contexts/BackendContext';
import { AUTH_ERROR_MESSAGES, getBackendTokenKey } from '../constants';
import type {
  AuthContextValue,
  AuthProviderProps,
  AuthSessionPayload,
  AuthStatusPayload,
  AuthUser,
  AuthUserPayload,
  OnboardingStatusPayload,
} from '../types';
import { parseJsonSafely, resolveApiErrorMessage } from '../utils';

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { activeBackend } = useBackend();
  const baseUrl = activeBackend.url;
  const tokenKey = getBackendTokenKey(baseUrl);

  // Memoize the api client per-backend
  const apiClient = useMemo(() => createApiClient(baseUrl, tokenKey), [baseUrl, tokenKey]);

  const readStoredToken = useCallback((): string | null => localStorage.getItem(tokenKey), [tokenKey]);
  const persistToken = useCallback((t: string) => localStorage.setItem(tokenKey, t), [tokenKey]);
  const clearStoredToken = useCallback(() => localStorage.removeItem(tokenKey), [tokenKey]);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(tokenKey));
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AbortController for cancelling in-flight auth checks on backend switch
  const authCheckAbortRef = useRef<AbortController | null>(null);

  // Track backend switches — re-read token for the new backend
  const prevTokenKeyRef = useRef(tokenKey);
  useEffect(() => {
    if (prevTokenKeyRef.current !== tokenKey) {
      prevTokenKeyRef.current = tokenKey;
      // Cancel in-flight auth checks from the old backend
      authCheckAbortRef.current?.abort();
      const storedToken = localStorage.getItem(tokenKey);
      setToken(storedToken);
      setUser(null);
      setIsLoading(true);
      setError(null);
    }
  }, [tokenKey]);

  const setSession = useCallback((nextUser: AuthUser, nextToken: string) => {
    setUser(nextUser);
    setToken(nextToken);
    persistToken(nextToken);
  }, [persistToken]);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    clearStoredToken();
  }, [clearStoredToken]);

  const checkOnboardingStatus = useCallback(async () => {
    try {
      const response = await apiClient.user.onboardingStatus();
      if (!response.ok) {
        return;
      }

      const payload = await parseJsonSafely<OnboardingStatusPayload>(response);
      setHasCompletedOnboarding(Boolean(payload?.hasCompletedOnboarding));
    } catch (caughtError) {
      console.error('Error checking onboarding status:', caughtError);
      setHasCompletedOnboarding(true);
    }
  }, [apiClient]);

  const refreshOnboardingStatus = useCallback(async () => {
    await checkOnboardingStatus();
  }, [checkOnboardingStatus]);

  const checkAuthStatus = useCallback(async () => {
    // Cancel any previous in-flight auth check
    authCheckAbortRef.current?.abort();
    const abortController = new AbortController();
    authCheckAbortRef.current = abortController;

    try {
      setIsLoading(true);
      setError(null);

      const statusResponse = await apiClient.auth.status();
      if (abortController.signal.aborted) return;
      const statusPayload = await parseJsonSafely<AuthStatusPayload>(statusResponse);

      if (statusPayload?.needsSetup) {
        setNeedsSetup(true);
        return;
      }

      setNeedsSetup(false);

      const currentToken = localStorage.getItem(tokenKey);
      if (!currentToken) {
        return;
      }

      const userResponse = await apiClient.auth.user();
      if (abortController.signal.aborted) return;
      if (!userResponse.ok) {
        clearSession();
        return;
      }

      const userPayload = await parseJsonSafely<AuthUserPayload>(userResponse);
      if (!userPayload?.user) {
        clearSession();
        return;
      }

      if (abortController.signal.aborted) return;
      setUser(userPayload.user);
      await checkOnboardingStatus();
    } catch (caughtError) {
      if (abortController.signal.aborted) return;
      console.error('[Auth] Auth status check failed:', caughtError);
      setError(AUTH_ERROR_MESSAGES.authStatusCheckFailed);
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [checkOnboardingStatus, clearSession, tokenKey, apiClient]);

  useEffect(() => {
    if (IS_PLATFORM) {
      setUser({ username: 'platform-user' });
      setNeedsSetup(false);
      void checkOnboardingStatus().finally(() => {
        setIsLoading(false);
      });
      return;
    }

    void checkAuthStatus();
  }, [checkAuthStatus, checkOnboardingStatus]);

  const login = useCallback<AuthContextValue['login']>(
    async (username, password) => {
      try {
        setError(null);
        const response = await apiClient.auth.login(username, password);
        const payload = await parseJsonSafely<AuthSessionPayload>(response);

        if (!response.ok || !payload?.token || !payload.user) {
          const message = resolveApiErrorMessage(payload, AUTH_ERROR_MESSAGES.loginFailed);
          setError(message);
          return { success: false, error: message };
        }

        setSession(payload.user, payload.token);
        setNeedsSetup(false);
        await checkOnboardingStatus();
        return { success: true };
      } catch (caughtError) {
        console.error('Login error:', caughtError);
        setError(AUTH_ERROR_MESSAGES.networkError);
        return { success: false, error: AUTH_ERROR_MESSAGES.networkError };
      }
    },
    [checkOnboardingStatus, setSession, apiClient],
  );

  const register = useCallback<AuthContextValue['register']>(
    async (username, password) => {
      try {
        setError(null);
        const response = await apiClient.auth.register(username, password);
        const payload = await parseJsonSafely<AuthSessionPayload>(response);

        if (!response.ok || !payload?.token || !payload.user) {
          const message = resolveApiErrorMessage(payload, AUTH_ERROR_MESSAGES.registrationFailed);
          setError(message);
          return { success: false, error: message };
        }

        setSession(payload.user, payload.token);
        setNeedsSetup(false);
        await checkOnboardingStatus();
        return { success: true };
      } catch (caughtError) {
        console.error('Registration error:', caughtError);
        setError(AUTH_ERROR_MESSAGES.networkError);
        return { success: false, error: AUTH_ERROR_MESSAGES.networkError };
      }
    },
    [checkOnboardingStatus, setSession, apiClient],
  );

  const logout = useCallback(() => {
    const tokenToInvalidate = token;
    clearSession();

    if (tokenToInvalidate) {
      void apiClient.auth.logout().catch((caughtError: unknown) => {
        console.error('Logout endpoint error:', caughtError);
      });
    }
  }, [clearSession, token, apiClient]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      needsSetup,
      hasCompletedOnboarding,
      error,
      login,
      register,
      logout,
      refreshOnboardingStatus,
    }),
    [
      error,
      hasCompletedOnboarding,
      isLoading,
      login,
      logout,
      needsSetup,
      refreshOnboardingStatus,
      register,
      token,
      user,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
