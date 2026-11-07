/** Lowercase, strip accents. Keeps length 1:1 with the input so column positions stay valid. */
export function normalize(s: string): string {
  let out = '';
  for (const ch of s) {
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += (base.length === 1 ? base : ch).toLowerCase();
  }
  return out;
}
