// make seed (also run by the migrate service on `make up`): demo users and an API key.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/infrastructure/persistence/data-source.options';
import { SEED_USERS, seed } from '../src/infrastructure/persistence/seed';

async function main(): Promise<void> {
  const ds = new DataSource(buildDataSourceOptions(process.env.DATABASE_URL as string));
  await ds.initialize();
  await seed(ds);
  await ds.destroy();
  console.log(
    `seeded: ${SEED_USERS.map((u) => `${u.email} (${u.role})`).join(', ')}; password from SEED_PASSWORD (default demo1234); API key from SEED_API_KEY`,
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
