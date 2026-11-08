import type {
  CaseView,
  ClarificationView,
  DecisionView,
  DocumentView,
  ExtractionTier,
  ExtractionView,
} from '@gowcredit/contracts';
import { Fragment, memo } from 'react';
import {
  CHECK_LABEL,
  CLARIFICATION_STATUS_LABEL,
  dateOnly,
  dateTime,
  money,
  OUTCOME_LABEL,
  RULE_LABEL,
  SKIP_LABEL,
  STATUS_HELP,
  STATUS_LABEL,
  TIER,
} from '../format';

const MAX_ROWS = 500;

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

/** Current status and what happens next; announced to screen readers when it changes. */
export function CaseStatusLine({ c }: { c: Pick<CaseView, 'status'> }) {
  return (
    <p className="status-line" role="status">
      <StatusPill c={c} /> <span className="muted">{STATUS_HELP[c.status]}</span>
    </p>
  );
}

/** ✓/✗ with its meaning for screen readers: the result is never conveyed by colour alone. */
function Mark({ passed }: { passed: boolean }) {
  return (
    <>
      <span aria-hidden="true">{passed ? '✓' : '✗'}</span>
      <span className="sr-only">{passed ? 'Cumple' : 'No cumple'}</span>
    </>
  );
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
      <h2 className="h3">
        {OUTCOME_LABEL[decision.outcome]}
        {decision.score !== null && <small> · puntaje {decision.score}/100</small>}
      </h2>
      {decision.suggestedAdvance !== null && (
        <p>
          Adelanto sugerido: <strong>{money(decision.suggestedAdvance)}</strong>
        </p>
      )}
      {decision.missing.length > 0 && (
        <>
          <p>Para continuar necesitamos:</p>
          <ul>
            {decision.missing.map((m) => (
              <li key={m.code}>{m.detail}</li>
            ))}
          </ul>
        </>
      )}
      {rules.length > 0 && (
        <div className="table-scroll">
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
                    {RULE_LABEL[r.id] ?? r.id}{' '}
                    {detailed && (
                      <code className="muted" translate="no">
                        {r.id}
                      </code>
                    )}
                  </td>
                  <td className="num">
                    {r.points !== undefined ? (
                      `${r.points}/${r.maxPoints}`
                    ) : (
                      <Mark passed={r.passed} />
                    )}
                  </td>
                  <td>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">
        Política {decision.policyVersion} · evaluada al {dateOnly(decision.asOf)} ·{' '}
        {dateTime(decision.decidedAt)}
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
          {c.passed || c.blocking ? (
            <Mark passed={c.passed} />
          ) : (
            <>
              <span aria-hidden="true">⚠</span> <span className="sr-only">Aviso</span>
            </>
          )}{' '}
          <strong>{CHECK_LABEL[c.id] ?? c.id}:</strong> {c.detail}
        </li>
      ))}
    </ul>
  );
}

const INTERNAL_DESCRIPTION =
  'Movimientos entre las cuentas del mismo titular. El banco los imprime dos veces con signo contrario; no son ingresos ni gastos, así que no cuentan en abonos, cargos ni en la evaluación.';

/** What changes the balance without being income or spending, with its explanation. */
function OtherAmounts({
  summary,
  tier,
}: {
  summary: ExtractionView['summary'];
  tier: ExtractionTier;
}) {
  const { otherItems, internalTransfers } = summary;
  if (otherItems.length === 0 && internalTransfers.pairs === 0) return null;
  const border = { borderLeft: `4px solid ${TIER[tier].color}` };
  return (
    <section aria-label="Otros">
      <h3 className="h5">Otros (no cuentan como abonos ni cargos)</h3>
      <dl className="fields">
        {otherItems.map((o) => (
          <Fragment key={o.concept}>
            <dt>{o.concept}</dt>
            <dd style={border}>{money(o.amount)}</dd>
          </Fragment>
        ))}
        {internalTransfers.pairs > 0 && (
          <>
            <dt>Traspasos internos</dt>
            <dd style={border}>
              {internalTransfers.pairs} traspasos · {money(internalTransfers.amount)}
            </dd>
          </>
        )}
      </dl>
      <details>
        <summary>Ver detalle de estos conceptos</summary>
        <ul>
          {otherItems.map((o) => (
            <li key={o.concept}>
              <strong>{o.concept}:</strong> {o.description}
            </li>
          ))}
          {internalTransfers.pairs > 0 && (
            <li>
              <strong>Traspasos internos:</strong> {INTERNAL_DESCRIPTION}
            </li>
          )}
        </ul>
      </details>
    </section>
  );
}

/** Extracted fields coloured by the tier that produced each section, the cascade and the checks. */
export const ExtractionPanel = memo(function ExtractionPanel({
  doc,
  analyst,
}: {
  doc: DocumentView;
  analyst: boolean;
}) {
  if (doc.invoice) {
    const i = doc.invoice;
    return (
      <section className="card">
        <h2 className="h4 break">Factura CFDI {i.uuid}</h2>
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
  if (!e)
    return (
      <p className="muted">
        {doc.docType === 'UNKNOWN'
          ? `No pudimos identificar ${doc.originalName}. Suba un estado de cuenta en PDF o una factura CFDI en XML.`
          : `Leyendo ${doc.originalName}…`}
      </p>
    );
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
      <h2 className="h4">
        Estado de cuenta {s.bankName ?? ''} · resuelto por <TierBadge tier={e.resolvedBy} />{' '}
        {e.needsReview && <span className="pill status-awaiting_owner">requiere revisión</span>}
      </h2>
      <dl className="fields">
        {field(
          'Periodo',
          `${dateOnly(s.periodStart)} – ${dateOnly(s.periodEnd)}`,
          e.provenance.summary,
        )}
        {field('Saldo inicial', money(s.openingBalance), e.provenance.summary)}
        {field('Saldo final', money(s.closingBalance), e.provenance.summary)}
        {field('Abonos (suma de filas)', money(s.totalCredits), e.provenance.transactions)}
        {field('Cargos (suma de filas)', money(s.totalDebits), e.provenance.transactions)}
        {field(
          'Movimientos',
          String(e.transactions.length - s.internalTransfers.pairs * 2),
          e.provenance.transactions,
        )}
      </dl>
      <OtherAmounts summary={s} tier={e.provenance.summary} />
      {analyst && (
        <>
          <h3 className="h5">Cascada de extracción</h3>
          <ol className="tiers">
            {e.attempts.map((a) => (
              <li key={a.tier}>
                <TierBadge tier={a.tier} />{' '}
                {a.skipped
                  ? `omitido (${SKIP_LABEL[a.skipped] ?? a.skipped})`
                  : a.passed
                    ? 'pasó los validadores'
                    : 'no pasó'}
                <span className="muted">
                  {' '}
                  · {a.durationMs.toLocaleString('es-MX')} ms
                  {a.costUsd ? ` · US$${a.costUsd.toFixed(4)}` : ''}
                </span>
              </li>
            ))}
          </ol>
          <Checks checks={e.checks} />
          <details>
            <summary>Movimientos ({e.transactions.length})</summary>
            {e.transactions.length > MAX_ROWS && (
              <p className="muted">
                Se muestran los primeros {MAX_ROWS} de {e.transactions.length} movimientos.
              </p>
            )}
            <div className="table-scroll">
              <table className="rows">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Descripción</th>
                    <th className="num">Cargo</th>
                    <th className="num">Abono</th>
                    <th className="num">Saldo</th>
                    <th className="num">Pág.</th>
                  </tr>
                </thead>
                <tbody>
                  {e.transactions.slice(0, MAX_ROWS).map((t, i) => (
                    <tr key={i} className={t.internal ? 'internal' : undefined}>
                      <td className="nowrap">{dateOnly(t.date)}</td>
                      <td className="break">
                        {t.description}{' '}
                        {t.internal && <span className="pill">Traspaso interno</span>}
                      </td>
                      <td className="num">{t.debit ? money(t.debit) : ''}</td>
                      <td className="num">{t.credit ? money(t.credit) : ''}</td>
                      <td className="num">{money(t.balance)}</td>
                      <td className="num">{t.page}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
});

/** An answer as the owner gave it: the raw value is a date, yes/no or free text. */
function answerText(a: Record<string, unknown>): string {
  const parts: string[] = [];
  if (a.value === true) parts.push('Sí');
  else if (a.value === false) parts.push('No');
  else if (typeof a.value === 'string') parts.push(a.value);
  if (typeof a.text === 'string' && a.text.trim()) parts.push(a.text.trim());
  return parts.join(' · ') || 'Sin respuesta';
}

export function ClarificationHistory({ items }: { items: ClarificationView[] }) {
  if (!items.length) return null;
  return (
    <section className="card" aria-label="Aclaraciones">
      <h2 className="h4">Aclaraciones con el dueño del documento</h2>
      <ol>
        {items.map((r) => (
          <li key={`${r.round}-${r.createdAt}`}>
            Ronda {r.round} · <strong>{CLARIFICATION_STATUS_LABEL[r.status]}</strong> ·{' '}
            {dateTime(r.createdAt)}
            {r.reason && <div className="muted">Escalado a analista: {r.reason}</div>}
            <ul>
              {r.questions.map((q) => (
                <li key={q.code}>{q.text}</li>
              ))}
            </ul>
            {r.answers && r.answers.length > 0 && (
              <div className="answers">
                <strong>Respuestas:</strong>
                <ul>
                  {r.answers.map((a, i) => (
                    <li key={i}>{answerText(a)}</li>
                  ))}
                </ul>
              </div>
            )}
            {r.forAnalyst?.map((f) => (
              <blockquote key={f.code}>{f.text}</blockquote>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
