import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/app-config';
import { buildDataSourceOptions } from './data-source.options';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        ...buildDataSourceOptions(config.databaseUrl, config.dbLogging),
        migrationsRun: false,
      }),
    }),
  ],
})
export class PersistenceModule {}
