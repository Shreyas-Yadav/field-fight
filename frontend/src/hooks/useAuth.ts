import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '../types';

const TOKEN_KEY = 'magnet_arena_token';

function parseJwt(token: string): AuthUser | null {
  try {
    let payloadStr = token.split('.')[1];
    // Base64url decode: replace URL-safe chars and add padding
    payloadStr = payloadStr.replace(/-/g, '+').replace(/_/g, '/');
    payloadStr += '='.repeat((4 - (payloadStr.length % 4)) % 4);
    const payload = JSON.parse(atob(payloadStr));
    if (!payload.id || !payload.name || !payload.provider) {
      console.error('[auth] Invalid JWT payload — missing required fields');
      return null;
    }
    return {
      id:       payload.id,
      name:     payload.name,
      avatar:   payload.avatar ?? undefined,
      provider: payload.provider,
    };
  } catch (err) {
    console.error('[useAuth] JWT parse error:', err);
    return null;
  }
}

export function useAuth() {
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const urlToken  = params.get('token');
    const authError = params.get('auth_error');

    if (authError) {
      setError(`Auth failed: ${authError}`);
      window.history.replaceState({}, '', window.location.pathname);
      setLoading(false);
      return;
    }

    if (urlToken) {
      const parsed = parseJwt(urlToken);
      if (!parsed) {
        setError('Invalid token received');
      } else {
        localStorage.setItem(TOKEN_KEY, urlToken);
        setUser(parsed);
      }
      window.history.replaceState({}, '', window.location.pathname);
      setLoading(false);
      return;
    }

    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      const parsed = parseJwt(stored);
      if (parsed) setUser(parsed);
      else localStorage.removeItem(TOKEN_KEY);
    }
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setError(null);
  }, []);

  const getToken = useCallback(() => localStorage.getItem(TOKEN_KEY), []);
  const clearError = useCallback(() => setError(null), []);

  return { user, loading, logout, getToken, error, clearError };
}
