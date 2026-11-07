import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfig } from './app-config';
import { validateEnv } from './env.schema';

@Global()
@Module({
  imports: [NestConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true })],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class ConfigModule {}
