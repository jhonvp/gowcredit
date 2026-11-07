import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/bootstrap/app.module';
import { bearer, DEMO_API_KEY, login } from './support/auth';
import { tinyPdf } from './support/tiny-pdf';

/** Passport strategies and authorization rules on real Postgres (seed users, ADR 0005). */
describe('auth (integration)', () => {
  let app: INestApplication;
  let supplier: Record<string, string>;
  let supplier2: Record<string, string>;
  let analyst: Record<string, string>;
  let caseId: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
    supplier = bearer(await login(app, 'supplier@demo.mx'));
    supplier2 = bearer(await login(app, 'supplier2@demo.mx'));
    analyst = bearer(await login(app, 'analyst@demo.mx'));
    const res = await http()
      .post('/api/documents')
      .set(supplier)
      .attach('file', Buffer.from(tinyPdf(['BANCO DEMO'])), {
        filename: 'a.pdf',
        contentType: 'application/pdf',
      })
      .expect(202);
    caseId = res.body.caseId;
  });
  afterAll(async () => app?.close());

  it('logs in with email + password and returns the user; rejects bad credentials', async () => {
    const ok = await http()
      .post('/api/auth/login')
      .send({ email: 'analyst@demo.mx', password: 'demo1234' })
      .expect(200);
    expect(ok.body.user).toMatchObject({
      email: 'analyst@demo.mx',
      role: 'analyst',
      name: 'Analista Demo',
    });
    await http()
      .post('/api/auth/login')
      .send({ email: 'analyst@demo.mx', password: 'nope' })
      .expect(401);
    await http()
      .post('/api/auth/login')
      .send({ email: 'ghost@demo.mx', password: 'demo1234' })
      .expect(401);
    const me = await http().get('/api/auth/me').set(supplier).expect(200);
    expect(me.body).toMatchObject({ email: 'supplier@demo.mx', role: 'supplier' });
  });

  it('requires authentication everywhere except health and login', async () => {
    await http().get('/health').expect(200);
    await http().get('/api/cases').expect(401);
    await http().get(`/api/cases/${caseId}`).expect(401);
    await http().get('/api/cases').set({ Authorization: 'Bearer not-a-jwt' }).expect(401);
    await http().get('/api/cases').set({ 'X-API-Key': 'wrong' }).expect(401);
  });

  it('scopes cases: owner supplier and analyst read it, another supplier gets 404', async () => {
    await http().get(`/api/cases/${caseId}`).set(supplier).expect(200);
    await http().get(`/api/cases/${caseId}`).set(analyst).expect(200);
    await http().get(`/api/cases/${caseId}`).set(supplier2).expect(404);
    const own = (await http().get('/api/cases').set(supplier).expect(200)).body as { id: string }[];
    const other = (await http().get('/api/cases').set(supplier2).expect(200)).body as {
      id: string;
    }[];
    const all = (await http().get('/api/cases').set(analyst).expect(200)).body as { id: string }[];
    expect(own.map((c) => c.id)).toContain(caseId);
    expect(other.map((c) => c.id)).not.toContain(caseId);
    expect(all.map((c) => c.id)).toContain(caseId);
  });

  it('lets integrations submit with an API key for their supplier; analysts cannot submit', async () => {
    const res = await http()
      .post('/api/documents')
      .set({ 'X-API-Key': DEMO_API_KEY })
      .attach('file', Buffer.from(tinyPdf(['BANCO DEMO'])), {
        filename: 'k.pdf',
        contentType: 'application/pdf',
      })
      .expect(202);
    await http().get(`/api/cases/${res.body.caseId}`).set(supplier).expect(200);
    await http()
      .post('/api/documents')
      .set(analyst)
      .attach('file', Buffer.from(tinyPdf(['X'])), {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);
    await http()
      .post(`/api/cases/${caseId}/documents`)
      .set(supplier2)
      .attach('file', Buffer.from(tinyPdf(['X'])), {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      })
      .expect(404);
  });
});
