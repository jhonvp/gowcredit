import type { PasswordHasherPort, UserRecord, UserRepositoryPort } from '../ports/auth.ports';

/**
 * Email + password check for suppliers and analysts (ADR 0005). Unknown emails still pay for a hash
 * verification so response time does not reveal which emails exist.
 */
export class AuthenticateUserUseCase {
  private static readonly DUMMY_HASH =
    '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$7f8lbqWbqf3Q2tqpZbW1y7S7k3wqgYQxu1m3l0b5iVk';

  constructor(
    private readonly users: UserRepositoryPort,
    private readonly hasher: PasswordHasherPort,
  ) {}

  async execute(email: string, password: string): Promise<Omit<UserRecord, 'passwordHash'> | null> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    const ok = await this.hasher
      .verify(user?.passwordHash ?? AuthenticateUserUseCase.DUMMY_HASH, password)
      .catch(() => false);
    if (!user || !ok) return null;
    const { passwordHash: _hash, ...safe } = user;
    return safe;
  }
}
