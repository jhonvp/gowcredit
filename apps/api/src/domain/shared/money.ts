/**
 * Money as integer cents. Never use floats for balances: 0.1 + 0.2 bugs break reconciliation.
 */
export type Cents = number;

export const toCents = (amount: number): Cents => Math.round(amount * 100);
export const fromCents = (cents: Cents): number => cents / 100;
export const sumCents = (values: readonly Cents[]): Cents => values.reduce((a, b) => a + b, 0);
export const formatMxn = (cents: Cents): string =>
  (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
