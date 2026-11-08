import type {
  CaseView,
  ClarificationView,
  DecisionView,
  DocumentView,
  ExtractionTier,
} from '@gowcredit/contracts';
import { dateTime, money, OUTCOME_LABEL, STATUS_LABEL, TIER } from '../format';

export function TierBadge({ tier }: { tier: ExtractionTier }) {
  return (
    <span className="badge" style={{ background: TIER[tier].color }} title={TIER[tier].label}>
      {tier}
    </span>
  );
}

export function StatusPill({ c }: { c: Pick<CaseView, 'status'> }) {
  return <span className={`pill status-${c.status.toLowerCase()}`}>{STATUS_LABEL[c.status]}</span>;
}

export function DecisionCard({
  decision,
  detailed,
}: {
  decision: DecisionView;
  detailed: boolean;
}) {
  const rules = detailed
    ? decision.rules
    : decision.rules.filter((r) => !r.passed && r.kind !== 'score');
  return (
    <section
      className={`card decision outcome-${decision.outcome.toLowerCase()}`}
      aria-label="Decisión"
    >
      <h3>
        {OUTCOME_LABEL[decision.outcome]}
        {decision.score !== null && <small> · puntaje {decision.score}/100</small>}
      </h3>
      {decision.suggestedAdvance !== null && (
        <p>
          Adelanto sugerido: <strong>{money(decision.suggestedAdvance)}</strong>
        </p>
      )}
      {decision.missing.length > 0 && (
        <>
          <p>Necesitamos:</p>
          <ul>
            {decision.missing.map((m) => (
              <li key={m.code}>
                <code>{m.code}</code> — {m.detail}
              </li>
            ))}
          </ul>
        </>
      )}
      {rules.length > 0 && (
        <table className="rules">
          <thead>
            <tr>
              <th>Regla</th>
              <th>Resultado</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className={r.passed ? 'ok' : 'bad'}>
                <td>
                  <code>{r.id}</code>
                </td>
                <td>
                  {r.points !== undefined ? `${r.points}/${r.maxPoints}` : r.passed ? '✓' : '✗'}
                </td>
                <td>{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">
        Política {decision.policyVersion} · asOf {decision.asOf} · {dateTime(decision.decidedAt)}
      </p>
    </section>
  );
}

function Checks({
  checks,
}: {
  checks: { id: string; passed: boolean; detail: string; blocking: boolean }[];
}) {
  return (
    <ul className="checks">
      {checks.map((c) => (
        <li key={c.id} className={c.passed ? 'ok' : c.blocking ? 'bad' : 'warn'}>
          {c.passed ? '✓' : '✗'} <code>{c.id}</code> {c.detail}
        </li>
      ))}
    </ul>
  );
}

/** Extracted fields coloured by the tier that produced each section, the cascade and the checks. */
export function ExtractionPanel({ doc, analyst }: { doc: DocumentView; analyst: boolean }) {
  if (doc.invoice) {
    const i = doc.invoice;
    return (
      <section className="card">
        <h4>Factura CFDI {i.uuid}</h4>
        <dl className="fields">
          <dt>Emisor</dt>
          <dd>
            {i.issuerRfc} {i.issuerName}
          </dd>
          <dt>Receptor</dt>
          <dd>
            {i.receiverRfc} {i.receiverName}
          </dd>
          <dt>Tipo / método de pago</dt>
          <dd>
            {i.voucherType} / {i.paymentMethod}
          </dd>
          <dt>Total</dt>
          <dd>
            {money(i.total)} (subtotal {money(i.subtotal)}, impuestos {money(i.transferredTaxes)})
          </dd>
        </dl>
        <Checks checks={i.checks.map((c) => ({ ...c, blocking: true }))} />
      </section>
    );
  }
  const e = doc.extraction;
  if (!e) return <p className="muted">Extrayendo {doc.originalName}…</p>;
  const s = e.summary;
  const field = (label: string, value: string, tier: ExtractionTier) => (
    <>
      <dt>{label}</dt>
      <dd style={{ borderLeft: `4px solid ${TIER[tier].color}` }} title={TIER[tier].label}>
        {value}
      </dd>
    </>
  );
  return (
    <section className="card">
      <h4>
        Estado de cuenta {s.bankName ?? ''} · resuelto por <TierBadge tier={e.resolvedBy} />{' '}
        {e.needsReview && <span className="pill status-awaiting_owner">requiere revisión</span>}
      </h4>
      <dl className="fields">
        {field('Periodo', `${s.periodStart ?? '?'} → ${s.periodEnd ?? '?'}`, e.provenance.summary)}
        {field('Saldo inicial', money(s.openingBalance), e.provenance.summary)}
        {field('Saldo final', money(s.closingBalance), e.provenance.summary)}
        {field('Abonos (suma de filas)', money(s.totalCredits), e.provenance.transactions)}
        {field('Cargos (suma de filas)', money(s.totalDebits), e.provenance.transactions)}
        {field('Movimientos', String(e.transactions.length), e.provenance.transactions)}
      </dl>
      {analyst && (
        <>
          <h5>Cascada</h5>
          <ol className="tiers">
            {e.attempts.map((a) => (
              <li key={a.tier}>
                <TierBadge tier={a.tier} />{' '}
                {a.skipped
                  ? `omitido (${a.skipped})`
                  : a.passed
                    ? 'pasó los validadores'
                    : 'no pasó'}
                <span className="muted">
                  {' '}
                  · {a.durationMs} ms{a.costUsd ? ` · $${a.costUsd.toFixed(4)}` : ''}
                </span>
              </li>
            ))}
          </ol>
          <Checks checks={e.checks} />
          <details>
            <summary>Movimientos ({e.transactions.length})</summary>
            <table className="rows">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Cargo</th>
                  <th>Abono</th>
                  <th>Saldo</th>
                  <th>Pág.</th>
                </tr>
              </thead>
              <tbody>
                {e.transactions.slice(0, 500).map((t, i) => (
                  <tr key={i}>
                    <td>{t.date}</td>
                    <td>{t.description}</td>
                    <td>{t.debit ? money(t.debit) : ''}</td>
                    <td>{t.credit ? money(t.credit) : ''}</td>
                    <td>{money(t.balance)}</td>
                    <td>{t.page}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

export function ClarificationHistory({ items }: { items: ClarificationView[] }) {
  if (!items.length) return null;
  return (
    <section className="card" aria-label="Aclaraciones">
      <h4>Aclaraciones con el dueño del documento</h4>
      <ol>
        {items.map((r) => (
          <li key={`${r.round}-${r.createdAt}`}>
            Ronda {r.round} · <strong>{r.status}</strong> · {dateTime(r.createdAt)}
            {r.reason && <div className="muted">Escalado a analista: {r.reason}</div>}
            <ul>
              {r.questions.map((q) => (
                <li key={q.code}>{q.text}</li>
              ))}
            </ul>
            {r.answers && <pre className="answers">{JSON.stringify(r.answers, null, 2)}</pre>}
            {r.forAnalyst?.map((f) => (
              <blockquote key={f.code}>{f.text}</blockquote>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
