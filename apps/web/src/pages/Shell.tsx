import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { homeOf, useAuth } from '../auth';
import { useDocumentTitle } from '../useDocumentTitle';

export function Shell({
  title,
  back,
  children,
}: {
  title: string;
  /** Link to the list this screen belongs to. */
  back?: { to: string; label: string };
  children: ReactNode;
}) {
  const { session, signOut } = useAuth();
  useDocumentTitle(title);
  return (
    <>
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <header className="topbar">
        <Link to={session ? homeOf(session.user.role) : '/'} className="brand" translate="no">
          GowCredit
        </Link>
        {session && (
          <span className="topbar-user">
            <span className="truncate">
              {session.user.name} ({session.user.role === 'analyst' ? 'analista' : 'proveedor'})
            </span>
            <button type="button" className="link" onClick={signOut}>
              Cerrar sesión
            </button>
          </span>
        )}
      </header>
      <main id="contenido">
        {back && (
          <p className="back">
            <Link to={back.to}>← {back.label}</Link>
          </p>
        )}
        <h1>{title}</h1>
        {children}
      </main>
    </>
  );
}
