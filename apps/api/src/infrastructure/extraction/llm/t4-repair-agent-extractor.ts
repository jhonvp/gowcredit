import { z } from 'zod';
import type { AgentPort, AgentTool } from '../../../application/ports/agent.port';
import type { DocumentText } from '../../../application/ports/document-text.port';
import { LlmUnavailableError } from '../../../application/ports/llm.port';
import type {
  ExtractionContext,
  StatementExtraction,
  StatementExtractorPort,
  TierSkipped,
} from '../../../application/ports/statement-extractor.port';
import type { BankStatement } from '../../../domain/statement/bank-statement';
import { adjustStatement } from '../../../domain/statement/adjustments';
import { isIsoDate } from '../../../domain/shared/iso-date';
import { toCents } from '../../../domain/shared/money';
import { reorderedRows } from '../../../domain/validation/repair-flags';
import { validateStatement } from '../../../domain/validation/statement-validators';
import { renderPage, repairedPages } from './page-render';
import { T4_PURPOSE, T4_SYSTEM, t4Prompt } from './prompts';
import {
  describeRows,
  describeSummary,
  llmRowSchema,
  ROW_JSON_SCHEMA,
  SUMMARY_PROPERTIES,
  toOtherItem,
  toRow,
} from './statement-schema';

/** ADR 0010 limits for the repair agent. */
export const T4_LIMITS = { maxTurns: 8, maxCostUsd: 1.0 };
const MAX_LIST = 80;

type SummaryField = keyof typeof SUMMARY_PROPERTIES;
const SUMMARY_FIELDS = Object.keys(SUMMARY_PROPERTIES) as SummaryField[];
const MONEY_FIELDS: ReadonlySet<SummaryField> = new Set([
  'openingBalance',
  'closingBalance',
  'reportedCredits',
  'reportedDebits',
]);
const DATE_FIELDS: ReadonlySet<SummaryField> = new Set(['periodStart', 'periodEnd']);

const closed = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/**
 * Tier 4: extraction repair agent on the big model (Claude Opus, ADR 0010). It starts from the best
 * candidate of the earlier tiers, reads pages, edits the candidate through small tools and runs the
 * domain validators on its own work. Edits are cheap tool calls instead of re-emitting the whole
 * statement, which keeps output tokens (the expensive part) low. Its result still goes through the
 * validators in the use case like any other tier.
 */
export class T4RepairAgentExtractor implements StatementExtractorPort {
  readonly tier = 'T4' as const;

  constructor(private readonly agent: AgentPort) {}

  async extract(
    text: DocumentText,
    context: ExtractionContext,
  ): Promise<StatementExtraction | TierSkipped> {
    const previous = context.previous;
    if (!previous || previous.validation.passed)
      return { skipped: 'nothing-to-repair', diagnostics: { purpose: T4_PURPOSE } };

    const pages = repairedPages(text);
    const work: BankStatement = {
      summary: { ...previous.statement.summary },
      transactions: previous.statement.transactions.map((t) => ({ ...t })),
      provenance: { summary: 'T4', transactions: 'T4' },
    };
    let edits = 0;

    const tools: AgentTool[] = [
      {
        name: 'get_page_text',
        description: 'Text of one statement page (layout preserved; columns line up).',
        inputSchema: closed({ page: { type: 'integer', description: '1-based page number' } }),
        run: (input) => {
          const { page } = z.object({ page: z.number().int() }).parse(input);
          const p = pages.find((x) => x.number === page);
          return p
            ? { content: renderPage(p) }
            : { content: `No page ${page}; pages are 1..${pages.length}`, isError: true };
        },
      },
      {
        name: 'list_rows',
        description: `Candidate rows [from, to) as index, date, page, debit, credit, balance, description. At most ${MAX_LIST} rows per call.`,
        inputSchema: closed({ from: { type: 'integer' }, to: { type: 'integer' } }),
        run: (input) => {
          const { from, to } = z
            .object({ from: z.number().int(), to: z.number().int() })
            .parse(input);
          const a = Math.max(0, from);
          const b = Math.min(work.transactions.length, to, a + MAX_LIST);
          return { content: describeRows(work.transactions, a, b) || '(no rows in range)' };
        },
      },
      {
        name: 'update_summary',
        description: 'Set one summary field. Money in pesos (number), dates YYYY-MM-DD, or null.',
        inputSchema: closed({
          field: { type: 'string', enum: SUMMARY_FIELDS },
          value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
        }),
        run: (input) => {
          const { field, value } = z
            .object({
              field: z.enum(SUMMARY_FIELDS as [SummaryField, ...SummaryField[]]),
              value: z.union([z.number(), z.string(), z.null()]),
            })
            .parse(input);
          if (MONEY_FIELDS.has(field)) {
            if (value !== null && typeof value !== 'number')
              return { content: `${field} must be a number or null`, isError: true };
            work.summary[field as 'openingBalance'] = value === null ? null : toCents(value);
          } else if (DATE_FIELDS.has(field)) {
            if (value !== null && (typeof value !== 'string' || !isIsoDate(value)))
              return { content: `${field} must be YYYY-MM-DD or null`, isError: true };
            work.summary[field as 'periodStart'] = value;
          } else {
            if (value !== null && typeof value !== 'string')
              return { content: `${field} must be a string or null`, isError: true };
            work.summary[field as 'bankName'] = value;
          }
          edits++;
          return { content: `${field} updated` };
        },
      },
      {
        name: 'update_row',
        description: 'Replace the row at index.',
        inputSchema: closed({ index: { type: 'integer' }, row: ROW_JSON_SCHEMA }),
        run: (input) => {
          const { index, row } = z
            .object({ index: z.number().int(), row: llmRowSchema })
            .parse(input);
          if (index < 0 || index >= work.transactions.length)
            return {
              content: `index out of range 0..${work.transactions.length - 1}`,
              isError: true,
            };
          work.transactions[index] = toRow(row);
          edits++;
          return { content: `row ${index} updated` };
        },
      },
      {
        name: 'insert_row',
        description: 'Insert a row before index (index = row count appends at the end).',
        inputSchema: closed({ index: { type: 'integer' }, row: ROW_JSON_SCHEMA }),
        run: (input) => {
          const { index, row } = z
            .object({ index: z.number().int(), row: llmRowSchema })
            .parse(input);
          if (index < 0 || index > work.transactions.length)
            return { content: `index out of range 0..${work.transactions.length}`, isError: true };
          work.transactions.splice(index, 0, toRow(row));
          edits++;
          return { content: `row inserted at ${index}; rows now ${work.transactions.length}` };
        },
      },
      {
        name: 'delete_rows',
        description: 'Delete the rows at these indexes (indexes refer to the current list).',
        inputSchema: closed({ indexes: { type: 'array', items: { type: 'integer' } } }),
        run: (input) => {
          const { indexes } = z.object({ indexes: z.array(z.number().int()) }).parse(input);
          const valid = [...new Set(indexes)].filter((i) => i >= 0 && i < work.transactions.length);
          for (const i of valid.sort((a, b) => b - a)) work.transactions.splice(i, 1);
          edits += valid.length;
          return { content: `deleted ${valid.length} rows; rows now ${work.transactions.length}` };
        },
      },
      {
        name: 'add_summary_item',
        description:
          'Report an amount the summary prints that changes the balance but no row lists (interest, tax, fee). Pesos, signed: positive adds to the balance.',
        inputSchema: closed({ concept: { type: 'string' }, amount: { type: 'number' } }),
        run: (input) => {
          const { concept, amount } = z
            .object({ concept: z.string().min(1), amount: z.number().finite() })
            .parse(input);
          work.summary.printedExtras = [
            ...(work.summary.printedExtras ?? []),
            toOtherItem(concept, amount),
          ];
          edits++;
          return { content: `${concept} recorded; call run_validators to check it` };
        },
      },
      {
        name: 'run_validators',
        description: 'Run the domain validators on the current candidate.',
        inputSchema: closed({}),
        run: () => {
          const report = validateStatement(adjustStatement(work));
          const lines = report.checks.map(
            (c) =>
              `${c.passed ? 'PASS' : 'FAIL'}${c.blocking ? '' : ' (info)'} ${c.id}: ${c.detail}`,
          );
          return {
            content: `${report.passed ? 'ALL BLOCKING CHECKS PASS' : 'FAILING'}\n${lines.join('\n')}`,
          };
        },
      },
      {
        name: 'submit_extraction',
        description:
          'Finish. Submits the current candidate. notes: what you changed, and any failure you believe is in the document itself.',
        inputSchema: closed({ notes: { type: 'string' } }),
        run: (input) => {
          const { notes } = z.object({ notes: z.string() }).parse(input);
          return { content: 'submitted', final: { notes } };
        },
      },
    ];

    const failedChecks = previous.validation.checks
      .filter((c) => c.blocking && !c.passed)
      .map((c) => `- ${c.id}: ${c.detail}`)
      .join('\n');
    const rowPages = [...new Set(work.transactions.map((t) => t.page))].join(', ');

    let result;
    try {
      result = await this.agent.run({
        purpose: T4_PURPOSE,
        model: 'big',
        system: T4_SYSTEM,
        prompt: t4Prompt({
          failedChecks,
          summary: describeSummary(work.summary),
          rowCount: work.transactions.length,
          pageCount: pages.length,
          rowPages,
          firstRows: describeRows(work.transactions, 0, 40),
        }),
        tools,
        limits: T4_LIMITS,
        maxTokensPerTurn: 16_000,
        effort: 'high',
      });
    } catch (e) {
      if (e instanceof LlmUnavailableError)
        return { skipped: e.reason, diagnostics: { purpose: T4_PURPOSE } };
      throw e;
    }

    // Reordering rows is detected here (only T4 edits a previous candidate); summary-only rows are
    // detected for every tier in the use case. Both make the result go to human review.
    const moved = reorderedRows(previous.statement.transactions, work.transactions);
    return {
      statement: work,
      reorderedRows: moved,
      diagnostics: {
        purpose: T4_PURPOSE,
        stop: result.stop,
        turns: result.turns,
        toolCalls: result.toolCalls.length,
        toolErrors: result.toolCalls.filter((c) => c.isError).length,
        edits,
        reorderedRows: moved,
        replayed: result.replayed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
      },
    };
  }
}
