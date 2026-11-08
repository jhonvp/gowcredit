// Production migration entry (ECS one-off task: node dist/migrate.js). Locally use `make migrate`.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateEnv } from './infrastructure/config/env.schema';
import { buildDataSourceOptions } from './infrastructure/persistence/data-source.options';

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const ds = new DataSource(buildDataSourceOptions(env.DATABASE_URL));
  await ds.initialize();
  const applied = await ds.runMigrations({ transaction: 'each' });
  await ds.destroy();
  process.stdout.write(
    `${JSON.stringify({ msg: 'migrations applied', count: applied.length, names: applied.map((m) => m.name) })}\n`,
  );
}

main().catch((e: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ msg: 'migration failed', error: (e as Error).message })}\n`,
  );
  process.exit(1);
});
