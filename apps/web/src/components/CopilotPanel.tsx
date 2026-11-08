import type { CopilotResponse } from '@gowcredit/contracts';
import { type FormEvent, useState } from 'react';
import { api, ApiError } from '../api';

/** Analyst copilot (ADR 0010): read-only questions about this case's decision and provenance. */
export function CopilotPanel({ token, caseId }: { token: string; caseId: string }) {
  const [question, setQuestion] = useState('¿Por qué se tomó esta decisión?');
  const [answer, setAnswer] = useState<CopilotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setAnswer(await api.copilot(token, caseId, question));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'El copiloto no respondió');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-label="Copiloto">
      <h4>Copiloto del analista</h4>
      <form onSubmit={ask} className="inline">
        <input
          type="text"
          aria-label="Pregunta al copiloto"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={1000}
          style={{ flex: 1, padding: '6px 8px' }}
        />
        <button type="submit" disabled={busy || !question.trim()}>
          Preguntar
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {answer && (
        <div role="status">
          <p>{answer.answer}</p>
          <p className="muted">
            {answer.by === 'agent'
              ? `Respondido por el agente (Haiku, ${answer.turns} turnos, $${answer.costUsd.toFixed(4)})`
              : 'Resumen determinístico de la traza (LLM no disponible)'}
            {answer.citations.length > 0 && ` · ${answer.citations.join(', ')}`}
          </p>
        </div>
      )}
    </section>
  );
}
