// Dev probe: text quality per page before/after repair. Usage: tsx scripts/probe-quality.ts <pdf>...
import { readFileSync } from 'node:fs';
import { PopplerTextAdapter } from '../src/infrastructure/extraction/pdf/poppler-text.adapter';
import { repairPage } from '../src/infrastructure/extraction/t0/text-quality';

async function main() {
  const adapter = new PopplerTextAdapter();
  for (const file of process.argv.slice(2)) {
    const doc = await adapter.extract(readFileSync(file));
    const pages = doc.pages.map(repairPage);
    const summary = pages
      .map((p) => `${p.number}:${p.quality.toFixed(2)}${p.repair === 'ebcdic' ? 'E' : ''}`)
      .join(' ');
    console.log(file.split('/').pop(), '→', summary);
    const ebcdic = pages.find((p) => p.repair === 'ebcdic');
    if (ebcdic)
      console.log(
        ebcdic.lines
          .filter((l) => /Saldo|\$/.test(l))
          .slice(0, 6)
          .join('\n'),
      );
  }
}
void main();
