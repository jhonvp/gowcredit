import type { Me } from '@gowcredit/contracts';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { onSessionExpired } from './api';

interface Session {
  token: string;
  user: Me;
}
interface AuthState {
  session: Session | null;
  /** The API rejected the token: the login page says why the user is back there. */
  expired: boolean;
  signIn: (s: Session) => void;
  signOut: () => void;
}

const KEY = 'gowcredit.session';
const AuthContext = createContext<AuthState | null>(null);

/**
 * JWT kept in sessionStorage (cleared when the tab closes) so a reload keeps the session. The ADR's
 * httpOnly refresh cookie is a follow-up; the API issues 8-hour tokens.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  });
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    onSessionExpired(() => {
      sessionStorage.removeItem(KEY);
      setSession(null);
      setExpired(true);
    });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      expired,
      signIn: (s) => {
        sessionStorage.setItem(KEY, JSON.stringify(s));
        setExpired(false);
        setSession(s);
      },
      signOut: () => {
        sessionStorage.removeItem(KEY);
        setSession(null);
      },
    }),
    [session, expired],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export function RequireRole({ role, children }: { role: Me['role']; children: ReactNode }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== role) return <Navigate to={homeOf(session.user.role)} replace />;
  return <>{children}</>;
}

export const homeOf = (role: Me['role']) => (role === 'analyst' ? '/analyst' : '/supplier');
