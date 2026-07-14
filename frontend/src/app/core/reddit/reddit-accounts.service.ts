import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AccountComments,
  DashboardRange,
  DashboardSummary,
  RedditAccount,
} from './reddit.models';

/**
 * Client for the shiller-only `/api/reddit` endpoints. Every call requires a
 * `shiller` session; the backend enforces this with `@Roles('shiller')` and the
 * bearer token is attached automatically by `authInterceptor`.
 */
@Injectable({ providedIn: 'root' })
export class RedditAccountsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/reddit`;

  /** List the current shiller's tracked Reddit accounts, oldest first. */
  list(): Observable<RedditAccount[]> {
    return this.http.get<RedditAccount[]>(`${this.baseUrl}/accounts`);
  }

  /**
   * Fetch the role-scoped dashboard summary (KPIs + per-account weekly metrics)
   * for the given week. Admins get all accounts; shillers get only their own.
   *
   * @param range which week to summarize.
   * @param force when true, ask the backend to bypass its metrics cache and
   *   re-poll Reddit synchronously (a user-triggered "Refresh").
   */
  dashboard(
    range: DashboardRange = 'this-week',
    force = false,
  ): Observable<DashboardSummary> {
    let params = new HttpParams().set('range', range);
    if (force) {
      params = params.set('refresh', 'true');
    }
    return this.http.get<DashboardSummary>(`${this.baseUrl}/dashboard`, {
      params,
    });
  }

  /**
   * Track a new Reddit account by its public username. The backend validates the
   * username against Reddit and returns the created account.
   */
  addAccount(redditUsername: string): Observable<RedditAccount> {
    return this.http.post<RedditAccount>(`${this.baseUrl}/accounts`, {
      redditUsername,
    });
  }

  /** Stop tracking one of the current shiller's Reddit accounts by id. */
  unlink(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/accounts/${id}`);
  }

  /**
   * List a specific shiller's tracked accounts (admin drill-down from /shillers).
   * Requires an `admin` session; the backend enforces it with `@Roles('admin')`.
   */
  listForUser(userId: string): Observable<RedditAccount[]> {
    return this.http.get<RedditAccount[]>(
      `${this.baseUrl}/users/${userId}/accounts`,
    );
  }

  /**
   * Fetch an account's comments, newest-first, optionally within a date range.
   * ISO `from`/`to` bounds are sent only when provided. The backend authorizes
   * admin (any account) / shiller (own only), returning 404 otherwise.
   */
  comments(
    accountId: string,
    from?: string,
    to?: string,
  ): Observable<AccountComments> {
    let params = new HttpParams();
    if (from) {
      params = params.set('from', from);
    }
    if (to) {
      params = params.set('to', to);
    }
    return this.http.get<AccountComments>(
      `${this.baseUrl}/accounts/${accountId}/comments`,
      { params },
    );
  }
}
