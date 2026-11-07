import { createHash } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { ExtractJwt, Strategy as JwtStrategyBase } from 'passport-jwt';
import { Strategy as LocalStrategyBase } from 'passport-local';
import {
  API_KEY_REPOSITORY_PORT,
  type ApiKeyRepositoryPort,
} from '../../application/ports/auth.ports';
import { AuthenticateUserUseCase } from '../../application/use-cases/authenticate-user.use-case';
import type { Principal, Role } from '../../domain/auth/principal';
import { AppConfig } from '../config/app-config';

/** POST /api/auth/login: email + password → user principal (then a JWT is issued). */
@Injectable()
export class LocalStrategy extends PassportStrategy(LocalStrategyBase, 'local') {
  constructor(private readonly auth: AuthenticateUserUseCase) {
    super({ usernameField: 'email', passwordField: 'password' });
  }

  async validate(email: string, password: string): Promise<Principal> {
    const user = await this.auth.execute(email, password);
    if (!user) throw new UnauthorizedException('invalid email or password');
    return { kind: 'user', userId: user.id, email: user.email, role: user.role };
  }
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/** Authorization: Bearer <jwt> for suppliers and analysts. */
@Injectable()
export class JwtStrategy extends PassportStrategy(JwtStrategyBase, 'jwt') {
  constructor(config: AppConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.auth.jwtSecret,
      ignoreExpiration: false,
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtPayload): Principal {
    return { kind: 'user', userId: payload.sub, email: payload.email, role: payload.role };
  }
}

/** X-API-Key: <secret> for integrations; the key acts for the supplier it belongs to. */
@Injectable()
export class ApiKeyStrategy extends PassportStrategy(HeaderAPIKeyStrategy, 'headerapikey') {
  constructor(@Inject(API_KEY_REPOSITORY_PORT) private readonly keys: ApiKeyRepositoryPort) {
    super({ header: 'X-API-Key', prefix: '' }, false);
  }

  async validate(secret: string): Promise<Principal> {
    const key = await this.keys.findBySecretHash(createHash('sha256').update(secret).digest('hex'));
    if (!key) throw new UnauthorizedException('invalid api key');
    return { kind: 'api-key', keyId: key.id, supplierId: key.supplierId };
  }
}
