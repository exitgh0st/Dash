/** Dash account roles. Mirrors the backend `UserRole` enum. */
export type UserRole = 'admin' | 'shiller';

/** The authenticated user as returned by the API (no password hash). */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  /** Owned Reddit-account count — only present on the admin `/api/users` list. */
  redditAccountCount?: number;
}

/** Payload returned by `/auth/login` and `/auth/refresh`. */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
