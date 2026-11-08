import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema';

const base = { JWT_SECRET: 'x'.repeat(32) };

describe('validateEnv', () => {
  it('uses DATABASE_URL when given', () => {
    expect(validateEnv({ ...base, DATABASE_URL: 'postgres://a:b@h:5432/d' }).DATABASE_URL).toBe(
      'postgres://a:b@h:5432/d',
    );
  });

  it('composes the URL from DB_* in ECS (RDS secret parts), escaping the password', () => {
    const env = validateEnv({
      ...base,
      DB_HOST: 'db.internal',
      DB_USER: 'gowcredit',
      DB_PASSWORD: 'p@ss/word',
    });
    expect(env.DATABASE_URL).toBe(
      'postgres://gowcredit:p%40ss%2Fword@db.internal:5432/gowcredit?sslmode=no-verify',
    );
  });

  it('fails fast without a database or a JWT secret', () => {
    expect(() => validateEnv(base)).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ DATABASE_URL: 'postgres://a:b@h/d' })).toThrow(/JWT_SECRET/);
  });
});
