import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_API_KEY = 'gk_local_demo_key_0001';

export async function login(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: DEMO_PASSWORD })
    .expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
