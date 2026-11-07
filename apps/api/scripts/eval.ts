// Extraction eval (make eval). Runs the extraction use case over the dataset and scores it against
// eval/ground-truth. Writes eval/reports/latest.{md,json}. See eval/README.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { LoggerPort } from '../src/application/ports/logger.port';
import { ExtractBankStatementUseCase } from '../src/application/use-cases/extract-bank-statement.use-case';
import { formatMxn, toCents } from '../src/domain/shared/money';
import { totalCredits, totalDebits } from '../src/domain/statement/bank-statement';
import { PopplerTextAdapter } from '../src/infrastructure/extraction/pdf/poppler-text.adapter';
import { T0StatementExtractor } from '../src/infrastructure/extraction/t0/t0-statement-extractor';

const ROOT = resolve(__dirname, '../../..');
const DATASET = resolve(process.env.EVAL_DATASET_DIR ?? join(ROOT, 'facturas'));
const GROUND_TRUTH = join(ROOT, 'eval/ground-truth');
const REPORTS = join(ROOT, 'eval/reports');

interface GroundTruth {
  file: string;
  bankName: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
  transactionCount: number | null;
  knownAnomalies: string[];
}

const FIELDS = [
  'bankName',
  'currency',
  'periodStart',
  'periodEnd',
  'openingBalance',
  'closingBalance',
  'totalCredits',
  'totalDebits',
  'transactionCount',
] as const;
type Field = (typeof FIELDS)[number];
const MONEY: ReadonlySet<Field> = new Set([
  'openingBalance',
  'closingBalance',
  'totalCredits',
  'totalDebits',
]);

const quiet: LoggerPort = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

interface DocResult {
  file: string;
  scored: { field: Field; expected: string; actual: string; ok: boolean }[];
  resolvedBy: string;
  needsReview: boolean;
  failedChecks: string[];
  expectedFlag: boolean;
  rows: number;
  durationMs: number;
  tiers: string;
}

async function main(): Promise<void> {
  if (!existsSync(DATASET))
    throw new Error(`Dataset not found: ${DATASET} (put the PDFs in facturas/)`);
  const useCase = new ExtractBankStatementUseCase(
    new PopplerTextAdapter(),
    [new T0StatementExtractor()],
    quiet,
  );
  const files = readdirSync(GROUND_TRUTH)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const results: DocResult[] = [];

  for (const gtFile of files) {
    const gt = JSON.parse(readFileSync(join(GROUND_TRUTH, gtFile), 'utf8')) as GroundTruth;
    const pdfPath = join(DATASET, gt.file);
    if (!existsSync(pdfPath)) {
      console.warn(`skip ${gt.file}: PDF not found`);
      continue;
    }
    const started = Date.now();
    const out = await useCase.execute(readFileSync(pdfPath), { documentId: gt.file });
    const s = out.statement;
    const actual: Record<Field, string | number | null> = {
      bankName: s.summary.bankName,
      currency: s.summary.currency,
      periodStart: s.summary.periodStart,
      periodEnd: s.summary.periodEnd,
      openingBalance: s.summary.openingBalance,
      closingBalance: s.summary.closingBalance,
      totalCredits: s.transactions.length ? totalCredits(s) : null,
      totalDebits: s.transactions.length ? totalDebits(s) : null,
      transactionCount: s.transactions.length,
    };
    const scored = FIELDS.filter((f) => gt[f] !== null).map((field) => {
      const exp = MONEY.has(field) ? toCents(gt[field] as number) : gt[field];
      const act = actual[field];
      const ok =
        typeof exp === 'string' && typeof act === 'string'
          ? exp.toLowerCase() === act.toLowerCase()
          : exp === act;
      const show = (v: unknown) =>
        v === null || v === undefined ? '—' : MONEY.has(field) ? formatMxn(v as number) : String(v);
      return { field, expected: show(exp), actual: show(act), ok };
    });
    results.push({
      file: gt.file,
      scored,
      resolvedBy: out.resolvedBy,
      needsReview: out.needsReview,
      failedChecks: out.validation.checks
        .filter((c) => c.blocking && !c.passed)
        .map((c) => `${c.id}: ${c.detail}`),
      expectedFlag: gt.knownAnomalies.length > 0,
      rows: s.transactions.length,
      durationMs: Date.now() - started,
      tiers: out.attempts.map((a) => `${a.tier}${a.passed ? '✓' : '✗'}`).join(' → '),
    });
  }

  const report = summarize(results);
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(join(REPORTS, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(REPORTS, 'latest.md'), toMarkdown(report));
  console.log(toMarkdown(report));
}

function summarize(results: DocResult[]) {
  const all = results.flatMap((r) => r.scored);
  const byField = FIELDS.map((field) => {
    const s = all.filter((x) => x.field === field);
    return { field, correct: s.filter((x) => x.ok).length, total: s.length };
  });
  return {
    generatedAt: new Date().toISOString(),
    pipeline: 'T0 (deterministic)',
    documents: results.length,
    fieldAccuracy: { correct: all.filter((x) => x.ok).length, total: all.length },
    documentsFullyCorrect: results.filter((r) => r.scored.every((x) => x.ok)).length,
    passedValidation: results.filter((r) => !r.needsReview).length,
    anomalyFlags: {
      expected: results.filter((r) => r.expectedFlag).length,
      flagged: results.filter((r) => r.expectedFlag && r.needsReview).length,
      falseFlags: results.filter((r) => !r.expectedFlag && r.needsReview).map((r) => r.file),
    },
    byField,
    results,
  };
}

function toMarkdown(r: ReturnType<typeof summarize>): string {
  const pct = (a: number, b: number) => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`);
  const lines = [
    '# Extraction eval report',
    '',
    `Generated by \`make eval\`. Pipeline: **${r.pipeline}**. Ground truth: \`eval/ground-truth\` (see \`eval/README.md\`).`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Field accuracy | **${r.fieldAccuracy.correct}/${r.fieldAccuracy.total} (${pct(r.fieldAccuracy.correct, r.fieldAccuracy.total)})** |`,
    `| Documents with every field correct | ${r.documentsFullyCorrect}/${r.documents} |`,
    `| Documents passing all validators | ${r.passedValidation}/${r.documents} |`,
    `| Known anomalies flagged for review | ${r.anomalyFlags.flagged}/${r.anomalyFlags.expected} |`,
    `| Flagged without a known anomaly | ${r.anomalyFlags.falseFlags.length ? r.anomalyFlags.falseFlags.join(', ') : 'none'} |`,
    '',
    '## Accuracy by field',
    '',
    '| Field | Correct |',
    '|---|---|',
    ...r.byField.map(
      (f) => `| ${f.field} | ${f.correct}/${f.total} (${pct(f.correct, f.total)}) |`,
    ),
    '',
    '## By document',
    '',
    '| Document | Fields | Rows | Tiers | Review | Time |',
    '|---|---|---|---|---|---|',
    ...r.results.map(
      (d) =>
        `| ${d.file} | ${d.scored.filter((x) => x.ok).length}/${d.scored.length} | ${d.rows} | ${d.tiers} | ${d.needsReview ? (d.expectedFlag ? 'yes (expected)' : '**yes**') : 'no'} | ${d.durationMs} ms |`,
    ),
    '',
    '## Mismatches and review reasons',
    '',
  ];
  for (const d of r.results) {
    const wrong = d.scored.filter((x) => !x.ok);
    if (!wrong.length && !d.failedChecks.length) continue;
    lines.push(`### ${d.file}`, '');
    for (const w of wrong) lines.push(`- \`${w.field}\`: expected ${w.expected}, got ${w.actual}`);
    for (const c of d.failedChecks) lines.push(`- validator ${c}`);
    lines.push('');
  }
  return lines.join('\n');
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
