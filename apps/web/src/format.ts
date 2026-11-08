import type { CaseStatus, CaseView, DecisionOutcome, ExtractionTier } from '@gowcredit/contracts';

/** Integer cents → "$1,234.56". */
export const money = (cents: number | null | undefined): string =>
  cents == null
    ? '—'
    : (cents / 100).toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
      });

export const dateTime = (iso: string): string =>
  new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

export const STATUS_LABEL: Record<CaseStatus, string> = {
  RECEIVED: 'Recibido',
  EXTRACTING: 'Extrayendo',
  EXTRACTED: 'Extraído',
  AWAITING_OWNER: 'Esperando al dueño del documento',
  DECIDED: 'Decidido',
  FAILED: 'Error',
};

export const OUTCOME_LABEL: Record<DecisionOutcome, string> = {
  QUALIFIES: 'Califica',
  DOES_NOT_QUALIFY: 'No califica',
  NEEDS_INFO: 'Falta información',
};

/** Tier colours: the analyst sees at a glance which tier produced each section (ADR 0011). */
export const TIER: Record<ExtractionTier, { label: string; color: string }> = {
  T0: { label: 'T0 determinístico', color: '#1b7f3b' },
  T1: { label: 'T1 OCR', color: '#2f6fb3' },
  T2: { label: 'T2 clasificador', color: '#7b4bb7' },
  T3: { label: 'T3 Haiku', color: '#c27c0e' },
  T4: { label: 'T4 Opus (agente)', color: '#c2410c' },
  T5: { label: 'T5 dueño', color: '#be185d' },
};

/** Statuses that will change on their own (the worker is busy): keep polling. */
export const isInFlight = (s: CaseStatus) =>
  s === 'RECEIVED' || s === 'EXTRACTING' || s === 'EXTRACTED';

/**
 * Keep polling while the worker still owns the case or still has a document to read. Right after a
 * document is added to a decided case, the status is still DECIDED until the worker picks the job up,
 * so the status alone would stop polling too early. Unreadable (UNKNOWN) documents and failed cases
 * will not change on their own.
 */
export const isCaseInFlight = (c: Pick<CaseView, 'status' | 'documents'>): boolean =>
  isInFlight(c.status) ||
  (c.status !== 'FAILED' &&
    c.documents.some((d) => !d.extraction && !d.invoice && d.docType !== 'UNKNOWN'));
