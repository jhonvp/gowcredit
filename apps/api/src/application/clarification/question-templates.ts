import { QUESTION_TYPE, type Question } from '../../domain/clarification/questions';
import type { MissingInfo, MissingInfoCode } from '../../domain/eligibility/engine';
import type { QuestionContext } from '../ports/clarification.ports';

/**
 * Deterministic Spanish questions. Used when the T5 agent is unavailable (replay miss, LLM off) or
 * returns something unusable, so the owner always gets a clear question.
 */
const TEMPLATES: Record<MissingInfoCode, (c: QuestionContext) => string> = {
  INVOICE_DUE_DATE: (c) =>
    `¿Cuál es la fecha de vencimiento de la factura${c.invoiceUuid ? ` ${c.invoiceUuid}` : ''}? El CFDI no incluye esta fecha y la necesitamos para calcular el adelanto.`,
  RFC_CONFIRMATION: () =>
    'El RFC del emisor de la factura es genérico o no tiene un formato válido. ¿Confirma que la factura fue emitida por su empresa?',
  SAT_STATUS: () =>
    'No pudimos verificar en el SAT el estado de la factura. ¿Confirma que la factura está vigente (no fue cancelada)?',
  RECENT_STATEMENT: (c) =>
    `El estado de cuenta que recibimos termina el ${c.periodEnd ?? 'periodo indicado'}. Por favor suba un estado de cuenta de los últimos 90 días.`,
  SUPPLIER_STATEMENT: () =>
    'Para evaluar la factura necesitamos un estado de cuenta bancario reciente del proveedor. Por favor súbalo.',
  STATEMENT_UNREADABLE: () =>
    'Los saldos y movimientos del estado de cuenta no cuadran entre sí. ¿Puede explicarnos la diferencia o subir una versión legible del documento?',
  INVOICE_INCONSISTENT: () =>
    'Los importes de la factura no cuadran (subtotal, impuestos y total). ¿Puede explicarnos la diferencia o subir el XML correcto?',
};

export function templateQuestions(
  missing: readonly MissingInfo[],
  context: QuestionContext,
): Question[] {
  return missing.map((m) => ({
    code: m.code,
    type: QUESTION_TYPE[m.code],
    text: TEMPLATES[m.code](context),
  }));
}
