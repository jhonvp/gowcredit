import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { Argon2PasswordHasher } from '../auth/argon2-password-hasher';
import { ApiKeyOrmEntity, UserOrmEntity } from './entities';

/** Local/demo users for each role (ADR 0005). Idempotent; never runs with NODE_ENV=production. */
export const SEED_USERS = [
  { email: 'supplier@demo.mx', name: 'Proveedor Demo', role: 'supplier' as const },
  { email: 'supplier2@demo.mx', name: 'Otro Proveedor', role: 'supplier' as const },
  { email: 'analyst@demo.mx', name: 'Analista Demo', role: 'analyst' as const },
];

export async function seed(
  ds: DataSource,
  opts = {
    password: process.env.SEED_PASSWORD ?? 'demo1234',
    apiKey: process.env.SEED_API_KEY ?? 'gk_local_demo_key_0001',
  },
): Promise<void> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to seed demo users in production');
  const hasher = new Argon2PasswordHasher();
  const users = ds.getRepository(UserOrmEntity);
  for (const u of SEED_USERS) {
    const existing = await users.findOneBy({ email: u.email });
    if (!existing) await users.insert({ ...u, passwordHash: await hasher.hash(opts.password) });
  }
  const supplier = await users.findOneByOrFail({ email: 'supplier@demo.mx' });
  const secretHash = createHash('sha256').update(opts.apiKey).digest('hex');
  const keys = ds.getRepository(ApiKeyOrmEntity);
  if (!(await keys.findOneBy({ secretHash })))
    await keys.insert({ name: 'demo integration', supplierId: supplier.id, secretHash });
}
