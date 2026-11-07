import type { DocumentText } from '../../../application/ports/document-text.port';
import type {
  ExtractionContext,
  StatementExtraction,
  StatementExtractorPort,
  TierSkipped,
} from '../../../application/ports/statement-extractor.port';
import type { Cents } from '../../../domain/shared/money';
import type { IsoDate } from '../../../domain/shared/iso-date';
import type { BankStatement, Transaction } from '../../../domain/statement/bank-statement';
import { type AmountToken, findAmounts } from '../t0/amounts';
import { readRowDate, resolveRowDate } from '../t0/dates';
import { readHeader } from '../t0/table';
import { T0StatementExtractor } from '../t0/t0-statement-extractor';
import { QUALITY_THRESHOLD, repairPage } from '../t0/text-quality';
import { LINE_MODEL } from './line-model.generated';
import { type LineClass, pageFeatures } from './line-features';
import { predict, type SoftmaxModel } from './softmax';

const MAX_CONTINUATION_LINES = 30;

export interface ClassifiedLine {
  page: number;
  line: number;
  text: string;
  label: LineClass;
  p: number;
}

export function classifyPages(
  text: DocumentText,
  model: SoftmaxModel = LINE_MODEL,
): ClassifiedLine[] {
  const out: ClassifiedLine[] = [];
  for (const page of text.pages.map(repairPage)) {
    if (page.quality < QUALITY_THRESHOLD) continue;
    const feats = pageFeatures(page.lines);
    page.lines.forEach((line, i) => {
      if (line.trim() === '') return;
      const { label, p } = predict(model, feats[i] as number[]);
      out.push({ page: page.number, line: i, text: line, label: label as LineClass, p });
    });
  }
  return out;
}

/**
 * Tier 2: trained line classifier (ADR 0003). When T0's header heuristics miss a table (unknown
 * column names, broken headers), T2 labels every line and builds rows from the lines it labels
 * `transaction_row` (+ their continuations), deciding debit/credit by the running balance, an
 * explicit sign, or (last) the nearest debit/credit column of the line it labeled as header. The summary comes from the best earlier candidate; per-section escalation keeps
 * whichever rows reconcile better.
 */
export class T2ClassifierStatementExtractor implements StatementExtractorPort {
  readonly tier = 'T2' as const;

  constructor(private readonly model: SoftmaxModel = LINE_MODEL) {}

  async extract(
    text: DocumentText,
    context: ExtractionContext,
  ): Promise<StatementExtraction | TierSkipped> {
    const base =
      context.previous?.statement ?? (await new T0StatementExtractor().extract(text)).statement;
    const { periodStart, periodEnd, openingBalance } = base.summary;
    if (!periodStart || !periodEnd) return { skipped: 'no-period', diagnostics: {} };

    const lines = classifyPages(text, this.model);
    const { transactions, undecided } = buildRows(
      lines,
      { start: periodStart, end: periodEnd },
      openingBalance,
    );
    const statement: BankStatement = {
      summary: base.summary,
      transactions,
      provenance: { summary: base.provenance.summary, transactions: 'T2' },
    };
    const count = (l: LineClass) => lines.filter((x) => x.label === l).length;
    return {
      statement,
      diagnostics: {
        linesClassified: lines.length,
        rowLines: count('transaction_row'),
        headerLines: count('table_header'),
        rowsUndecided: undecided,
      },
    };
  }
}

interface Rec {
  date: IsoDate;
  page: number;
  text: string[];
  amounts: AmountToken[];
  continuation: number;
}

/**
 * Builds rows from classified lines. The header-column fallback is enabled only for documents
 * whose rows mostly lack a running balance (BBVA-like); where balances are printed, a row the
 * balance cannot explain is more likely noise than a movement.
 */
export function buildRows(
  lines: readonly ClassifiedLine[],
  period: { start: IsoDate; end: IsoDate },
  opening: Cents | null,
): { transactions: Transaction[]; undecided: number } {
  const strict = buildRowsWith(lines, period, opening, false);
  const byBalance = strict.transactions.filter((t) => t.sideBy === 'balance-delta').length;
  const total = strict.transactions.length + strict.undecided;
  return total > 0 && byBalance / total < 0.5
    ? buildRowsWith(lines, period, opening, true)
    : strict;
}

function buildRowsWith(
  lines: readonly ClassifiedLine[],
  period: { start: IsoDate; end: IsoDate },
  opening: Cents | null,
  useHeaderColumns: boolean,
): { transactions: Transaction[]; undecided: number } {
  const transactions: Transaction[] = [];
  let open: Rec | null = null;
  let prev: Cents | null = opening;
  let prevDate: IsoDate | null = null;
  let undecided = 0;
  /** Column positions of the last line labeled as a header, for rows with one unsigned amount. */
  let header: ReturnType<typeof readHeader> = null;

  const close = () => {
    const rec = open;
    open = null;
    if (!rec) return;
    const nonZero = rec.amounts.filter((a, i) => a.cents !== 0 || i === rec.amounts.length - 1);
    if (nonZero.length === 0) return;
    const description = rec.text.join(' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    const base = { date: rec.date, description, page: rec.page };
    const first = nonZero[0] as AmountToken;
    const last = nonZero[nonZero.length - 1] as AmountToken;
    let tx: Transaction | null = null;
    if (prev !== null && nonZero.length >= 2) {
      if (Math.abs(prev + first.cents - last.cents) <= 1 && first.sign !== -1)
        tx = {
          ...base,
          credit: first.cents,
          debit: 0,
          balance: last.cents,
          sideBy: 'balance-delta',
        };
      else if (Math.abs(prev - first.cents - last.cents) <= 1 && first.sign !== 1)
        tx = {
          ...base,
          debit: first.cents,
          credit: 0,
          balance: last.cents,
          sideBy: 'balance-delta',
        };
    }
    if (!tx && first.sign !== null) {
      const balance = nonZero.length >= 2 ? last.cents : null;
      tx =
        first.sign < 0
          ? { ...base, debit: first.cents, credit: 0, balance, sideBy: 'sign' }
          : { ...base, credit: first.cents, debit: 0, balance, sideBy: 'sign' };
    }
    if (!tx && header && useHeaderColumns) {
      // Last resort: the amount sits under the nearest debit/credit column of the classified header.
      // A lone amount nearest the balance column only restates the balance (opening/closing rows).
      const closest = (cols: NonNullable<typeof header>['columns']) =>
        cols.reduce<(typeof cols)[number] | null>(
          (best, c) =>
            !best || Math.abs(first.end - c.end) < Math.abs(first.end - best.end) ? c : best,
          null,
        );
      const onBalance = nonZero.length === 1 && closest(header.columns)?.role === 'balance';
      const sides = header.columns.filter((c) => c.role === 'debit' || c.role === 'credit');
      const nearest = onBalance ? null : closest(sides);
      const balance = nonZero.length >= 2 ? last.cents : null;
      if (nearest)
        tx =
          nearest.role === 'debit'
            ? { ...base, debit: first.cents, credit: 0, balance, sideBy: 'column' }
            : { ...base, credit: first.cents, debit: 0, balance, sideBy: 'column' };
    }
    if (!tx) {
      undecided++;
      return;
    }
    transactions.push(tx);
    prev = tx.balance ?? (prev === null ? null : prev + tx.credit - tx.debit);
  };

  for (const l of lines) {
    if (l.label === 'transaction_row') {
      const rd = readRowDate(l.text, false) ?? readRowDate(l.text, true);
      const date: IsoDate | null = rd ? resolveRowDate(rd.date, period, prevDate) : null;
      if (rd && date) {
        close();
        prevDate = date;
        open = {
          date,
          page: l.page,
          text: [l.text.slice(rd.end)],
          amounts: findAmounts(l.text).filter((a) => a.start >= rd.end),
          continuation: 0,
        };
        continue;
      }
    }
    if (l.label === 'table_header') {
      if (open && (open as Rec).amounts.length > 0) close();
      header = readHeader(l.text) ?? header;
      continue;
    }
    if (!open) continue;
    const rec: Rec = open;
    if (l.label === 'other' && rec.amounts.length > 0) {
      close();
      continue;
    }
    if (++rec.continuation > MAX_CONTINUATION_LINES) {
      close();
      continue;
    }
    const amounts = findAmounts(l.text);
    if (rec.amounts.length === 0 && amounts.length > 0) rec.amounts = amounts;
    if (rec.text.length < 8) rec.text.push(l.text);
  }
  close();
  return { transactions, undecided };
}
