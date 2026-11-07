import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../src/infrastructure/persistence/data-source.options';
import { seed } from '../../src/infrastructure/persistence/seed';

/** Recreates the e2e schema from migrations, so the tests also prove the migrations work. */
export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url?.endsWith('/gowcredit_test')) {
    throw new Error(`integration tests must run against gowcredit_test, got: ${url}`);
  }
  await ensureDatabase(url);
  const ds = new DataSource(buildDataSourceOptions(url));
  await ds.initialize();
  await ds.dropDatabase();
  await ds.runMigrations();
  await seed(ds);
  await ds.destroy();
}

/** Creates gowcredit_test on first run (works with an existing dev volume, no init scripts needed). */
async function ensureDatabase(url: string): Promise<void> {
  const admin = new DataSource({
    type: 'postgres',
    url: url.replace(/\/gowcredit_test$/, '/postgres'),
  });
  await admin.initialize();
  const rows: unknown[] = await admin.query(
    `SELECT 1 FROM pg_database WHERE datname = 'gowcredit_test'`,
  );
  if (rows.length === 0) await admin.query('CREATE DATABASE gowcredit_test');
  await admin.destroy();
}
