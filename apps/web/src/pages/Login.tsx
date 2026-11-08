import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { api, ApiError } from '../api';
import { homeOf, useAuth } from '../auth';
import { useDocumentTitle } from '../useDocumentTitle';

export function Login() {
  const { session, signIn, expired } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useDocumentTitle('Iniciar sesión');
  if (session) return <Navigate to={homeOf(session.user.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      signIn({ token: res.accessToken, user: res.user });
      navigate(homeOf(res.user.role));
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="narrow">
      <h1>
        <span translate="no">GowCredit</span> — Pronto pago
      </h1>
      {expired && (
        <p className="notice" role="status">
          Su sesión expiró. Inicie sesión de nuevo para continuar.
        </p>
      )}
      <form className="card" onSubmit={submit}>
        <label>
          Correo
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            spellCheck={false}
            placeholder="nombre@empresa.mx…"
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="muted">Cuentas de prueba: supplier@demo.mx o analyst@demo.mx / demo1234</p>
      </form>
    </main>
  );
}

function loginError(err: unknown): string {
  if (err instanceof ApiError && err.status === 401) return 'Correo o contraseña incorrectos';
  if (err instanceof ApiError && err.status === 429)
    return 'Demasiados intentos. Espere un minuto e intente de nuevo.';
  return 'No se pudo iniciar sesión. Intente de nuevo.';
}
