import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import {
  API_KEY_REPOSITORY_PORT,
  PASSWORD_HASHER_PORT,
  type PasswordHasherPort,
  USER_REPOSITORY_PORT,
  type UserRepositoryPort,
} from '../../application/ports/auth.ports';
import { AuthenticateUserUseCase } from '../../application/use-cases/authenticate-user.use-case';
import { AppConfig } from '../config/app-config';
import { TypeOrmUserRepository } from '../persistence/repositories/typeorm-user.repository';
import { Argon2PasswordHasher } from './argon2-password-hasher';
import { ApiAuthGuard, RolesGuard } from './guards';
import { loginThrottlers } from './login-throttle';
import { ApiKeyStrategy, JWT_AUDIENCE, JWT_ISSUER, JwtStrategy, LocalStrategy } from './strategies';

/** Passport wiring (ADR 0005): local → JWT for users, X-API-Key for integrations, global guards. */
@Global()
@Module({
  imports: [
    PassportModule,
    // Only routes with @UseGuards(ThrottlerGuard) are limited (login); there is no global guard.
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: loginThrottlers(config.auth.loginAttemptsPerMinute),
        errorMessage: 'Demasiados intentos. Espera un minuto y vuelve a intentarlo',
      }),
    }),
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.auth.jwtSecret,
        signOptions: {
          expiresIn: config.auth.jwtTtlSeconds,
          algorithm: 'HS256',
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      }),
    }),
  ],
  providers: [
    {
      provide: TypeOrmUserRepository,
      inject: [DataSource],
      useFactory: (ds: DataSource) => new TypeOrmUserRepository(ds),
    },
    { provide: USER_REPOSITORY_PORT, useExisting: TypeOrmUserRepository },
    { provide: API_KEY_REPOSITORY_PORT, useExisting: TypeOrmUserRepository },
    { provide: PASSWORD_HASHER_PORT, useValue: new Argon2PasswordHasher() },
    {
      provide: AuthenticateUserUseCase,
      inject: [USER_REPOSITORY_PORT, PASSWORD_HASHER_PORT],
      useFactory: (users: UserRepositoryPort, hasher: PasswordHasherPort) =>
        new AuthenticateUserUseCase(users, hasher),
    },
    LocalStrategy,
    JwtStrategy,
    ApiKeyStrategy,
    { provide: APP_GUARD, useClass: ApiAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtModule, USER_REPOSITORY_PORT, PASSWORD_HASHER_PORT],
})
export class AuthModule {}
