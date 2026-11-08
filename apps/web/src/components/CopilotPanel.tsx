import type { CopilotResponse } from '@gowcredit/contracts';
import { type FormEvent, useState } from 'react';
import { api } from '../api';
import { errorText } from '../format';

const usd = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });

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
      setError(errorText(err, 'El copiloto no respondió. Intente de nuevo.'));
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
          name="pregunta"
          aria-label="Pregunta al copiloto"
          autoComplete="off"
          className="grow"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={1000}
        />
        <button type="submit" disabled={busy || !question.trim()}>
          {busy ? 'Preguntando…' : 'Preguntar'}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {answer && (
        <div role="status">
          <p className="answer">{answer.answer}</p>
          <p className="muted">
            {answer.by === 'agent'
              ? `Respondido por el agente de IA (${answer.turns} turnos, ${usd(answer.costUsd)})`
              : 'Resumen automático de la decisión (modelo de IA no disponible)'}
            {answer.citations.length > 0 && ` · Referencias: ${answer.citations.join(', ')}`}
          </p>
        </div>
      )}
    </section>
  );
}
