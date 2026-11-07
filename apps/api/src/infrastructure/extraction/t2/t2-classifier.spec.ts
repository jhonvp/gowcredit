import { describe, expect, it } from 'vitest';
import type { DocumentText } from '../../../application/ports/document-text.port';
import { validateStatement } from '../../../domain/validation/statement-validators';
import { T0StatementExtractor } from '../t0/t0-statement-extractor';
import { classifyPages, T2ClassifierStatementExtractor } from './t2-classifier-statement-extractor';

/**
 * Synthetic statement whose column header uses words T0 does not know ("SALIDAS", "ENTRADAS",
 * "DISPONIBLE"), so T0 finds no table. The trained classifier still finds the rows.
 */
const text: DocumentText = {
  source: 'pdf-text-layer',
  pages: [
    {
      number: 1,
      lines: [
        'BANCO DEMO                                   ESTADO DE CUENTA',
        'Periodo: del 01/03/2025 al 31/03/2025',
        'Saldo anterior                               1,000.00',
        'Saldo final                                  1,190.00',
        '',
        'FECHA        MOVIMIENTO                  SALIDAS       ENTRADAS      DISPONIBLE',
        '05/03/2025   DEPOSITO CLIENTE ACME                      500.00        1,500.00',
        '             REF 0099812',
        '20/03/2025   PAGO PROVEEDOR XYZ          300.00                       1,200.00',
        '28/03/2025   COMISION MANEJO              10.00                       1,190.00',
        '',
        'Gracias por su preferencia.',
      ],
    },
  ],
};
const ctx = { documentId: 'd', pdf: new Uint8Array(), previous: null };

describe('T2ClassifierStatementExtractor (trained weights)', () => {
  it('labels dated rows and their continuation lines', () => {
    const labels = classifyPages(text).map((l) => [l.line, l.label]);
    expect(labels).toEqual(
      expect.arrayContaining([
        [6, 'transaction_row'],
        [7, 'continuation'],
        [8, 'transaction_row'],
        [9, 'transaction_row'],
      ]),
    );
  });

  it('recovers rows T0 cannot find and decides sides by the running balance', async () => {
    const t0 = await new T0StatementExtractor().extract(text);
    expect(t0.statement.transactions).toHaveLength(0);

    const out = await new T2ClassifierStatementExtractor().extract(text, ctx);
    if ('skipped' in out) throw new Error('unexpected skip');
    expect(out.statement.transactions.map((t) => [t.date, t.debit, t.credit, t.sideBy])).toEqual([
      ['2025-03-05', 0, 50_000, 'balance-delta'],
      ['2025-03-20', 30_000, 0, 'balance-delta'],
      ['2025-03-28', 1_000, 0, 'balance-delta'],
    ]);
    expect(out.statement.provenance).toEqual({ summary: 'T0', transactions: 'T2' });
    expect(validateStatement(out.statement).passed).toBe(true);
  });
});
