import type { DocumentText } from '../../../application/ports/document-text.port';
import type {
  StatementExtraction,
  StatementExtractorPort,
} from '../../../application/ports/statement-extractor.port';
import {
  type BankStatement,
  SUMMARY_ITEM_DESCRIPTION,
} from '../../../domain/statement/bank-statement';
import { detectBank } from './bank';
import { findPeriod, type Period } from './dates';
import { detectCurrency, findLabeledAmount } from './summary';
import { type LabeledLine, parseTransactions } from './table';
import { QUALITY_THRESHOLD, repairPage, type RepairedPage } from './text-quality';

/** Tier 0: deterministic extraction from the PDF text layer (ADR 0002). */
export class T0StatementExtractor implements StatementExtractorPort {
  readonly tier = 'T0' as const;

  async extract(text: DocumentText): Promise<StatementExtraction> {
    return this.extractWithLabels(text).extraction;
  }

  /** Also returns the role of every table line: training labels for T2 (ADR 0003). */
  extractWithLabels(text: DocumentText): {
    extraction: StatementExtraction;
    labels: LabeledLine[];
  } {
    const pages = text.pages.map(repairPage);
    const period = findFirstPeriod(pages);
    const opening = findLabeledAmount(pages, 'opening');
    const closing = findLabeledAmount(pages, 'closing');
    const credits = findLabeledAmount(pages, 'credits');
    const debits = findLabeledAmount(pages, 'debits');
    const interest = findLabeledAmount(pages, 'interest');

    const table = period
      ? parseTransactions(pages, period, opening?.cents ?? null)
      : { transactions: [], openingFromTable: null, headersFound: 0, labels: [] };

    const statement: BankStatement = {
      summary: {
        bankName: detectBank(pages),
        holderName: null,
        holderRfc: null,
        currency: detectCurrency(pages),
        periodStart: period?.start ?? null,
        periodEnd: period?.end ?? null,
        openingBalance: opening?.cents ?? table.openingFromTable,
        closingBalance: closing?.cents ?? null,
        reportedCredits: credits?.cents ?? null,
        reportedDebits: debits?.cents ?? null,
        printedExtras: interest
          ? [
              {
                concept: 'Rendimientos del periodo',
                amount: interest.cents,
                description: SUMMARY_ITEM_DESCRIPTION,
              },
            ]
          : [],
      },
      transactions: table.transactions,
      provenance: { summary: 'T0', transactions: 'T0' },
    };

    const sideBy = (k: string) => table.transactions.filter((t) => t.sideBy === k).length;
    const extraction: StatementExtraction = {
      statement,
      diagnostics: {
        pages: pages.length,
        pagesUnreadable: pages.filter((p) => p.quality < QUALITY_THRESHOLD).length,
        pagesEbcdicRepaired: pages.filter((p) => p.repair === 'ebcdic').length,
        tableHeaders: table.headersFound,
        sideByBalance: sideBy('balance-delta'),
        sideBySign: sideBy('sign'),
        sideByColumn: sideBy('column'),
        openingLabel: opening?.label ?? null,
        closingLabel: closing?.label ?? null,
      },
    };
    return { extraction, labels: table.labels };
  }
}

function findFirstPeriod(pages: readonly RepairedPage[]): Period | null {
  for (const page of pages) {
    if (page.quality < QUALITY_THRESHOLD) continue;
    for (const line of page.lines) {
      const p = findPeriod(line);
      if (p) return p;
    }
  }
  return null;
}
