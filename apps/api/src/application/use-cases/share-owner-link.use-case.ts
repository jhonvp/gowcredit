import { ownerLink } from '../clarification/owner-link';
import type { ClarificationRepositoryPort, SecretTokenPort } from '../ports/clarification.ports';
import type { ClockPort } from '../ports/clock.port';
import type { LoggerPort } from '../ports/logger.port';
import { LINK_TTL_DAYS } from './request-clarification.use-case';

export interface SharedOwnerLink {
  link: string;
  expiresAt: Date;
  round: number;
}

/**
 * Gives an analyst the owner's magic link for the open request (e.g. a local demo, or to send it by
 * phone). Only the token's hash is stored, so the link cannot be read back: a new token replaces the
 * old one, the emailed link stops working, and the new link is returned once. Off unless enabled.
 */
export class ShareOwnerLinkUseCase {
  constructor(
    private readonly requests: ClarificationRepositoryPort,
    private readonly tokens: SecretTokenPort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
    private readonly webBaseUrl: string,
  ) {}

  /** null when the case has no open owner request. */
  async execute(caseId: string, by: { userId: string }): Promise<SharedOwnerLink | null> {
    const open = await this.requests.findOpenByCase(caseId);
    if (!open) return null;
    const { token, hash } = this.tokens.generate();
    const expiresAt = new Date(this.clock.now().getTime() + LINK_TTL_DAYS * 86_400_000);
    if (!(await this.requests.rotateToken(open.id, hash, expiresAt))) return null;
    this.logger.info('owner link shared', {
      caseId,
      requestId: open.id,
      round: open.round,
      analystId: by.userId,
    });
    return {
      link: ownerLink(this.webBaseUrl, token),
      expiresAt,
      round: open.round,
    };
  }
}
