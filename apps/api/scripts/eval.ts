// Extraction eval (make eval). Runs the extraction use case over the dataset and scores it against
// eval/ground-truth. Writes eval/reports/latest.{md,json}. See eval/README.md.
//
// Cascade T0 → T1 OCR → T2 classifier → T3 → T4. LLM_MODE=replay (default) answers T3/T4 from fixtures/llm; record/live call the API.
// EVAL_TIERS=T0 runs the deterministic baseline only.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ToolLoopAgent } from '../src/application/agents/tool-loop-agent';
import type { LoggerPort } from '../src/application/ports/logger.port';
import type { StatementExtractorPort } from '../src/application/ports/statement-extractor.port';
import { ExtractBankStatementUseCase } from '../src/application/use-cases/extract-bank-statement.use-case';
import { decide, type Outcome } from '../src/domain/eligibility/engine';
import { formatMxn, toCents } from '../src/domain/shared/money';
import { totalCredits, totalDebits } from '../src/domain/statement/bank-statement';
import { T3LlmStatementExtractor } from '../src/infrastructure/extraction/llm/t3-llm-statement-extractor';
import { T4RepairAgentExtractor } from '../src/infrastructure/extraction/llm/t4-repair-agent-extractor';
import { T1OcrStatementExtractor } from '../src/infrastructure/extraction/ocr/t1-ocr-statement-extractor';
import { TesseractOcrAdapter } from '../src/infrastructure/extraction/ocr/tesseract-ocr.adapter';
import { PopplerTextAdapter } from '../src/infrastructure/extraction/pdf/poppler-text.adapter';
import { T0StatementExtractor } from '../src/infrastructure/extraction/t0/t0-statement-extractor';
import { T2ClassifierStatementExtractor } from '../src/infrastructure/extraction/t2/t2-classifier-statement-extractor';
import { YamlPolicyAdapter } from '../src/infrastructure/eligibility/yaml-policy.adapter';
import { createLlm, llmSettingsFromEnv } from '../src/infrastructure/llm/create-llm';

const ROOT = resolve(__dirname, '../../..');
const DATASET = resolve(process.env.EVAL_DATASET_DIR ?? join(ROOT, 'facturas'));
const GROUND_TRUTH = join(ROOT, 'eval/ground-truth');
const REPORTS = join(ROOT, 'eval/reports');
const ONLY_T0 = process.env.EVAL_TIERS === 'T0';
const llmSettings = llmSettingsFromEnv();

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
  costUsd: number;
  agentTurns: number;
  skipped: string[];
  /** Eligibility with asOf = period end + 5 days (exercises the financial rules) and asOf = today. */
  decision: { atPeriodEnd: string; today: string };
}

const POLICY = new YamlPolicyAdapter().current();
const TODAY = new Date().toISOString().slice(0, 10);
const plus = (d: string, days: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const label = (o: Outcome, score: number | null, missing: string[]) =>
  `${o}${score !== null ? ` (${score})` : ''}${missing.length ? ` ← ${missing.join(', ')}` : ''}`;

function buildTiers(): StatementExtractorPort[] {
  if (ONLY_T0) return [new T0StatementExtractor()];
  const llm = createLlm(llmSettings, quiet);
  return [
    new T0StatementExtractor(),
    new T1OcrStatementExtractor(new TesseractOcrAdapter()),
    new T2ClassifierStatementExtractor(),
    new T3LlmStatementExtractor(llm),
    new T4RepairAgentExtractor(new ToolLoopAgent(llm, quiet)),
  ];
}

async function main(): Promise<void> {
  if (!existsSync(DATASET))
    throw new Error(`Dataset not found: ${DATASET} (put the PDFs in facturas/)`);
  const useCase = new ExtractBankStatementUseCase(new PopplerTextAdapter(), buildTiers(), quiet);
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
      tiers: out.attempts
        .map((a) => `${a.tier}${a.skipped ? `⊘ (${a.skipped})` : a.passed ? '✓' : '✗'}`)
        .join(' → '),
      costUsd: out.costUsd,
      agentTurns: out.attempts.reduce(
        (n, a) => n + (typeof a.diagnostics.turns === 'number' ? a.diagnostics.turns : 0),
        0,
      ),
      skipped: out.attempts.filter((a) => a.skipped).map((a) => `${a.tier} ${a.skipped}`),
      decision: {
        atPeriodEnd: decideAt(s.summary.periodEnd ? plus(s.summary.periodEnd, 5) : TODAY),
        today: decideAt(TODAY),
      },
    });
    function decideAt(asOf: string): string {
      const d = decide({
        asOf,
        policy: POLICY,
        statement: { statement: s, validation: out.validation },
      });
      return label(
        d.outcome,
        d.score,
        d.missing.map((m) => m.code),
      );
    }
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
    pipeline: ONLY_T0
      ? 'T0 (deterministic)'
      : `T0 → T1 → T2 → T3 → T4 (LLM_MODE=${llmSettings.mode})`,
    documents: results.length,
    fieldAccuracy: { correct: all.filter((x) => x.ok).length, total: all.length },
    documentsFullyCorrect: results.filter((r) => r.scored.every((x) => x.ok)).length,
    passedValidation: results.filter((r) => !r.needsReview).length,
    anomalyFlags: {
      expected: results.filter((r) => r.expectedFlag).length,
      flagged: results.filter((r) => r.expectedFlag && r.needsReview).length,
      falseFlags: results.filter((r) => !r.expectedFlag && r.needsReview).map((r) => r.file),
    },
    llmCostUsd: results.reduce((a, r) => a + r.costUsd, 0),
    agentTurns: results.reduce((a, r) => a + r.agentTurns, 0),
    llmSkips: results.flatMap((r) => r.skipped.map((s) => `${r.file}: ${s}`)),
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
    `| LLM cost (USD, as recorded) | ${r.llmCostUsd.toFixed(4)} |`,
    `| Agent turns (T4) | ${r.agentTurns} |`,
    '',
  ];
  if (r.llmSkips.length) {
    lines.push(
      `**LLM tiers skipped:** ${r.llmSkips.join('; ')}.`,
      '',
      'In replay mode a tier is skipped when no fixture was recorded for that exact request. Record',
      'fixtures with `make eval-record` (needs `ANTHROPIC_API_KEY`). A skip never changes the result of',
      'the earlier tiers.',
      '',
    );
  }
  lines.push(
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
    '| Document | Fields | Rows | Tiers | Review | Cost | Time |',
    '|---|---|---|---|---|---|---|',
    ...r.results.map(
      (d) =>
        `| ${d.file} | ${d.scored.filter((x) => x.ok).length}/${d.scored.length} | ${d.rows} | ${d.tiers} | ${d.needsReview ? (d.expectedFlag ? 'yes (expected)' : '**yes**') : 'no'} | ${d.costUsd ? `$${d.costUsd.toFixed(4)}` : '—'} | ${d.durationMs} ms |`,
    ),
    '',
    '## Eligibility (policy ' + POLICY.version + ')',
    '',
    'Statement-only decisions. `asOf = period end + 5` exercises the financial rules; with `asOf = today`',
    'most dev statements are older than 90 days and the policy asks for a recent one (docs/eligibility-policy.md).',
    '',
    '| Document | asOf = period end + 5 | asOf = today |',
    '|---|---|---|',
    ...r.results.map((d) => `| ${d.file} | ${d.decision.atPeriodEnd} | ${d.decision.today} |`),
    '',
    '## Mismatches and review reasons',
    '',
  );
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
