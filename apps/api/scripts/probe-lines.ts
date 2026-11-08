// Dev probe: print repaired lines of one page. Usage: tsx scripts/probe-lines.ts <pdf> <page> [from] [to]
import { readFileSync } from 'node:fs';
import { PopplerTextAdapter } from '../src/infrastructure/extraction/pdf/poppler-text.adapter';
import { repairPage } from '../src/infrastructure/extraction/t0/text-quality';

async function main() {
  const [file, page, from = '0', to = '60'] = process.argv.slice(2);
  const doc = await new PopplerTextAdapter().extract(readFileSync(file as string));
  const p = repairPage(doc.pages[Number(page) - 1] as never);
  p.lines
    .slice(Number(from), Number(to))
    .forEach((l, i) => console.log(String(i + Number(from)).padStart(3), '|' + l));
}
void main();
