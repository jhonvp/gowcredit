import type { Role } from '../../domain/auth/principal';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
}

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
}
export const USER_REPOSITORY_PORT = Symbol('UserRepositoryPort');

export interface ApiKeyRecord {
  id: string;
  name: string;
  supplierId: string;
}

export interface ApiKeyRepositoryPort {
  /** Looks a key up by the SHA-256 of its secret; plaintext keys are never stored. */
  findBySecretHash(hash: string): Promise<ApiKeyRecord | null>;
}
export const API_KEY_REPOSITORY_PORT = Symbol('ApiKeyRepositoryPort');

export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}
export const PASSWORD_HASHER_PORT = Symbol('PasswordHasherPort');
