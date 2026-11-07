import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { api, ApiError } from '../api';
import { homeOf, useAuth } from '../auth';

export function Login() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Correo o contraseña incorrectos'
          : 'No se pudo iniciar sesión',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="narrow">
      <h1>GowCredit — Pronto pago</h1>
      <form className="card" onSubmit={submit}>
        <label>
          Correo
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
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
          Entrar
        </button>
        <p className="muted">Demo: supplier@demo.mx o analyst@demo.mx / demo1234</p>
      </form>
    </main>
  );
}
