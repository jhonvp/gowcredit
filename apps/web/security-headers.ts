/**
 * Response headers for the built web app. CloudFront sends them in AWS (a response headers policy in
 * infra/terraform/modules/web/main.tf repeats these values; keep both in sync), and `vite preview`
 * sends them locally so the e2e suite can run against the production build with the same policy.
 *
 * - Scripts and styles only from this origin: an injected <script> or inline handler does not run.
 * - frame-src blob: is the analyst's PDF viewer (an object URL); a blob document inherits this
 *   policy, and Chromium's PDF viewer counts as a plugin, so object-src allows blob: too.
 * - frame-ancestors 'none': no other site can frame the app (clickjacking).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  'frame-src blob:',
  "object-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};
