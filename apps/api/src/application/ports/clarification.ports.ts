import type { Answer, Question } from '../../domain/clarification/questions';
import type { MissingInfo, MissingInfoCode } from '../../domain/eligibility/engine';

export type ClarificationStatus = 'open' | 'answered' | 'superseded' | 'escalated';

export interface ClarificationRecord {
  id: string;
  caseId: string;
  round: number;
  status: ClarificationStatus;
  questions: Question[];
  answers: Answer[] | null;
  forAnalyst: { code: MissingInfoCode; text: string }[] | null;
  /** Why it went to an analyst instead of the owner (escalated only). */
  reason: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  answeredAt: Date | null;
}

export interface ClarificationRepositoryPort {
  create(
    r: Omit<ClarificationRecord, 'id' | 'createdAt' | 'answeredAt' | 'answers' | 'forAnalyst'> & {
      tokenHash: string | null;
    },
  ): Promise<ClarificationRecord>;
  findById(id: string): Promise<ClarificationRecord | null>;
  findOpenByTokenHash(hash: string, now: Date): Promise<ClarificationRecord | null>;
  findOpenByCase(caseId: string): Promise<ClarificationRecord | null>;
  listByCase(caseId: string): Promise<ClarificationRecord[]>;
  /** Rounds sent to the owner so far (open, answered or superseded). */
  countOwnerRounds(caseId: string): Promise<number>;
  markAnswered(
    id: string,
    answers: Answer[],
    forAnalyst: ClarificationRecord['forAnalyst'],
  ): Promise<void>;
  markSuperseded(id: string): Promise<void>;
  /** Replaces the magic-link token of an open request; false if it is no longer open. */
  rotateToken(id: string, tokenHash: string, expiresAt: Date): Promise<boolean>;
}
export const CLARIFICATION_REPOSITORY_PORT = Symbol('ClarificationRepositoryPort');

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export interface MailerPort {
  send(message: MailMessage): Promise<void>;
}
export const MAILER_PORT = Symbol('MailerPort');

export interface QuestionContext {
  periodEnd: string | null;
  invoiceUuid: string | null;
}

/** Writes the Spanish questions for the missing information (T5 agent, ADR 0010). */
export interface QuestionWriterPort {
  write(
    missing: readonly MissingInfo[],
    context: QuestionContext,
  ): Promise<{ questions: Question[]; by: 'llm' | 'template' }>;
}
export const QUESTION_WRITER_PORT = Symbol('QuestionWriterPort');

/** Turns an owner's free text ("vence el 15 de junio") into a typed answer, or null if it cannot. */
export interface AnswerNormalizerPort {
  normalize(code: MissingInfoCode, text: string, today: string): Promise<Answer | null>;
}
export const ANSWER_NORMALIZER_PORT = Symbol('AnswerNormalizerPort');

/** Magic-link secrets: the plaintext goes in the email, only the hash is stored. */
export interface SecretTokenPort {
  generate(): { token: string; hash: string };
  hash(token: string): string;
}
export const SECRET_TOKEN_PORT = Symbol('SecretTokenPort');
