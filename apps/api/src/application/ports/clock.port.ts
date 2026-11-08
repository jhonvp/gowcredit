/** Time is injected so eligibility (`asOf`) and tests are reproducible (SPEC A7). */
export interface ClockPort {
  now(): Date;
}

export const CLOCK_PORT = Symbol('ClockPort');
