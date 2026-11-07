import { describe, expect, it, vi } from 'vitest';
import type { BankStatement, Tier } from '../../domain/statement/bank-statement';
import type { DocumentTextPort } from '../ports/document-text.port';
import type { LoggerPort } from '../ports/logger.port';
import type { StatementExtractorPort } from '../ports/statement-extractor.port';
import { ExtractBankStatementUseCase } from './extract-bank-statement.use-case';

const text: DocumentTextPort = { extract: async () => ({ source: 'pdf-text-layer', pages: [] }) };
const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

const statement = (closing: number): BankStatement => ({
  summary: {
    bankName: 'X',
    holderName: null,
    holderRfc: null,
    currency: 'MXN',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    openingBalance: 1000,
    closingBalance: closing,
    reportedCredits: null,
    reportedDebits: null,
  },
  transactions: [
    {
      date: '2025-01-05',
      description: 'a',
      credit: 500,
      debit: 0,
      balance: 1500,
      page: 1,
      sideBy: 'balance-delta',
    },
  ],
  provenance: { summary: 'T0', transactions: 'T0' },
});

const tier = (name: Tier, closing: number): StatementExtractorPort => ({
  tier: name,
  extract: vi.fn(async () => ({ statement: statement(closing), diagnostics: {} })),
});

describe('ExtractBankStatementUseCase', () => {
  it('stops at the first tier that passes validation', async () => {
    const t0 = tier('T0', 1500);
    const t3 = tier('T3', 1500);
    const out = await new ExtractBankStatementUseCase(text, [t0, t3], logger).execute(
      new Uint8Array(),
      {
        documentId: 'd1',
      },
    );
    expect(out.resolvedBy).toBe('T0');
    expect(out.needsReview).toBe(false);
    expect(t3.extract).not.toHaveBeenCalled();
  });

  it('escalates when a tier fails and keeps the passing tier', async () => {
    const out = await new ExtractBankStatementUseCase(
      text,
      [tier('T0', 9999), tier('T3', 1500)],
      logger,
    ).execute(new Uint8Array(), { documentId: 'd1' });
    expect(out.attempts.map((a) => [a.tier, a.passed])).toEqual([
      ['T0', false],
      ['T3', true],
    ]);
    expect(out.resolvedBy).toBe('T3');
  });

  it('flags for review when no tier passes', async () => {
    const out = await new ExtractBankStatementUseCase(text, [tier('T0', 9999)], logger).execute(
      new Uint8Array(),
      {
        documentId: 'd1',
      },
    );
    expect(out.needsReview).toBe(true);
    expect(out.validation.failedSections).toEqual(['transactions']);
  });

  it('continues past a skipped tier and passes the best candidate forward', async () => {
    const skipped: StatementExtractorPort = {
      tier: 'T3',
      extract: vi.fn(async () => ({ skipped: 'fixture-missing', diagnostics: {} })),
    };
    const t4 = tier('T4', 1500);
    const out = await new ExtractBankStatementUseCase(
      text,
      [tier('T0', 9999), skipped, t4],
      logger,
    ).execute(new Uint8Array(), { documentId: 'd1' });
    expect(out.attempts.map((a) => [a.tier, a.passed, a.skipped])).toEqual([
      ['T0', false, undefined],
      ['T3', false, 'fixture-missing'],
      ['T4', true, undefined],
    ]);
    const context = vi.mocked(t4.extract).mock.calls[0]?.[1];
    expect(context?.previous?.tier).toBe('T0');
    expect(context?.previous?.validation.passed).toBe(false);
  });

  it('keeps the earlier candidate when a later tier fails more checks', async () => {
    const worse: StatementExtractorPort = {
      tier: 'T3',
      extract: vi.fn(async () => ({
        statement: { ...statement(9999), transactions: [] },
        diagnostics: { costUsd: 0.01 },
      })),
    };
    const out = await new ExtractBankStatementUseCase(
      text,
      [tier('T0', 9999), worse],
      logger,
    ).execute(new Uint8Array(), { documentId: 'd1' });
    expect(out.resolvedBy).toBe('T0');
    expect(out.costUsd).toBe(0.01);
  });

  it('mixes sections: keeps the earlier summary when only the later rows are right', async () => {
    // T0: right summary, wrong rows. T3: right rows, broken summary (missing closing balance).
    const t0 = tier('T0', 1500);
    vi.mocked(t0.extract).mockResolvedValueOnce({
      statement: { ...statement(1500), transactions: [] },
      diagnostics: {},
    });
    const t3: StatementExtractorPort = {
      tier: 'T3',
      extract: vi.fn(async () => {
        const s = statement(1500);
        return {
          statement: {
            ...s,
            summary: { ...s.summary, closingBalance: null },
            provenance: { summary: 'T3' as const, transactions: 'T3' as const },
          },
          diagnostics: {},
        };
      }),
    };
    const out = await new ExtractBankStatementUseCase(text, [t0, t3], logger).execute(
      new Uint8Array(),
      { documentId: 'd1' },
    );
    expect(out.needsReview).toBe(false);
    expect(out.resolvedBy).toBe('T3');
    expect(out.statement.provenance).toEqual({ summary: 'T0', transactions: 'T3' });
  });
});
