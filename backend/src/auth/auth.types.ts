import { UserRole } from '@prisma/client';

/** Claims carried by an access token. `sub` is the user id. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

/** Claims carried by a refresh token — deliberately minimal. */
export interface RefreshTokenPayload {
  sub: string;
}

/** The authenticated principal attached to `request.user` by JwtStrategy. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
}
