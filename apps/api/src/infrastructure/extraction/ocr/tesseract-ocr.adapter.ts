import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { PageText } from '../../../application/ports/document-text.port';
import type { OcrPort } from '../../../application/ports/ocr.port';

const run = promisify(execFile);

/**
 * OCR adapter: poppler rasterizes one page at 300 dpi (grayscale), Tesseract reads it with the
 * Spanish model. `--psm 6` treats the page as one block of text (statement tables), and
 * `preserve_interword_spaces` keeps column gaps so the layout parser still sees columns.
 */
export class TesseractOcrAdapter implements OcrPort {
  constructor(private readonly timeoutMs = 60_000) {}

  async ocrPages(pdf: Uint8Array, pages: readonly number[]): Promise<PageText[]> {
    const dir = await mkdtemp(join(tmpdir(), 'gow-ocr-'));
    const file = join(dir, 'doc.pdf');
    try {
      await writeFile(file, pdf);
      const out: PageText[] = [];
      for (const page of pages) {
        const image = join(dir, `p${page}`);
        await run(
          'pdftoppm',
          [
            '-r',
            '300',
            '-gray',
            '-png',
            '-f',
            String(page),
            '-l',
            String(page),
            '-singlefile',
            file,
            image,
          ],
          { timeout: this.timeoutMs },
        );
        const { stdout } = await run(
          'tesseract',
          [
            `${image}.png`,
            'stdout',
            '-l',
            'spa',
            '--psm',
            '6',
            '-c',
            'preserve_interword_spaces=1',
          ],
          { timeout: this.timeoutMs, maxBuffer: 16 * 1024 * 1024 },
        );
        out.push({ number: page, lines: stdout.split('\n'), source: 'ocr' });
      }
      return out;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
