import type { OwnerLinkResponse } from '@gowcredit/contracts';
import { useState } from 'react';
import { api, ApiError } from '../api';
import { dateTime } from '../format';

/**
 * The owner's magic link for the open questions, so the analyst can open it (local demo) or send it
 * another way. Only a hash of the link is stored, so generating one replaces the emailed link.
 */
export function OwnerLinkPanel({ token, caseId }: { token: string; caseId: string }) {
  const [out, setOut] = useState<OwnerLinkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setOut(await api.ownerLink(token, caseId));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'Compartir el link del dueño está deshabilitado en este entorno (OWNER_LINK_SHARING).'
          : err instanceof ApiError && err.status === 409
            ? 'Este caso ya no tiene preguntas abiertas para el dueño.'
            : 'No se pudo generar el link',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-label="Link del dueño">
      <h4>Link del dueño del documento</h4>
      {out ? (
        <>
          <p className="inline">
            <input
              type="text"
              readOnly
              value={out.link}
              aria-label="Link del dueño"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(out.link).then(() => setCopied(true))}
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <a href={out.link} target="_blank" rel="noreferrer">
              Abrir
            </a>
          </p>
          <p className="muted">
            Ronda {out.round} · vence {dateTime(out.expiresAt)} · el link enviado por correo ya no
            funciona.
          </p>
        </>
      ) : (
        <>
          <p className="muted">
            Genera un link nuevo para responder las preguntas abiertas. El link enviado por correo
            dejará de funcionar.
          </p>
          <button type="button" onClick={generate} disabled={busy}>
            Generar link
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
