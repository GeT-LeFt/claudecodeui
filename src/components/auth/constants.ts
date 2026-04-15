export const AUTH_TOKEN_STORAGE_KEY = 'auth-token';

export const getBackendTokenKey = (backendUrl: string): string => {
  if (!backendUrl) return AUTH_TOKEN_STORAGE_KEY;
  try {
    const backendOrigin = new URL(backendUrl).origin;
    if (backendOrigin === window.location.origin) return AUTH_TOKEN_STORAGE_KEY;
  } catch { /* invalid URL, treat as remote */ }
  return `${AUTH_TOKEN_STORAGE_KEY}::${backendUrl}`;
};

export const AUTH_ERROR_MESSAGES = {
  authStatusCheckFailed: 'Failed to check authentication status',
  loginFailed: 'Login failed',
  registrationFailed: 'Registration failed',
  networkError: 'Network error. Please try again.',
} as const;
