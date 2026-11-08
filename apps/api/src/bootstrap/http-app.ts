import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppConfig } from '../infrastructure/config/app-config';

/**
 * HTTP setup shared by main.ts and the integration tests, so the tests exercise the same headers,
 * prefix and proxy trust as production.
 */
export function configureHttpApp(app: INestApplication): void {
  const config = app.get(AppConfig);
  // Behind CloudFront + ALB, req.ip must be the client (login rate limit), not the load balancer.
  (app as NestExpressApplication).set('trust proxy', config.trustProxyHops);
  // nosniff, frame-ancestors/X-Frame-Options, no-referrer, HSTS, CORP, and a deny-by-default CSP
  // (the API only serves JSON and files the web downloads with fetch).
  app.use(helmet({ referrerPolicy: { policy: 'no-referrer' } }));
  app.setGlobalPrefix('api', { exclude: ['health'] });
}
