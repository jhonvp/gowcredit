// Entry point for the TypeORM CLI (pnpm typeorm ...). Runs inside the api container.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source.options';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

export default new DataSource(buildDataSourceOptions(url));
