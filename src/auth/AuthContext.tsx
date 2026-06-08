import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, apiFetch } from '../lib/api';
import type { AuthUser } from '../types/auth';
import { AuthContext, type AuthContextValue } from './context';
import { clearSessionHint, hasSessionHint, markSessionHint } from './sessionHint';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(() => !hasSessionHint());
  const refreshInFlightRef = useRef<Promise<AuthUser | null> | null>(null);

  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const pending = (async (): Promise<AuthUser | null> => {
      setLoading(true);
      try {
        const me = await apiFetch<AuthUser>('/auth/me');
        setUser(me);
        markSessionHint();
        return me;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          clearSessionHint();
        }
        return null;
      } finally {
        setLoading(false);
      }
    })();

    refreshInFlightRef.current = pending;
    try {
      return await pending;
    } finally {
      if (refreshInFlightRef.current === pending) {
        refreshInFlightRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!hasSessionHint()) {
      setSessionChecked(true);
      return;
    }
    void refreshSession().finally(() => {
      setSessionChecked(true);
    });
  }, [refreshSession]);

  const logout = useCallback(async () => {
    try {
      await apiFetch<{ success: boolean }>('/auth/logout', {
        method: 'POST',
      });
    } finally {
      setUser(null);
      clearSessionHint();
      setSessionChecked(true);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      sessionChecked,
      refreshSession,
      setUser,
      logout,
    }),
    [loading, logout, refreshSession, sessionChecked, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
