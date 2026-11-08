import type { ThrottlerOptions } from '@nestjs/throttler';

const MINUTE_MS = 60_000;

/**
 * Two limits on POST /api/auth/login, both counted before the password is checked:
 * - per email: slows guessing one account's password from many IPs;
 * - per IP (5x): slows one client spraying a common password across many emails.
 * Storage is in memory, per API task: with N tasks an attacker gets at most N times the limit.
 */
export function loginThrottlers(attemptsPerMinute: number): ThrottlerOptions[] {
  return [
    {
      // Per email. Named "default" so a 429 carries the standard Retry-After header (other names
      // get a suffix, e.g. Retry-After-login-ip).
      name: 'default',
      ttl: MINUTE_MS,
      limit: attemptsPerMinute,
      getTracker: (req) => emailOf(req.body) ?? `ip:${String(req.ip)}`,
    },
    { name: 'login-ip', ttl: MINUTE_MS, limit: attemptsPerMinute * 5 },
  ];
}

function emailOf(body: unknown): string | null {
  const email = (body as { email?: unknown } | null)?.email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
}
