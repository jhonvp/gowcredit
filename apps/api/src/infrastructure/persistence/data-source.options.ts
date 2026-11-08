import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { ORM_ENTITIES } from './entities';

/** Shared by the Nest module and the TypeORM CLI. Schema changes only via migrations (CLAUDE.md). */
export const buildDataSourceOptions = (url: string, logging = false): DataSourceOptions => ({
  type: 'postgres',
  url,
  entities: ORM_ENTITIES,
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging,
});
