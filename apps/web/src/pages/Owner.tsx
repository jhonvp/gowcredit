import type {
  OwnerAnswerResponse,
  OwnerAnswersRequest,
  OwnerRequestView,
} from '@gowcredit/contracts';
import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api, ApiError } from '../api';
import { OUTCOME_LABEL, STATUS_LABEL } from '../format';

type Values = Record<string, { value?: string | boolean; text?: string; file?: File }>;

/**
 * Document owner page (magic link). No login: the token in the URL is the only credential, it shows
 * only this case's open questions, and it stops working after the answers are sent.
 */
export function OwnerPage() {
  const { token = '' } = useParams();
  const [request, setRequest] = useState<OwnerRequestView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Values>({});
  const [result, setResult] = useState<OwnerAnswerResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.owner
      .request(token)
      .then(setRequest, (e: unknown) =>
        setError(
          e instanceof ApiError && e.status === 401
            ? 'Este enlace ya fue usado o expiró.'
            : 'No pudimos abrir su solicitud.',
        ),
      );
  }, [token]);

  const set = (code: string, patch: Values[string]) =>
    setValues((v) => ({ ...v, [code]: { ...v[code], ...patch } }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      for (const q of request.questions) {
        const f = values[q.code]?.file;
        if (q.type === 'upload_document' && f) await api.owner.upload(token, f);
      }
      const answers: OwnerAnswersRequest['answers'] = request.questions
        .filter((q) => q.type !== 'upload_document')
        .map((q) => ({ code: q.code, value: values[q.code]?.value, text: values[q.code]?.text }))
        .filter((a) => a.value !== undefined || (a.text ?? '').trim() !== '');
      setResult(await api.owner.answer(token, { answers }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos enviar sus respuestas.');
    } finally {
      setBusy(false);
    }
  }

  if (result)
    return (
      <main className="narrow">
        <h1>¡Gracias!</h1>
        <p role="status">
          Recibimos sus respuestas.{' '}
          {result.pendingDocuments
            ? 'Estamos revisando el documento que subió.'
            : result.outcome
              ? `Resultado: ${OUTCOME_LABEL[result.outcome]}.`
              : `Estado: ${STATUS_LABEL[result.status]}.`}
        </p>
      </main>
    );

  return (
    <main className="narrow">
      <h1>GowCredit — información pendiente</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {request && (
        <form className="card" onSubmit={submit}>
          {request.questions.map((q) => (
            <fieldset key={q.code}>
              <legend>{q.text}</legend>
              {q.type === 'provide_value' && (
                <label>
                  Fecha
                  <input
                    type="date"
                    aria-label={`Respuesta ${q.code}`}
                    onChange={(e) => set(q.code, { value: e.target.value || undefined })}
                  />
                </label>
              )}
              {q.type === 'confirm_value' && (
                <div className="inline">
                  <label>
                    <input
                      type="radio"
                      name={q.code}
                      onChange={() => set(q.code, { value: true })}
                    />{' '}
                    Sí
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={q.code}
                      onChange={() => set(q.code, { value: false })}
                    />{' '}
                    No
                  </label>
                </div>
              )}
              {q.type === 'upload_document' && (
                <input
                  type="file"
                  accept=".pdf,.xml"
                  aria-label={`Documento ${q.code}`}
                  onChange={(e) => set(q.code, { file: e.target.files?.[0] })}
                />
              )}
              {(q.type === 'explain_discrepancy' || q.type === 'provide_value') && (
                <label>
                  {q.type === 'explain_discrepancy'
                    ? 'Explicación'
                    : 'O escríbalo con sus palabras'}
                  <textarea
                    rows={q.type === 'explain_discrepancy' ? 4 : 1}
                    onChange={(e) => set(q.code, { text: e.target.value })}
                  />
                </label>
              )}
            </fieldset>
          ))}
          <button type="submit" disabled={busy}>
            Enviar respuestas
          </button>
          {request.expiresAt && (
            <p className="muted">
              El enlace vence el {new Date(request.expiresAt).toLocaleDateString('es-MX')} y es de
              un solo uso.
            </p>
          )}
        </form>
      )}
    </main>
  );
}
