import { createHash } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { ExtractJwt, Strategy as JwtStrategyBase } from 'passport-jwt';
import { Strategy as LocalStrategyBase } from 'passport-local';
import {
  API_KEY_REPOSITORY_PORT,
  type ApiKeyRepositoryPort,
  USER_REPOSITORY_PORT,
  type UserRepositoryPort,
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
    if (!user) throw new UnauthorizedException('Correo o contraseña incorrectos');
    return { kind: 'user', userId: user.id, email: user.email, role: user.role };
  }
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/** Who signs our JWTs and who they are for: a token minted for anything else is rejected. */
export const JWT_ISSUER = 'gowcredit-api';
export const JWT_AUDIENCE = 'gowcredit-web';

/**
 * Authorization: Bearer <jwt> for suppliers and analysts. The signature, algorithm, expiry, issuer and
 * audience are checked, then the user is read again: a deleted user is rejected at once, and the role
 * comes from the database, not from the token, so a role change applies before the token expires.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(JwtStrategyBase, 'jwt') {
  constructor(
    config: AppConfig,
    @Inject(USER_REPOSITORY_PORT) private readonly users: UserRepositoryPort,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.auth.jwtSecret,
      ignoreExpiration: false,
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }

  async validate(payload: JwtPayload): Promise<Principal> {
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return { kind: 'user', userId: user.id, email: user.email, role: user.role };
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
    if (!key) throw new UnauthorizedException('API key inválida');
    return { kind: 'api-key', keyId: key.id, supplierId: key.supplierId };
  }
}
