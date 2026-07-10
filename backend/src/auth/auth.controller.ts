import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthResult, AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
// `import type`: used only as a decorated-param type (isolatedModules requirement).
import type { AuthenticatedUser } from './auth.types';
import { UsersService } from '../users/users.service';
import { PublicUser, toPublicUser } from '../users/public-user';

/**
 * Authentication endpoints under `/api/auth`. Thin: delegates all logic to
 * AuthService. Login and refresh are `@Public()`; the rest require a valid
 * access token via the global JwtAuthGuard.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  /** Exchange email/password for an access+refresh token pair. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResult> {
    const user = await this.auth.validateCredentials(dto.email, dto.password);
    return this.auth.login(user);
  }

  /** Exchange a valid refresh token for a new (rotated) token pair. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResult> {
    return this.auth.refresh(dto.refreshToken);
  }

  /** Revoke the presented refresh token (this session). */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  /** Return the currently authenticated user (fresh from the DB). */
  @Get('me')
  async me(@CurrentUser() principal: AuthenticatedUser): Promise<PublicUser> {
    const user = await this.users.findById(principal.userId);
    // Token is valid but the user was since deleted — treat as unauthenticated.
    if (!user) {
      throw new UnauthorizedException();
    }
    return toPublicUser(user);
  }
}
