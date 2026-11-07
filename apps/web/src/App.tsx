import { DecisionOutcomeSchema } from '@gowcredit/contracts';

/** Placeholder shell. Supplier / analyst / owner screens land in Day 2 (docs/PLAN.md #11). */
export function App() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>GowCredit — Pronto pago</h1>
      <p>Outcomes: {DecisionOutcomeSchema.options.join(' · ')}</p>
    </main>
  );
}
