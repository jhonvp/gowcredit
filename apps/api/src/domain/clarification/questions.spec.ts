import { describe, expect, it } from 'vitest';
import { applyAnswers, InvalidAnswerError } from './questions';

describe('applyAnswers', () => {
  it('turns typed answers into decision facts', () => {
    const { facts, forAnalyst } = applyAnswers({}, [
      { code: 'INVOICE_DUE_DATE', kind: 'date', value: '2025-06-15', text: 'vence el 15 de junio' },
      { code: 'RFC_CONFIRMATION', kind: 'boolean', value: true },
      { code: 'SAT_STATUS', kind: 'boolean', value: false },
    ]);
    expect(facts).toEqual({
      invoiceDueDate: '2025-06-15',
      issuerRfcConfirmed: true,
      satStatus: 'cancelled',
    });
    expect(forAnalyst).toEqual([]);
  });

  it('routes explanations to an analyst without changing facts', () => {
    const r = applyAnswers({ invoiceDueDate: '2025-06-01' }, [
      {
        code: 'STATEMENT_UNREADABLE',
        kind: 'text',
        text: '  El banco cobró intereses que no aparecen.  ',
      },
    ]);
    expect(r.facts).toEqual({ invoiceDueDate: '2025-06-01' });
    expect(r.forAnalyst).toEqual([
      { code: 'STATEMENT_UNREADABLE', text: 'El banco cobró intereses que no aparecen.' },
    ]);
  });

  it('rejects answers of the wrong type, impossible dates and document questions', () => {
    expect(() =>
      applyAnswers({}, [{ code: 'INVOICE_DUE_DATE', kind: 'date', value: '2025-02-30' }]),
    ).toThrow(InvalidAnswerError);
    expect(() =>
      applyAnswers({}, [{ code: 'RFC_CONFIRMATION', kind: 'text', text: 'sí' }]),
    ).toThrow(/sí o no/);
    expect(() => applyAnswers({}, [{ code: 'RECENT_STATEMENT', kind: 'text', text: 'x' }])).toThrow(
      /subiendo/,
    );
  });
});
