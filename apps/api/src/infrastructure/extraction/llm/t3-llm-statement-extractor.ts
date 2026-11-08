import type { DocumentText } from '../../../application/ports/document-text.port';
import { type LlmPort, LlmUnavailableError, textOf } from '../../../application/ports/llm.port';
import type {
  ExtractionContext,
  StatementExtraction,
  StatementExtractorPort,
  TierSkipped,
} from '../../../application/ports/statement-extractor.port';
import { renderDocument, repairedPages } from './page-render';
import { T3_PURPOSE, T3_SYSTEM } from './prompts';
import { llmStatementSchema, STATEMENT_JSON_SCHEMA, toDomain } from './statement-schema';

/** Output budget: ~60 tokens per row, so 32k covers statements of several hundred rows. */
const MAX_TOKENS = 32_000;

/**
 * Tier 3: one structured-output call to the basic model (Claude Haiku, ADR 0004) over the whole
 * statement text. It extracts from scratch; the failed checks of the earlier tier are a hint only.
 */
export class T3LlmStatementExtractor implements StatementExtractorPort {
  readonly tier = 'T3' as const;

  constructor(private readonly llm: LlmPort) {}

  async extract(
    text: DocumentText,
    context: ExtractionContext,
  ): Promise<StatementExtraction | TierSkipped> {
    const failed = context.previous?.validation.checks
      .filter((c) => c.blocking && !c.passed)
      .map((c) => `- ${c.id}: ${c.detail}`)
      .join('\n');
    const prompt = [
      failed ? `An earlier deterministic pass failed these checks:\n${failed}\n` : '',
      'Statement text:',
      renderDocument(repairedPages(text)),
    ].join('\n');

    let response;
    try {
      response = await this.llm.complete({
        purpose: T3_PURPOSE,
        model: 'basic',
        system: T3_SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        outputSchema: STATEMENT_JSON_SCHEMA,
        maxTokens: MAX_TOKENS,
        effort: 'medium',
      });
    } catch (e) {
      if (e instanceof LlmUnavailableError)
        return { skipped: e.reason, diagnostics: { purpose: T3_PURPOSE } };
      throw e;
    }

    const diagnostics = {
      purpose: T3_PURPOSE,
      model: response.model,
      source: response.source,
      stopReason: response.stopReason,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      costUsd: response.usage.costUsd,
    };
    const parsed =
      response.stopReason === 'end_turn' ? parseJson(textOf(response.content)) : undefined;
    const statement = llmStatementSchema.safeParse(parsed);
    if (!statement.success) return { skipped: 'invalid-output', diagnostics };

    return {
      statement: toDomain(statement.data, 'T3'),
      diagnostics: {
        ...diagnostics,
        summaryRows: statement.data.transactions.filter((t) => t.fromSummary).length,
      },
    };
  }
}

function parseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
