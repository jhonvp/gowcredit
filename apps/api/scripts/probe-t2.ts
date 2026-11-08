// Debug helper: prints T2 line labels for one PDF. Usage: tsx scripts/probe-t2.ts <file> [page]
import { readFileSync } from 'node:fs';
import { PopplerTextAdapter } from '../src/infrastructure/extraction/pdf/poppler-text.adapter';
import { classifyPages } from '../src/infrastructure/extraction/t2/t2-classifier-statement-extractor';

async function main() {
  const [file, page] = process.argv.slice(2);
  const text = await new PopplerTextAdapter().extract(readFileSync(file as string));
  for (const l of classifyPages(text)) {
    if (page && l.page !== Number(page)) continue;
    console.log(
      `${l.page}:${String(l.line).padStart(3)} ${l.label.padEnd(15)} ${l.p.toFixed(2)} | ${l.text.slice(0, 110)}`,
    );
  }
}
void main();
