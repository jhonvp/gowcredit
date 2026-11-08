import type { OwnerLinkResponse } from '@gowcredit/contracts';
import { useState } from 'react';
import { api, ApiError } from '../api';
import { dateTime } from '../format';

function linkError(err: unknown): string {
  if (err instanceof ApiError && err.status === 404)
    return 'Generar enlaces está deshabilitado en este entorno.';
  if (err instanceof ApiError && err.status === 409)
    return 'Esta solicitud ya no tiene preguntas abiertas para el dueño.';
  return 'No se pudo generar el enlace. Intente de nuevo.';
}

/**
 * The owner's magic link for the open questions, so the analyst can open it (local demo) or send it
 * another way. Only a hash of the link is stored, so generating one replaces the emailed link: that
 * cannot be undone, so it takes a confirmation.
 */
export function OwnerLinkPanel({ token, caseId }: { token: string; caseId: string }) {
  const [out, setOut] = useState<OwnerLinkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setOut(await api.ownerLink(token, caseId));
      setConfirming(false);
    } catch (err) {
      setError(linkError(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError('No se pudo copiar. Seleccione el enlace y cópielo manualmente.');
    }
  }

  return (
    <section className="card" aria-label="Enlace del dueño">
      <h2 className="h4">Enlace del dueño del documento</h2>
      {out ? (
        <>
          <div className="inline">
            <input
              type="text"
              name="enlace"
              className="grow"
              readOnly
              value={out.link}
              aria-label="Enlace del dueño"
              spellCheck={false}
              onFocus={(e) => e.target.select()}
            />
            <button type="button" onClick={() => void copy(out.link)}>
              Copiar
            </button>
            <a className="button secondary" href={out.link} target="_blank" rel="noreferrer">
              Abrir
            </a>
          </div>
          <p className="muted" aria-live="polite">
            {copied && <strong>Enlace copiado. </strong>}
            Ronda {out.round} · vence el {dateTime(out.expiresAt)} · el enlace enviado por correo ya
            no funciona.
          </p>
        </>
      ) : confirming ? (
        <>
          <p>
            ¿Generar un enlace nuevo? El enlace que recibió el dueño por correo dejará de funcionar.
          </p>
          <div className="inline">
            <button type="button" onClick={() => void generate()} disabled={busy}>
              {busy ? 'Generando…' : 'Sí, generar enlace'}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Genere un enlace nuevo si el dueño no recibió el correo o para responder en esta demo.
          </p>
          <button type="button" onClick={() => setConfirming(true)}>
            Generar enlace
          </button>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
