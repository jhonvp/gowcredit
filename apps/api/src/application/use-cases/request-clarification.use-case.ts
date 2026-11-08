import { ownerLink } from '../clarification/owner-link';
import type { Decision } from '../../domain/eligibility/engine';
import type { CaseRepositoryPort } from '../ports/case-repository.port';
import type {
  ClarificationRecord,
  ClarificationRepositoryPort,
  MailerPort,
  QuestionWriterPort,
  SecretTokenPort,
} from '../ports/clarification.ports';
import type { ClockPort } from '../ports/clock.port';
import type { LoggerPort } from '../ports/logger.port';

/** The first request plus two follow-ups (ADR 0010); after that an analyst takes over. */
export const MAX_OWNER_ROUNDS = 3;
export const LINK_TTL_DAYS = 7;

/**
 * NEEDS_INFO → ask the document owner (ADR 0008): one open request per case with the questions for
 * the current missing information, a single-use expiring magic link, and an email. The same open
 * questions are never sent twice; new missing information supersedes the open request.
 */
export class RequestClarificationUseCase {
  constructor(
    private readonly cases: CaseRepositoryPort,
    private readonly requests: ClarificationRepositoryPort,
    private readonly writer: QuestionWriterPort,
    private readonly tokens: SecretTokenPort,
    private readonly mailer: MailerPort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
    private readonly webBaseUrl: string,
  ) {}

  async execute(caseId: string, decision: Decision): Promise<ClarificationRecord | null> {
    if (decision.outcome !== 'NEEDS_INFO' || decision.missing.length === 0) return null;
    const c = await this.cases.findCase(caseId);
    if (!c) return null;

    const codes = decision.missing
      .map((m) => m.code)
      .sort()
      .join(',');
    const open = await this.requests.findOpenByCase(caseId);
    if (open) {
      if (
        open.questions
          .map((q) => q.code)
          .sort()
          .join(',') === codes
      )
        return open;
      await this.requests.markSuperseded(open.id);
    }

    const rounds = await this.requests.countOwnerRounds(caseId);
    if (!c.ownerEmail || rounds >= MAX_OWNER_ROUNDS) {
      const reason = !c.ownerEmail
        ? 'no owner email on the case'
        : `owner already asked ${rounds} times`;
      this.logger.info('clarification escalated to analyst', { caseId, reason });
      return this.requests.create({
        caseId,
        round: rounds + 1,
        status: 'escalated',
        questions: [],
        reason,
        expiresAt: null,
        tokenHash: null,
      });
    }

    const statement = c.extractions.find((e) => e.statement)?.statement;
    const invoice = c.extractions.find((e) => e.invoice)?.invoice;
    const { questions, by } = await this.writer.write(decision.missing, {
      periodEnd: statement?.summary.periodEnd ?? null,
      invoiceUuid: invoice?.uuid ?? null,
    });
    const { token, hash } = this.tokens.generate();
    const expiresAt = new Date(this.clock.now().getTime() + LINK_TTL_DAYS * 86_400_000);
    const request = await this.requests.create({
      caseId,
      round: rounds + 1,
      status: 'open',
      questions,
      reason: null,
      expiresAt,
      tokenHash: hash,
    });

    const link = ownerLink(this.webBaseUrl, token);
    const list = questions.map((q, i) => `${i + 1}. ${q.text}`);
    await this.mailer.send({
      to: c.ownerEmail,
      subject: 'GowCredit: necesitamos información para su solicitud de pago anticipado',
      text: [
        'Hola,',
        '',
        'Para continuar con la evaluación de su solicitud necesitamos lo siguiente:',
        '',
        ...list,
        '',
        `Responda aquí (enlace válido por ${LINK_TTL_DAYS} días, de un solo uso): ${link}`,
        '',
        'Gracias,',
        'GowCredit',
      ].join('\n'),
      html: `<p>Hola,</p><p>Para continuar con la evaluación de su solicitud necesitamos lo siguiente:</p><ol>${questions
        .map((q) => `<li>${escapeHtml(q.text)}</li>`)
        .join(
          '',
        )}</ol><p><a href="${link}">Responder</a> (enlace válido por ${LINK_TTL_DAYS} días, de un solo uso).</p><p>GowCredit</p>`,
    });
    this.logger.info('clarification requested', {
      caseId,
      round: request.round,
      codes,
      writtenBy: by,
    });
    return request;
  }
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string,
  );
