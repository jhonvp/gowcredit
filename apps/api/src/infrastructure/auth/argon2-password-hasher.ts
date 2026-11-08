import { hash, verify } from 'argon2';
import type { PasswordHasherPort } from '../../application/ports/auth.ports';

/** argon2id with library defaults (ADR 0005). */
export class Argon2PasswordHasher implements PasswordHasherPort {
  hash(password: string): Promise<string> {
    return hash(password, { type: 2 });
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }
}
