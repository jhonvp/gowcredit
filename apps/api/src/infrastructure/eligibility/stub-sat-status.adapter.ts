import type { SatStatusPort } from '../../application/ports/eligibility.ports';

/**
 * C-K6 stub (documented in docs/eligibility-policy.md). The production adapter would call SAT's CFDI
 * verification service with UUID + RFCs + total. `SAT_STATUS_MODE=unknown` makes every invoice ask.
 */
export class StubSatStatusAdapter implements SatStatusPort {
  constructor(private readonly mode: 'active' | 'unknown' = 'active') {}

  async status(): Promise<'active' | 'unknown'> {
    return this.mode;
  }
}
