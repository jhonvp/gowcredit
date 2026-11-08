import './tracing';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './bootstrap/app.module';
import { AppConfig } from './infrastructure/config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.setGlobalPrefix('api', { exclude: ['health'] });
  const config = app.get(AppConfig);
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
