import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Principal, Role } from '../../domain/auth/principal';

const PUBLIC = 'auth:public';
const ROLES = 'auth:roles';
const PRINCIPALS = 'auth:principals';

/** No authentication (health, login, magic-link entry points handle their own). */
export const Public = () => SetMetadata(PUBLIC, true);
/** Restrict a user route to these roles. API keys count as the supplier role. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
/** Restrict which principal kinds may call a route (default: user and api-key). */
export const AllowPrincipals = (...kinds: Principal['kind'][]) => SetMetadata(PRINCIPALS, kinds);

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal =>
    ctx.switchToHttp().getRequest().user as Principal,
);

/** Global guard: JWT or API key on every route unless @Public(). */
@Injectable()
export class ApiAuthGuard extends AuthGuard(['jwt', 'headerapikey']) {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    return isPublic ? true : super.canActivate(ctx);
  }
}

/** Global guard: @Roles and @AllowPrincipals checks after authentication. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    const p = ctx.switchToHttp().getRequest().user as Principal | undefined;
    if (!p) return false;
    const kinds = this.reflector.getAllAndOverride<Principal['kind'][]>(PRINCIPALS, targets) ?? [
      'user',
      'api-key',
    ];
    if (!kinds.includes(p.kind)) throw new ForbiddenException();
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (!roles?.length) return true;
    const role: Role | null = p.kind === 'user' ? p.role : p.kind === 'api-key' ? 'supplier' : null;
    if (!role || !roles.includes(role)) throw new ForbiddenException();
    return true;
  }
}
