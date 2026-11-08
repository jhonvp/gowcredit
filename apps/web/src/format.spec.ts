import { describe, expect, it } from 'vitest';
import { isCaseInFlight, isInFlight, money } from './format';

describe('format', () => {
  it('formats integer cents as pesos', () => {
    expect(money(123456)).toMatch(/1,234\.56/);
    expect(money(null)).toBe('—');
  });

  it('polls only while the worker owns the case', () => {
    expect(['RECEIVED', 'EXTRACTING', 'EXTRACTED'].every((s) => isInFlight(s as never))).toBe(true);
    expect(isInFlight('DECIDED')).toBe(false);
    expect(isInFlight('AWAITING_OWNER')).toBe(false);
  });

  it('keeps polling a decided case while a newly added document is unread', () => {
    const doc = { extraction: null, invoice: null, docType: null } as const;
    const decided = { status: 'DECIDED' as const, documents: [doc] };
    expect(isCaseInFlight(decided as never)).toBe(true);
    expect(isCaseInFlight({ ...decided, documents: [] } as never)).toBe(false);
    expect(
      isCaseInFlight({ ...decided, documents: [{ ...doc, docType: 'UNKNOWN' }] } as never),
    ).toBe(false);
    expect(isCaseInFlight({ status: 'FAILED', documents: [doc] } as never)).toBe(false);
  });
});
