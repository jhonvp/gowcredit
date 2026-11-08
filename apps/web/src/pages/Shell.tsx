import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { homeOf, useAuth } from '../auth';

export function Shell({ title, children }: { title: string; children: ReactNode }) {
  const { session, signOut } = useAuth();
  return (
    <>
      <header className="topbar">
        <Link to={session ? homeOf(session.user.role) : '/'} className="brand">
          GowCredit
        </Link>
        {session && (
          <span>
            {session.user.name} ({session.user.role === 'analyst' ? 'analista' : 'proveedor'}){' '}
            <button type="button" className="link" onClick={signOut}>
              Salir
            </button>
          </span>
        )}
      </header>
      <main>
        <h1>{title}</h1>
        {children}
      </main>
    </>
  );
}
