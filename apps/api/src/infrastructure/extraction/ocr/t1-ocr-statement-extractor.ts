import type { DocumentText, PageText } from '../../../application/ports/document-text.port';
import type { OcrPort } from '../../../application/ports/ocr.port';
import type {
  ExtractionContext,
  StatementExtraction,
  StatementExtractorPort,
  TierSkipped,
} from '../../../application/ports/statement-extractor.port';
import { findAmounts } from '../t0/amounts';
import { T0StatementExtractor } from '../t0/t0-statement-extractor';
import { QUALITY_THRESHOLD, repairPage } from '../t0/text-quality';

/** OCR is slow (~2-4 s/page): cap the pages per document. */
export const MAX_OCR_PAGES = 12;
/** A page with fewer printable characters than this has no usable text layer. */
const MIN_TEXT_CHARS = 30;

export function needsOcr(page: PageText): boolean {
  const chars = page.lines.join('').replace(/\s/g, '').length;
  return chars < MIN_TEXT_CHARS || repairPage(page).quality < QUALITY_THRESHOLD;
}

/**
 * Tier 1: OCR only the pages without a usable text layer, then run the T0 parser again on the
 * merged text (ADR 0002). It runs only after T0 failed, so image-only ad pages in documents T0
 * already resolves are never OCR'd. OCR'd pages with no amounts are counted as non-content (ads).
 * The merged text is handed to the later tiers.
 */
export class T1OcrStatementExtractor implements StatementExtractorPort {
  readonly tier = 'T1' as const;
  private readonly parser = new T0StatementExtractor();

  constructor(private readonly ocr: OcrPort) {}

  async extract(
    text: DocumentText,
    context: ExtractionContext,
  ): Promise<StatementExtraction | TierSkipped> {
    const targets = text.pages.filter(needsOcr).map((p) => p.number);
    if (targets.length === 0) return { skipped: 'no-pages-need-ocr', diagnostics: {} };

    const chosen = targets.slice(0, MAX_OCR_PAGES);
    const started = Date.now();
    const ocrd = await this.ocr.ocrPages(context.pdf, chosen);
    const byNumber = new Map(ocrd.map((p) => [p.number, p]));
    const merged: DocumentText = {
      source: text.source,
      pages: text.pages.map((p) => byNumber.get(p.number) ?? p),
    };
    const result = await this.parser.extract(merged);
    const statement = {
      ...result.statement,
      provenance: { summary: 'T1' as const, transactions: 'T1' as const },
    };
    return {
      statement,
      text: merged,
      diagnostics: {
        ...result.diagnostics,
        ocrPages: chosen.length,
        ocrPagesSkippedByCap: targets.length - chosen.length,
        ocrPagesWithoutAmounts: ocrd.filter((p) => !p.lines.some((l) => findAmounts(l).length > 0))
          .length,
        ocrMs: Date.now() - started,
      },
    };
  }
}
