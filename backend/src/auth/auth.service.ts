import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash } from 'crypto';
import ms, { StringValue } from 'ms';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { comparePassword } from '../common/crypto/password.util';
import { PublicUser, toPublicUser } from '../users/public-user';
import { AccessTokenPayload, RefreshTokenPayload } from './auth.types';

/** Tokens plus the sanitized user, returned on login and refresh. */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

// Default refresh-token lifetime if JWT_REFRESH_EXPIRES is unset.
const DEFAULT_REFRESH_EXPIRES = '7d';

/**
 * Owns credential validation and the JWT access/refresh lifecycle. Refresh
 * tokens are persisted only as SHA-256 hashes, enabling rotation and revocation
 * without ever storing (or being able to leak) the raw token.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Validate email/password for login.
   * @returns the matching user.
   * @throws UnauthorizedException if the user is unknown or the password wrong.
   */
  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.users.findByEmail(email);
    // Reason: identical error for unknown email vs wrong password — no enumeration.
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return user;
  }

  /** Issue a fresh access+refresh pair and persist the refresh grant. */
  async login(user: User): Promise<AuthResult> {
    return this.issueTokens(user);
  }

  /**
   * Rotate a refresh token: verify it, revoke the presented grant, issue a new
   * pair. Rotation means a stolen-then-used token can be used at most once.
   * @throws UnauthorizedException if the token is invalid, revoked, or expired.
   */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const tokenHash = this.hashToken(refreshToken);
    const grant = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    // Reject unknown, already-revoked, or expired grants (replay protection).
    if (!grant || grant.revokedAt || grant.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotation: invalidate the old grant before minting the replacement.
    await this.prisma.refreshToken.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(user);
  }

  /**
   * Revoke the presented refresh token (single-session logout). Unknown or
   * already-revoked tokens are a no-op, so logout is safely idempotent.
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // --- internals ---------------------------------------------------------

  /** Sign both tokens and persist a hash of the refresh token. */
  private async issueTokens(user: User): Promise<AuthResult> {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.signRefreshToken(user);
    await this.persistRefreshToken(user.id, refreshToken);
    return { accessToken, refreshToken, user: toPublicUser(user) };
  }

  private signAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      // Cast: config returns a plain string; jsonwebtoken narrows to StringValue.
      expiresIn: this.config.get<string>(
        'JWT_ACCESS_EXPIRES',
        '15m',
      ) as JwtSignOptions['expiresIn'],
    });
  }

  private signRefreshToken(user: User): Promise<string> {
    const payload: RefreshTokenPayload = { sub: user.id };
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.refreshExpires() as JwtSignOptions['expiresIn'],
    });
  }

  private async verifyRefreshToken(
    token: string,
  ): Promise<RefreshTokenPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      // Signature/expiry failures are all surfaced as a generic 401.
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /** The configured refresh-token lifetime (e.g. `7d`), with a safe default. */
  private refreshExpires(): string {
    return this.config.get<string>(
      'JWT_REFRESH_EXPIRES',
      DEFAULT_REFRESH_EXPIRES,
    );
  }

  /**
   * Persist only a SHA-256 hash of the refresh token — never the token itself.
   * `expiresAt` is derived from the same TTL string jsonwebtoken uses, so the DB
   * grant expires exactly when the JWT does.
   */
  private async persistRefreshToken(
    userId: string,
    token: string,
  ): Promise<void> {
    const expiresAt = new Date(
      Date.now() + ms(this.refreshExpires() as StringValue),
    );
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hashToken(token), expiresAt },
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
