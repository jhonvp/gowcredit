// Dev probe: run T0 + validators on PDFs and print a compact report. Usage: tsx scripts/probe-t0.ts <pdf>...
import { readFileSync } from 'node:fs';
import { formatMxn } from '../src/domain/shared/money';
import { totalCredits, totalDebits } from '../src/domain/statement/bank-statement';
import { validateStatement } from '../src/domain/validation/statement-validators';
import { PopplerTextAdapter } from '../src/infrastructure/extraction/pdf/poppler-text.adapter';
import { T0StatementExtractor } from '../src/infrastructure/extraction/t0/t0-statement-extractor';

async function main() {
  const text = new PopplerTextAdapter();
  const t0 = new T0StatementExtractor();
  for (const file of process.argv.slice(2)) {
    const { statement: s, diagnostics } = await t0.extract(await text.extract(readFileSync(file)));
    const v = validateStatement(s);
    const m = (c: number | null) => (c === null ? '—' : formatMxn(c));
    console.log(
      `\n## ${file.split('/').pop()}  ${v.passed ? 'PASS' : 'FAIL ' + v.failedSections.join(',')}`,
    );
    console.log(
      `bank=${s.summary.bankName} cur=${s.summary.currency} period=${s.summary.periodStart}..${s.summary.periodEnd} open=${m(s.summary.openingBalance)} close=${m(s.summary.closingBalance)}`,
    );
    console.log(
      `rows=${s.transactions.length} cr=${m(totalCredits(s))} db=${m(totalDebits(s))} reported cr=${m(s.summary.reportedCredits)} db=${m(s.summary.reportedDebits)}`,
    );
    console.log('diag', JSON.stringify(diagnostics));
    for (const c of v.checks.filter((c) => !c.passed)) console.log(`  ✗ ${c.id}: ${c.detail}`);
    if (process.env.SHOW_ROWS) {
      let prev = s.summary.openingBalance;
      s.transactions.forEach((t, i) => {
        const calc = prev === null ? null : prev + t.credit - t.debit;
        const ok = t.balance === null || calc === null || Math.abs(calc - t.balance) <= 1;
        console.log(
          `${String(i + 1).padStart(3)} p${t.page} ${t.date} ${ok ? ' ' : '✗'} ${t.sideBy.padEnd(13)} cr=${m(t.credit).padStart(12)} db=${m(t.debit).padStart(12)} bal=${m(t.balance).padStart(12)} | ${t.description.slice(0, 50)}`,
        );
        prev = t.balance ?? calc;
      });
    }
  }
}
void main();
