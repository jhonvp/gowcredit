import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { DocumentText, DocumentTextPort } from '../../../application/ports/document-text.port';

const run = promisify(execFile);

/**
 * Adapter: PDF text layer via poppler's `pdftotext -layout` (installed in the Docker image).
 * -layout keeps columns aligned with spaces, which the T0 table parser relies on.
 */
export class PopplerTextAdapter implements DocumentTextPort {
  async extract(pdf: Uint8Array): Promise<DocumentText> {
    const dir = await mkdtemp(join(tmpdir(), 'gow-pdf-'));
    const file = join(dir, 'doc.pdf');
    try {
      await writeFile(file, pdf);
      const { stdout } = await run('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], {
        maxBuffer: 64 * 1024 * 1024,
      });
      return { source: 'pdf-text-layer', pages: splitPages(stdout) };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/** pdftotext separates pages with form feeds. The trailing form feed yields an empty last chunk. */
export function splitPages(text: string): DocumentText['pages'] {
  const chunks = text.split('\f');
  if (chunks.length > 1 && chunks[chunks.length - 1]?.trim() === '') chunks.pop();
  return chunks.map((chunk, i) => ({ number: i + 1, lines: chunk.split('\n') }));
}
