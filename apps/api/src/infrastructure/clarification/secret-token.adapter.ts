import { createHash, randomBytes } from 'node:crypto';
import type { SecretTokenPort } from '../../application/ports/clarification.ports';

/** 256-bit random magic-link token (base64url); only its SHA-256 is stored. */
export class CryptoSecretToken implements SecretTokenPort {
  generate() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
