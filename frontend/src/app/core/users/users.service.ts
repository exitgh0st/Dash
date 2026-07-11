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

  /**
   * Create a shiller account. The backend forces `role = shiller`, so only the
   * credentials are sent. A duplicate email surfaces as a 409 for the caller.
   */
  create(email: string, password: string): Observable<AuthUser> {
    return this.http.post<AuthUser>(this.baseUrl, { email, password });
  }
}
