/** Who is calling (ADR 0005). Built by the Passport strategies, checked by the domain rules below. */
export type Role = 'supplier' | 'analyst';

export type Principal =
  | { kind: 'user'; userId: string; email: string; role: Role }
  /** Integration key: acts for the supplier it belongs to. */
  | { kind: 'api-key'; keyId: string; supplierId: string }
  /** Document owner via magic link: one case, answering its open questions only. */
  | { kind: 'owner'; caseId: string; requestId: string; email: string };

/** Supplier on whose behalf documents are submitted, or null if this principal cannot submit. */
export function submittingSupplier(p: Principal): string | null {
  if (p.kind === 'user') return p.role === 'supplier' ? p.userId : null;
  if (p.kind === 'api-key') return p.supplierId;
  return null;
}

/** Analysts see every case; suppliers and their keys see their own; owners see the linked case. */
export function canReadCase(p: Principal, c: { id: string; supplierId: string | null }): boolean {
  if (p.kind === 'user') return p.role === 'analyst' || c.supplierId === p.userId;
  if (p.kind === 'api-key') return c.supplierId === p.supplierId;
  return c.id === p.caseId;
}
