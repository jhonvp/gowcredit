import { describe, expect, it, vi } from 'vitest';
import type { PasswordHasherPort, UserRepositoryPort } from '../ports/auth.ports';
import { AuthenticateUserUseCase } from './authenticate-user.use-case';

const user = {
  id: 'u1',
  email: 'supplier@demo.mx',
  name: 'P',
  role: 'supplier' as const,
  passwordHash: 'H',
};
const users: UserRepositoryPort = {
  findByEmail: vi.fn(async (e: string) => (e === user.email ? user : null)),
  findById: vi.fn(),
};
const hasher: PasswordHasherPort = {
  hash: vi.fn(),
  verify: vi.fn(async (h: string, p: string) => h === 'H' && p === 'right'),
};

describe('AuthenticateUserUseCase', () => {
  const auth = new AuthenticateUserUseCase(users, hasher);

  it('returns the user without the hash for the right password (email case-insensitive)', async () => {
    const u = await auth.execute(' Supplier@Demo.MX ', 'right');
    expect(u).toEqual({ id: 'u1', email: 'supplier@demo.mx', name: 'P', role: 'supplier' });
  });

  it('rejects a wrong password and still verifies a hash for unknown emails (no timing oracle)', async () => {
    expect(await auth.execute('supplier@demo.mx', 'wrong')).toBeNull();
    vi.mocked(hasher.verify).mockClear();
    expect(await auth.execute('ghost@demo.mx', 'right')).toBeNull();
    expect(hasher.verify).toHaveBeenCalledTimes(1);
  });
});
