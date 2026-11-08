/**
 * USD per million tokens (Anthropic first-party list prices, checked 2026-11-07). Thinking tokens
 * are billed as output and are already included in `output_tokens`. Used for cost caps and the eval
 * report; the invoice is the source of truth.
 */
interface Price {
  input: number;
  output: number;
  /** Long-prompt tier: applies to the whole request when input exceeds `threshold` tokens. */
  long?: { threshold: number; input: number; output: number };
}

const PRICES: Record<string, Price> = {
  'claude-haiku-5-5': {
    input: 0.1,
    output: 0.5,
    long: { threshold: 100_000, input: 0.5, output: 2.5 },
  },
  'claude-opus-5-5': { input: 4, output: 20 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model];
  if (!price) return 0;
  const rate = price.long && inputTokens > price.long.threshold ? price.long : price;
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}
