import { describe, expect, it, vi } from 'vitest';
import { templateQuestions } from '../clarification/question-templates';
import type { Decision, MissingInfo } from '../../domain/eligibility/engine';
import type { CaseRecord, CaseRepositoryPort } from '../ports/case-repository.port';
import type {
  ClarificationRecord,
  ClarificationRepositoryPort,
  MailMessage,
} from '../ports/clarification.ports';
import type { LoggerPort } from '../ports/logger.port';
import {
  AnswerClarificationUseCase,
  ClarificationClosedError,
} from './answer-clarification.use-case';
import type { DecideCaseUseCase } from './decide-case.use-case';
import { MAX_OWNER_ROUNDS, RequestClarificationUseCase } from './request-clarification.use-case';
import { ShareOwnerLinkUseCase } from './share-owner-link.use-case';

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const clock = { now: () => new Date('2025-04-05T12:00:00Z') };

class FakeRequests implements ClarificationRepositoryPort {
  rows: (ClarificationRecord & { tokenHash: string | null })[] = [];
  async create(r: Parameters<ClarificationRepositoryPort['create']>[0]) {
    const row = {
      ...r,
      id: `r${this.rows.length + 1}`,
      answers: null,
      forAnalyst: null,
      createdAt: clock.now(),
      answeredAt: null,
    };
    this.rows.push(row);
    return row;
  }
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findOpenByTokenHash(hash: string) {
    return this.rows.find((r) => r.tokenHash === hash && r.status === 'open') ?? null;
  }
  async findOpenByCase(caseId: string) {
    return this.rows.find((r) => r.caseId === caseId && r.status === 'open') ?? null;
  }
  async listByCase(caseId: string) {
    return this.rows.filter((r) => r.caseId === caseId);
  }
  async countOwnerRounds(caseId: string) {
    return this.rows.filter((r) => r.caseId === caseId && r.status !== 'escalated').length;
  }
  async markAnswered(
    id: string,
    answers: ClarificationRecord['answers'] & object,
    forAnalyst: ClarificationRecord['forAnalyst'],
  ) {
    const r = this.rows.find((x) => x.id === id && x.status === 'open');
    if (r) Object.assign(r, { status: 'answered', answers, forAnalyst, tokenHash: null });
  }
  async markSuperseded(id: string) {
    const r = this.rows.find((x) => x.id === id);
    if (r) Object.assign(r, { status: 'superseded', tokenHash: null });
  }
  async rotateToken(id: string, tokenHash: string, expiresAt: Date) {
    const r = this.rows.find((x) => x.id === id && x.status === 'open');
    if (r) Object.assign(r, { tokenHash, expiresAt });
    return !!r;
  }
}

const theCase = (over: Partial<CaseRecord> = {}): CaseRecord => ({
  id: 'c1',
  status: 'AWAITING_OWNER',
  supplierId: 's1',
  ownerEmail: 'owner@demo.mx',
  facts: {},
  decision: null,
  createdAt: clock.now(),
  updatedAt: clock.now(),
  documents: [],
  extractions: [],
  ...over,
});
const needs = (...codes: MissingInfo['code'][]): Decision =>
  ({
    outcome: 'NEEDS_INFO',
    missing: codes.map((code) => ({ code, ruleId: 'x', detail: 'd' })),
  }) as unknown as Decision;

function setup(c = theCase()) {
  const requests = new FakeRequests();
  const sent: MailMessage[] = [];
  let state = c;
  const cases = {
    findCase: vi.fn(async () => state),
    setFacts: vi.fn(async (_id: string, facts: CaseRecord['facts']) => {
      state = { ...state, facts };
    }),
  } as unknown as CaseRepositoryPort;
  let n = 0;
  const ask = new RequestClarificationUseCase(
    cases,
    requests,
    { write: async (m, ctx) => ({ questions: templateQuestions(m, ctx), by: 'template' }) },
    {
      generate: () => ({ token: `tok${++n}`, hash: `hash${n}` }),
      hash: (t) => t.replace('tok', 'hash'),
    },
    { send: async (m) => void sent.push(m) },
    clock,
    logger,
    'http://localhost:5173/',
  );
  return { requests, sent, cases, ask, getCase: () => state };
}

describe('RequestClarificationUseCase', () => {
  it('emails the owner the Spanish questions and a single-use magic link', async () => {
    const { ask, sent, requests } = setup();
    const r = await ask.execute('c1', needs('INVOICE_DUE_DATE'));
    expect(r).toMatchObject({
      status: 'open',
      round: 1,
      questions: [{ code: 'INVOICE_DUE_DATE', type: 'provide_value' }],
    });
    expect(requests.rows[0]?.tokenHash).toBe('hash1');
    expect(r?.expiresAt?.toISOString()).toBe('2025-04-12T12:00:00.000Z');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('owner@demo.mx');
    expect(sent[0]?.text).toContain('http://localhost:5173/owner#tok1');
    expect(sent[0]?.text).toContain('fecha de vencimiento');
  });

  it('does not resend the same questions; supersedes the open request when they change', async () => {
    const { ask, sent, requests } = setup();
    await ask.execute('c1', needs('INVOICE_DUE_DATE', 'SAT_STATUS'));
    await ask.execute('c1', needs('SAT_STATUS', 'INVOICE_DUE_DATE'));
    expect(sent).toHaveLength(1);
    await ask.execute('c1', needs('RECENT_STATEMENT'));
    expect(requests.rows.map((r) => r.status)).toEqual(['superseded', 'open']);
    expect(sent).toHaveLength(2);
  });

  it(`escalates to an analyst after ${MAX_OWNER_ROUNDS} rounds or without an owner email`, async () => {
    const { ask, requests, sent } = setup();
    for (const code of [
      'INVOICE_DUE_DATE',
      'SAT_STATUS',
      'RFC_CONFIRMATION',
      'RECENT_STATEMENT',
    ] as const)
      await ask.execute('c1', needs(code));
    expect(requests.rows.at(-1)).toMatchObject({ status: 'escalated', tokenHash: null });
    expect(sent).toHaveLength(MAX_OWNER_ROUNDS);

    const noOwner = setup(theCase({ ownerEmail: null }));
    expect(await noOwner.ask.execute('c1', needs('INVOICE_DUE_DATE'))).toMatchObject({
      status: 'escalated',
    });
    expect(noOwner.sent).toHaveLength(0);
  });
});

describe('AnswerClarificationUseCase', () => {
  function answering(
    normalized: Awaited<ReturnType<AnswerClarificationUseCase['execute']>> | null = null,
  ) {
    const s = setup();
    const decide = {
      execute: vi.fn(async () => ({ outcome: 'QUALIFIES' })),
    } as unknown as DecideCaseUseCase;
    const normalizer = {
      normalize: vi.fn(async (code: MissingInfo['code'], text: string) =>
        text.includes('junio') ? { code, kind: 'date' as const, value: '2025-06-15', text } : null,
      ),
    };
    void normalized;
    const answer = new AnswerClarificationUseCase(
      s.cases,
      s.requests,
      normalizer,
      decide,
      clock,
      logger,
    );
    return { ...s, decide, normalizer, answer };
  }

  it('stores typed answers as facts, closes the request and decides again', async () => {
    const { ask, answer, decide, requests, getCase } = answering();
    const r = await ask.execute('c1', needs('INVOICE_DUE_DATE'));
    const out = await answer.execute(r!.id, [{ code: 'INVOICE_DUE_DATE', value: '2025-05-20' }]);
    expect(getCase().facts).toEqual({ invoiceDueDate: '2025-05-20' });
    expect(requests.rows[0]).toMatchObject({ status: 'answered', tokenHash: null });
    expect(decide.execute).toHaveBeenCalledWith('c1');
    expect(out.outcome).toBe('QUALIFIES');
    await expect(answer.execute(r!.id, [])).rejects.toBeInstanceOf(ClarificationClosedError);
  });

  it('normalizes free text with the T5 agent and rejects what it cannot read', async () => {
    const { ask, answer, getCase } = answering();
    const r = await ask.execute('c1', needs('INVOICE_DUE_DATE'));
    await expect(
      answer.execute(r!.id, [{ code: 'INVOICE_DUE_DATE', text: 'pronto' }]),
    ).rejects.toThrow(/could not read/);
    await answer.execute(r!.id, [{ code: 'INVOICE_DUE_DATE', text: 'vence el 15 de junio' }]);
    expect(getCase().facts.invoiceDueDate).toBe('2025-06-15');
  });

  it('rejects answers to questions that were not asked', async () => {
    const { ask, answer } = answering();
    const r = await ask.execute('c1', needs('INVOICE_DUE_DATE'));
    await expect(answer.execute(r!.id, [{ code: 'SAT_STATUS', value: true }])).rejects.toThrow(
      /not asked/,
    );
  });
});

describe('ShareOwnerLinkUseCase', () => {
  const fresh = {
    generate: () => ({ token: 'fresh', hash: 'hash-fresh' }),
    hash: (t: string) => t,
  };

  it('replaces the emailed link with a fresh one, returned once', async () => {
    const { ask, requests } = setup();
    await ask.execute('c1', needs('INVOICE_DUE_DATE'));
    const share = new ShareOwnerLinkUseCase(
      requests,
      fresh,
      clock,
      logger,
      'http://localhost:5173/',
    );
    const out = await share.execute('c1', { userId: 'a1' });
    expect(out).toMatchObject({ link: 'http://localhost:5173/owner#fresh', round: 1 });
    expect(await requests.findOpenByTokenHash('hash1')).toBeNull(); // the emailed link
    expect(await requests.findOpenByTokenHash('hash-fresh')).not.toBeNull();
  });

  it('returns null when the case has no open owner request', async () => {
    const { requests } = setup();
    const share = new ShareOwnerLinkUseCase(requests, fresh, clock, logger, 'http://x');
    expect(await share.execute('c1', { userId: 'a1' })).toBeNull();
  });
});
