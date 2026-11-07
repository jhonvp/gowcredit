import { describe, expect, it, vi } from 'vitest';
import type { DocumentText } from '../../../application/ports/document-text.port';
import type { OcrPort } from '../../../application/ports/ocr.port';
import { needsOcr, T1OcrStatementExtractor } from './t1-ocr-statement-extractor';

/** Synthetic statement: page 1 has a text layer (summary), page 2 is an image (no text). */
const text: DocumentText = {
  source: 'pdf-text-layer',
  pages: [
    {
      number: 1,
      lines: [
        'BANCO DEMO                       ESTADO DE CUENTA',
        'Periodo: del 01/03/2025 al 31/03/2025',
        'Saldo anterior                   1,000.00',
        'Saldo final                      1,200.00',
      ],
    },
    { number: 2, lines: ['', ' '] },
  ],
};
const scannedTable = [
  'FECHA        CONCEPTO                    CARGOS        ABONOS         SALDO',
  '05/03/2025   DEPOSITO CLIENTE                          500.00      1,500.00',
  '20/03/2025   PAGO PROVEEDOR              300.00                    1,200.00',
];
const context = { documentId: 'd', pdf: new Uint8Array([1]), previous: null };

describe('T1OcrStatementExtractor', () => {
  it('OCRs only pages without text, reparses, and hands the merged text forward', async () => {
    const ocr: OcrPort = {
      ocrPages: vi.fn(async (_pdf: Uint8Array, pages: readonly number[]) =>
        pages.map((n) => ({ number: n, lines: scannedTable, source: 'ocr' as const })),
      ),
    };
    const out = await new T1OcrStatementExtractor(ocr).extract(text, context);
    if ('skipped' in out) throw new Error('unexpected skip');
    expect(ocr.ocrPages).toHaveBeenCalledWith(context.pdf, [2]);
    expect(out.statement.transactions.map((t) => [t.debit, t.credit])).toEqual([
      [0, 50_000],
      [30_000, 0],
    ]);
    expect(out.statement.provenance).toEqual({ summary: 'T1', transactions: 'T1' });
    expect(out.text?.pages[1]?.source).toBe('ocr');
    expect(out.diagnostics).toMatchObject({ ocrPages: 1, ocrPagesWithoutAmounts: 0 });
  });

  it('skips when every page has a usable text layer', async () => {
    const ocr: OcrPort = { ocrPages: vi.fn() };
    const full = { ...text, pages: [text.pages[0]!] };
    expect(await new T1OcrStatementExtractor(ocr).extract(full, context)).toMatchObject({
      skipped: 'no-pages-need-ocr',
    });
    expect(ocr.ocrPages).not.toHaveBeenCalled();
  });

  it('flags blank and unreadable pages', () => {
    expect(needsOcr({ number: 1, lines: ['  12  '] })).toBe(true);
    expect(needsOcr(text.pages[0]!)).toBe(false);
  });
});
