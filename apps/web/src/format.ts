import type {
  CaseStatus,
  CaseView,
  ClarificationView,
  DecisionOutcome,
  ExtractionTier,
} from '@gowcredit/contracts';
import { ApiError } from './api';

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

/** "2026-10-31" → "31 oct 2026". Bank dates have no time zone: never let the browser shift them. */
export const dateOnly = (iso: string | null | undefined): string =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-MX', {
        dateStyle: 'medium',
        timeZone: 'UTC',
      })
    : '—';

export const STATUS_LABEL: Record<CaseStatus, string> = {
  RECEIVED: 'Recibido',
  EXTRACTING: 'Extrayendo',
  EXTRACTED: 'Extraído',
  AWAITING_OWNER: 'Esperando al dueño del documento',
  DECIDED: 'Decidido',
  FAILED: 'Error',
};

/** What is happening and what comes next, in one sentence. */
export const STATUS_HELP: Record<CaseStatus, string> = {
  RECEIVED: 'Recibimos su documento y pronto empezaremos a leerlo.',
  EXTRACTING: 'Estamos leyendo su documento. Puede tardar hasta un par de minutos.',
  EXTRACTED: 'Documento leído. Estamos evaluando la solicitud.',
  AWAITING_OWNER: 'Enviamos las preguntas por correo. La evaluación sigue en cuanto respondan.',
  DECIDED: 'La evaluación terminó. Si agrega otro documento, se evalúa de nuevo.',
  FAILED: 'No pudimos procesar el documento. Intente subirlo de nuevo.',
};

export const CLARIFICATION_STATUS_LABEL: Record<ClarificationView['status'], string> = {
  open: 'Abierta',
  answered: 'Respondida',
  superseded: 'Reemplazada',
  escalated: 'Escalada a un analista',
};

/** Names of the policy rules (docs/eligibility-policy.md); the id stays visible for analysts. */
export const RULE_LABEL: Record<string, string> = {
  'I1-I2': 'Estado de cuenta íntegro',
  'I1-I3': 'Factura íntegra',
  I4: 'RFC válidos',
  'S-K1': 'Moneda',
  'S-K2': 'Estado de cuenta reciente',
  'S-K3': 'Saldos no negativos',
  'S-S1': 'Abonos mensuales',
  'S-S2': 'Liquidez',
  'S-S3': 'Movimientos devueltos',
  'S-S4': 'Concentración de pagadores',
  'S-S5': 'Abonos contra cargos',
  'C-K1': 'Tipo de comprobante',
  'C-K2': 'Método de pago',
  'C-K3': 'Comprador ancla',
  'C-K4': 'Vencimiento',
  'C-K5': 'Monto de la factura',
  'C-K6': 'Vigencia en el SAT',
  SCORE: 'Puntaje total',
};

export const CHECK_LABEL: Record<string, string> = {
  'required-fields': 'Datos obligatorios',
  'period-valid': 'Periodo',
  'rows-present': 'Movimientos',
  'rows-well-formed': 'Formato de los movimientos',
  'rows-reconcile': 'Cuadre de saldos',
  'running-balance': 'Saldo por movimiento',
  'dates-in-period': 'Fechas',
  'reported-totals': 'Totales del banco',
  'rows-as-printed': 'Movimientos como en el documento',
  'cfdi-required-fields': 'Datos obligatorios',
  'cfdi-arithmetic': 'Cuadre de importes',
  'cfdi-rfcs': 'RFC',
};

/** Why a cascade tier did not run. */
export const SKIP_LABEL: Record<string, string> = {
  'no-pages-need-ocr': 'ninguna página necesita OCR',
  'no-period': 'no se encontró el periodo',
  'nothing-to-repair': 'no hay nada que reparar',
  'invalid-output': 'respuesta inválida del modelo',
  'fixture-missing': 'sin respuesta grabada',
  disabled: 'modelo de IA desactivado',
};

/**
 * The message to show for a failed request. The API writes its own errors in Spanish, but statuses
 * answered by the framework or the proxy (401, 403, 413, 5xx) carry English defaults.
 */
export function errorText(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  if (err.status === 413) return 'El archivo pesa más de 20 MB.';
  if (err.status === 403) return 'Su cuenta no tiene permiso para esta acción.';
  if (err.status === 401 || err.status >= 500) return fallback;
  return err.message;
}

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
  T3: { label: 'T3 Haiku', color: '#a16207' },
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
