import { Controller, Get, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { LoginResponse, Me } from '@gowcredit/contracts';
import { USER_REPOSITORY_PORT, type UserRepositoryPort } from '../../application/ports/auth.ports';
import type { Principal } from '../../domain/auth/principal';
import type { JwtPayload } from '../../infrastructure/auth/strategies';
import { AllowPrincipals, CurrentPrincipal, Public } from '../../infrastructure/auth/guards';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwt: JwtService,
    @Inject(USER_REPOSITORY_PORT) private readonly users: UserRepositoryPort,
  ) {}

  /**
   * Body: { email, password } (validated by the local strategy). The throttler runs first, so failed
   * attempts count too; over the limit the answer is 429 with Retry-After.
   */
  @Post('login')
  @Public()
  @UseGuards(ThrottlerGuard, AuthGuard('local'))
  @HttpCode(200)
  async login(@CurrentPrincipal() p: Principal): Promise<LoginResponse> {
    if (p.kind !== 'user') throw new Error('unreachable');
    const payload: JwtPayload = { sub: p.userId, email: p.email, role: p.role };
    const user = await this.users.findById(p.userId);
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: p.userId, email: p.email, role: p.role, name: user?.name ?? p.email },
    };
  }

  @Get('me')
  @AllowPrincipals('user')
  async me(@CurrentPrincipal() p: Principal): Promise<Me> {
    if (p.kind !== 'user') throw new Error('unreachable');
    const user = await this.users.findById(p.userId);
    return { id: p.userId, email: p.email, role: p.role, name: user?.name ?? p.email };
  }
}
