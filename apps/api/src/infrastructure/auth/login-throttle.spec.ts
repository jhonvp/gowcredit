import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { loginThrottlers } from './login-throttle';

const ctx = {} as ExecutionContext;

describe('login throttlers', () => {
  const [byEmail, byIp] = loginThrottlers(10);

  it('limits per email (case-insensitive) and per IP at 5x', () => {
    expect(byEmail).toMatchObject({ name: 'default', limit: 10, ttl: 60_000 });
    expect(byIp).toMatchObject({ name: 'login-ip', limit: 50, ttl: 60_000 });
    expect(byIp?.getTracker).toBeUndefined();
    expect(byEmail?.getTracker?.({ body: { email: ' Ana@Demo.MX ' }, ip: '1.2.3.4' }, ctx)).toBe(
      'ana@demo.mx',
    );
  });

  it('falls back to the IP when the body has no email', () => {
    expect(byEmail?.getTracker?.({ body: {}, ip: '1.2.3.4' }, ctx)).toBe('ip:1.2.3.4');
    expect(byEmail?.getTracker?.({ body: null, ip: '1.2.3.4' }, ctx)).toBe('ip:1.2.3.4');
  });
});
