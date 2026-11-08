import { describe, expect, it } from 'vitest';
import { canReadCase, type Principal, submittingSupplier } from './principal';

const supplier: Principal = { kind: 'user', userId: 's1', email: 's@x', role: 'supplier' };
const analyst: Principal = { kind: 'user', userId: 'a1', email: 'a@x', role: 'analyst' };
const key: Principal = { kind: 'api-key', keyId: 'k1', supplierId: 's1' };
const owner: Principal = { kind: 'owner', caseId: 'c1', requestId: 'r1', email: 'o@x' };

describe('principal rules', () => {
  it('lets suppliers and their keys submit, not analysts or owners', () => {
    expect([supplier, key, analyst, owner].map(submittingSupplier)).toEqual([
      's1',
      's1',
      null,
      null,
    ]);
  });

  it('scopes case access by role', () => {
    const own = { id: 'c1', supplierId: 's1' };
    const other = { id: 'c2', supplierId: 's2' };
    expect([supplier, key, analyst, owner].map((p) => canReadCase(p, own))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect([supplier, key, analyst, owner].map((p) => canReadCase(p, other))).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });
});
