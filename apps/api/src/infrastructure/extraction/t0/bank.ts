import { normalize } from './normalize';
import type { RepairedPage } from './text-quality';

/**
 * Issuer detection from a dictionary of Mexican banks and fintechs. Transaction descriptions name
 * other banks ("ENVIADO A BBVA MEXICO"), so only the first page's header/footer area counts and the
 * most frequent name wins. Unknown issuers return null and are left to later tiers.
 */
const ISSUERS: [name: string, pattern: RegExp][] = [
  ['BBVA', /\bbbva\b/g],
  ['Banamex', /\b(citi)?banamex\b/g],
  ['Santander', /\bsantander\b/g],
  ['HSBC', /\bhsbc\b/g],
  ['Banorte', /\bbanorte\b/g],
  ['Inbursa', /\binbursa\b/g],
  ['Scotiabank', /\bscotiabank\b/g],
  ['Hey Banco', /\bhey,? banco\b/g],
  ['Banregio', /\bbanregio\b/g],
  ['BanBajío', /\bbanbajio\b/g],
  ['Banco Azteca', /\bbanco azteca\b/g],
  ['BanCoppel', /\bbancoppel\b/g],
  ['Afirme', /\bafirme\b/g],
  ['Multiva', /\bmultiva\b/g],
  ['Monex', /\bmonex\b/g],
  ['Banco Base', /\bbanco base\b/g],
  ['Fondeadora', /\bfondea(dora| technologies)\b/g],
  ['Mercado Pago', /\bmercado ?pago\b/g],
  ['Nu', /\bnu mexico\b|\bcuenta nu\b/g],
  ['Klar', /\bklar\b/g],
  ['Stori', /\bstori\b/g],
  ['Albo', /\balbo\b/g],
  ['Spin by OXXO', /\bspin by oxxo\b/g],
];

/** Hey Banco statements also name Banregio (its parent); prefer the brand. */
const BRAND_OVER: Record<string, string> = { Banregio: 'Hey Banco' };

/** Footer lines of every page carry the issuer's legal name; transaction rows are excluded. */
const FOOTER_LINES = 6;

export function detectBank(pages: readonly RepairedPage[]): string | null {
  const first = pages.find((p) => p.lines.some((l) => l.trim().length > 0));
  if (!first) return null;
  const footers = pages.map((p) =>
    p.lines
      .filter((l) => l.trim())
      .slice(-FOOTER_LINES)
      .join('\n'),
  );
  const text = normalize([first.lines.join('\n'), ...footers].join('\n'));
  let best: { name: string; count: number; at: number } | null = null;
  for (const [name, re] of ISSUERS) {
    const hits = [...text.matchAll(re)];
    if (hits.length === 0) continue;
    const cand = { name, count: hits.length, at: hits[0]?.index ?? 0 };
    if (!best || cand.count > best.count || (cand.count === best.count && cand.at < best.at))
      best = cand;
  }
  if (!best) return null;
  const brand = BRAND_OVER[best.name];
  return brand && new RegExp(ISSUERS.find(([n]) => n === brand)?.[1].source ?? '$^').test(text)
    ? brand
    : best.name;
}
