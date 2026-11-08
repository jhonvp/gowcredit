// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Hexagonal boundaries for apps/api (ADR 0001):
 *   domain          → imports nothing outside domain (pure TS)
 *   application     → imports domain only (ports are interfaces it owns)
 *   infrastructure  → imports application + domain (adapters implement ports)
 *   interfaces      → imports application + domain (+ Nest), never infrastructure adapters directly
 * Framework/IO packages are banned in domain and application.
 */
const FRAMEWORK_AND_IO = [
  '@nestjs/*',
  'typeorm',
  'pg',
  'nestjs-pino',
  'pino',
  'pino-*',
  'dd-trace',
  '@anthropic-ai/*',
  '@aws-sdk/*',
  'nodemailer',
  'passport',
  'passport-*',
  'express',
  'node:fs',
  'node:fs/*',
  'fs',
  'node:http',
  'node:child_process',
  'child_process',
];

const restrict = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
});

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'fixtures/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/api/src/domain/**/*.ts'],
    rules: restrict(
      [...FRAMEWORK_AND_IO, '**/application/**', '**/infrastructure/**', '**/interfaces/**'],
      'domain must stay pure TypeScript (ADR 0001)',
    ),
  },
  {
    files: ['apps/api/src/application/**/*.ts'],
    rules: restrict(
      [...FRAMEWORK_AND_IO, '**/infrastructure/**', '**/interfaces/**'],
      'application depends only on domain and its own ports (ADR 0001)',
    ),
  },
  {
    files: ['apps/api/src/interfaces/**/*.ts'],
    rules: restrict(
      ['**/infrastructure/**/adapters/**'],
      'interfaces talk to use cases, not to adapters (ADR 0001)',
    ),
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: restrict(['**/apps/api/**'], 'web consumes @gowcredit/contracts, never api sources'),
  },
  {
    // Rules of Hooks + exhaustive deps: stale closures and missing effect cleanup are lint errors.
    files: ['apps/web/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
  },
  {
    files: [
      'scripts/**/*.{ts,mjs}',
      'apps/*/scripts/**/*.ts',
      '**/*.config.{ts,mjs,mts}',
      'apps/api/test/**/*.ts',
    ],
    rules: { 'no-console': 'off' },
  },
);
