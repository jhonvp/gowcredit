import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-custom';
import {
  CASE_REPOSITORY_PORT,
  type CaseRepositoryPort,
} from '../../application/ports/case-repository.port';
import {
  CLARIFICATION_REPOSITORY_PORT,
  type ClarificationRepositoryPort,
  SECRET_TOKEN_PORT,
  type SecretTokenPort,
} from '../../application/ports/clarification.ports';
import type { Principal } from '../../domain/auth/principal';

/**
 * Document owner via magic link (ADR 0005/0008): `X-Owner-Token: <token>`. Valid only while its
 * request is open and unexpired; answering clears the hash, so the link is single-use.
 */
@Injectable()
export class MagicLinkStrategy extends PassportStrategy(Strategy, 'magic-link') {
  constructor(
    @Inject(CLARIFICATION_REPOSITORY_PORT) private readonly requests: ClarificationRepositoryPort,
    @Inject(CASE_REPOSITORY_PORT) private readonly cases: CaseRepositoryPort,
    @Inject(SECRET_TOKEN_PORT) private readonly tokens: SecretTokenPort,
  ) {
    super();
  }

  async validate(req: Request): Promise<Principal> {
    const token = req.header('x-owner-token');
    if (!token || token.length > 200) throw new UnauthorizedException('missing owner token');
    const r = await this.requests.findOpenByTokenHash(this.tokens.hash(token), new Date());
    if (!r) throw new UnauthorizedException('link expired or already used');
    const c = await this.cases.findCase(r.caseId);
    return { kind: 'owner', caseId: r.caseId, requestId: r.id, email: c?.ownerEmail ?? '' };
  }
}
