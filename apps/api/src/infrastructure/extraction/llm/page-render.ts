import type { DocumentText } from '../../../application/ports/document-text.port';
import { QUALITY_THRESHOLD, repairPage, type RepairedPage } from '../t0/text-quality';

/**
 * Page text as the LLM tiers see it: EBCDIC-repaired like T0, layout kept (columns matter),
 * trailing spaces and blank runs removed. Unreadable pages are named, not sent as garbage.
 */
export function repairedPages(text: DocumentText): RepairedPage[] {
  return text.pages.map(repairPage);
}

export function renderPage(page: RepairedPage): string {
  if (page.quality < QUALITY_THRESHOLD)
    return `=== page ${page.number} ===\n[text layer unreadable on this page]`;
  const lines = page.lines.map((l) => l.trimEnd());
  const kept = lines.filter((l, i) => l !== '' || (i > 0 && lines[i - 1] !== ''));
  return `=== page ${page.number} ===\n${kept.join('\n').trim()}`;
}

export const renderDocument = (pages: readonly RepairedPage[]): string =>
  pages.map(renderPage).join('\n\n');
