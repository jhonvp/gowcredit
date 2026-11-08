import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { LlmRequest, LlmResponse } from '../../application/ports/llm.port';

/**
 * Record/replay fixtures (ADR 0004). The key is the SHA-256 of the canonical request (model id,
 * prompt, document text, tools, schema, history), so any change to the prompt or the input
 * misses the fixture instead of silently replaying a stale answer.
 *
 * Fixtures store the response only, plus metadata to find it. Prompts live in code; document text
 * is never written here.
 */
export interface Fixture {
  key: string;
  purpose: string;
  model: string;
  recordedAt: string;
  response: LlmResponse;
}

export class FixtureStore {
  constructor(readonly dir: string) {}

  key(request: LlmRequest, modelId: string): string {
    return createHash('sha256')
      .update(canonicalJson({ ...request, model: modelId }))
      .digest('hex');
  }

  path(purpose: string, key: string): string {
    return join(this.dir, purpose.replace(/[^a-z0-9.@-]+/gi, '_'), `${key}.json`);
  }

  read(purpose: string, key: string): Fixture | null {
    const file = this.path(purpose, key);
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Fixture) : null;
  }

  write(fixture: Fixture): string {
    const file = this.path(fixture.purpose, fixture.key);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(fixture, null, 2) + '\n');
    return file;
  }
}

/** JSON with object keys sorted at every level and undefined dropped: stable across runs. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

/** Default fixture dir: `<repo>/fixtures/llm`, found by walking up to pnpm-workspace.yaml. */
export function defaultFixturesDir(start = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return join(dir, 'fixtures/llm');
    const parent = dirname(dir);
    if (parent === dir) return resolve(start, 'fixtures/llm');
    dir = parent;
  }
}
