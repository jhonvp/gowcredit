import { describe, expect, it } from 'vitest';
import { isInFlight, money } from './format';

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
});
