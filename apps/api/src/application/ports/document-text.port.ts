/**
 * Text layer of a document, page by page, with layout preserved: the column of a character in a
 * line approximates its X position (pdftotext -layout). T0, T1 (OCR) and T2 all produce this shape.
 */
export interface PageText {
  /** 1-based page number. */
  number: number;
  lines: string[];
}

export interface DocumentText {
  pages: PageText[];
  /** Which producer made this text (pdf text layer, OCR, ...) for provenance. */
  source: 'pdf-text-layer' | 'ocr';
}

export interface DocumentTextPort {
  extract(pdf: Uint8Array): Promise<DocumentText>;
}

export const DOCUMENT_TEXT_PORT = Symbol('DocumentTextPort');
