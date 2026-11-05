import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from '../lib/api';
import type { User } from '../types';

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api<User>('/auth/me').then(setUser).catch(logout).finally(() => setLoading(false));
  }, [logout]);

  useEffect(() => {
    window.addEventListener('studyos:unauthorized', logout);
    return () => window.removeEventListener('studyos:unauthorized', logout);
  }, [logout]);

  const authenticate = useCallback(async (path: string, body: object) => {
    const result = await api<{ token: string; user: User }>(path, { method: 'POST', body: JSON.stringify(body) });
    setToken(result.token);
    setUser(result.user);
  }, []);

  const value = useMemo<AuthValue>(() => ({
    user,
    loading,
    login: (email, password) => authenticate('/auth/login', { email, password }),
    signup: (name, email, password) => authenticate('/auth/signup', { name, email, password }),
    logout,
  }), [user, loading, authenticate, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
