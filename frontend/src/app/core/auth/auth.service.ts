import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, AuthUser, UserRole } from './auth.models';

// localStorage keys. Namespaced to avoid collisions with other apps on the origin.
const ACCESS_TOKEN_KEY = 'dash.accessToken';
const REFRESH_TOKEN_KEY = 'dash.refreshToken';
const USER_KEY = 'dash.user';

/**
 * Client-side session store and auth API client.
 *
 * Holds the current user as a signal so components and guards react to login/
 * logout without manual subscriptions. Tokens live in localStorage so a page
 * reload rehydrates the session.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/auth`;

  // Seeded from storage so a reload restores the session before first render.
  private readonly _currentUser = signal<AuthUser | null>(this.readStoredUser());

  /** The signed-in user, or null when logged out. */
  readonly currentUser = this._currentUser.asReadonly();

  /** True when a user is signed in. Drives guards and shell chrome. */
  readonly isAuthenticated = computed(() => this._currentUser() !== null);

  /** The current user's role, or null when logged out. */
  readonly role = computed<UserRole | null>(
    () => this._currentUser()?.role ?? null,
  );

  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  /** Authenticate with email/password and persist the resulting session. */
  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/login`, { email, password })
      .pipe(tap((res) => this.storeSession(res)));
  }

  /** Exchange the stored refresh token for a new (rotated) session. */
  refresh(): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/refresh`, {
        refreshToken: this.refreshToken,
      })
      .pipe(tap((res) => this.storeSession(res)));
  }

  /**
   * Revoke the session server-side, then clear it locally. The local clear runs
   * even if the request fails, so logout never leaves a stuck session.
   */
  logout(): Observable<void> {
    const refreshToken = this.refreshToken;
    // Send the revoke while the access token is still present (route is guarded).
    const request = refreshToken
      ? this.http.post<void>(`${this.baseUrl}/logout`, { refreshToken })
      : of(void 0);
    return request.pipe(
      catchError(() => of(void 0)),
      tap(() => this.clearSession()),
    );
  }

  /** Drop all session state. Public so the interceptor can force-logout on a dead refresh. */
  clearSession(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._currentUser.set(null);
  }

  /** Persist tokens + user and update the reactive session state. */
  private storeSession(res: AuthResponse): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, res.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this._currentUser.set(res.user);
  }

  /** Read the persisted user, tolerating absent or corrupt storage. */
  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      // Corrupt entry — treat as logged out rather than crashing on boot.
      return null;
    }
  }
}
