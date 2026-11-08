import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition } from './case-status';

describe('case status transitions', () => {
  it('allows the clarification round trip', () => {
    expect(canTransition('EXTRACTING', 'AWAITING_OWNER')).toBe(true);
    expect(canTransition('AWAITING_OWNER', 'EXTRACTING')).toBe(true);
  });

  it('rejects skipping extraction', () => {
    expect(canTransition('RECEIVED', 'DECIDED')).toBe(false);
  });

  it('goes through EXTRACTED before a decision and throws on invalid moves', () => {
    expect(canTransition('EXTRACTING', 'EXTRACTED')).toBe(true);
    expect(canTransition('EXTRACTED', 'DECIDED')).toBe(true);
    expect(() => assertTransition('DECIDED', 'AWAITING_OWNER')).toThrow(
      /DECIDED to AWAITING_OWNER/,
    );
  });
});
