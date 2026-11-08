import { describe, expect, it } from 'vitest';
import { canTransition } from './case-status';

describe('case status transitions', () => {
  it('allows the clarification round trip', () => {
    expect(canTransition('EXTRACTING', 'AWAITING_OWNER')).toBe(true);
    expect(canTransition('AWAITING_OWNER', 'EXTRACTING')).toBe(true);
  });

  it('rejects skipping extraction', () => {
    expect(canTransition('RECEIVED', 'DECIDED')).toBe(false);
  });
});
