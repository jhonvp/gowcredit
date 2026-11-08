import type { PageText } from './document-text.port';

/** OCR for pages whose text layer is missing or unreadable (T1, ADR 0002). */
export interface OcrPort {
  /** Rasterizes and recognizes the given 1-based pages; returns them in the same order. */
  ocrPages(pdf: Uint8Array, pages: readonly number[]): Promise<PageText[]>;
}

export const OCR_PORT = Symbol('OcrPort');
