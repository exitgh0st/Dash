import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthUser } from '../auth/auth.models';

/**
 * Client for the admin-only `/api/users` endpoints. Both calls require an
 * `admin` session; the backend enforces this with `@Roles('admin')` and the
 * bearer token is attached automatically by `authInterceptor`.
 *
 * `AuthUser` is reused as the response type because the backend `PublicUser`
 * shape (id/email/role/timestamps, no password hash) is identical.
 */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/users`;

  /** List all Dash users (admins + shillers), oldest first. */
  list(): Observable<AuthUser[]> {
    return this.http.get<AuthUser[]>(this.baseUrl);
  }

  /** Fetch a single user by id (e.g. to prefill the edit dialog). */
  get(id: string): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${this.baseUrl}/${id}`);
  }

  /**
   * Create a shiller account. The backend forces `role = shiller`, so only the
   * credentials are sent. A duplicate email surfaces as a 409 for the caller.
   */
  create(email: string, password: string): Observable<AuthUser> {
    return this.http.post<AuthUser>(this.baseUrl, { email, password });
  }

  /**
   * Update a shiller's email, password, and/or weekly quotas. Fields left
   * undefined are not sent, so the caller can change just one. Duplicate email → 409.
   */
  update(
    id: string,
    changes: {
      email?: string;
      password?: string;
      weeklyCommentQuota?: number;
      weeklyPostQuota?: number;
    },
  ): Observable<AuthUser> {
    return this.http.patch<AuthUser>(`${this.baseUrl}/${id}`, changes);
  }

  /** Delete a user. The backend rejects deleting an admin (403). */
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
