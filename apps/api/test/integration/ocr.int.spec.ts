import { describe, expect, it } from 'vitest';
import { TesseractOcrAdapter } from '../../src/infrastructure/extraction/ocr/tesseract-ocr.adapter';
import { tinyPdf } from './support/tiny-pdf';

/** Real poppler + Tesseract (spa) from the Docker image on a synthetic page. */
describe('TesseractOcrAdapter (integration)', () => {
  it('rasterizes a page and reads its text', async () => {
    const pdf = tinyPdf([
      'BANCO DEMO ESTADO DE CUENTA',
      'Saldo anterior 1,000.00',
      'Saldo final 1,200.00',
    ]);
    const [page] = await new TesseractOcrAdapter().ocrPages(pdf, [1]);
    const text = page?.lines.join('\n') ?? '';
    expect(page).toMatchObject({ number: 1, source: 'ocr' });
    expect(text).toMatch(/BANCO DEMO/);
    expect(text).toMatch(/1,000\.00/);
    expect(text).toMatch(/1,200\.00/);
  });
});
