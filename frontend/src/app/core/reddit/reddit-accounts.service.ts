import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  Observable,
  catchError,
  concatMap,
  from,
  map,
  of,
  scan,
  startWith,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AccountComments,
  DashboardAccountRow,
  DashboardRange,
  DashboardSummary,
  MergedCommentsProgress,
  RedditAccount,
  TaggedComment,
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
   */
  dashboard(range: DashboardRange = 'this-week'): Observable<DashboardSummary> {
    const params = new HttpParams().set('range', range);
    return this.http.get<DashboardSummary>(`${this.baseUrl}/dashboard`, {
      params,
    });
  }

  /**
   * Force-refresh a single account from Reddit and return its updated dashboard row.
   * The dashboard calls this once per account, sequentially, so a fleet refresh is
   * split into many small requests instead of one that times out.
   *
   * @param accountId the account to refresh.
   * @param range which week's counts to refresh (defaults to the current week).
   */
  refreshAccount(
    accountId: string,
    range: DashboardRange = 'this-week',
  ): Observable<DashboardAccountRow> {
    const params = new HttpParams().set('range', range);
    return this.http.post<DashboardAccountRow>(
      `${this.baseUrl}/accounts/${accountId}/refresh`,
      null,
      { params },
    );
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
   * Fetch one page of an account's comments, newest-first, optionally within a
   * date range. Every option is sent only when provided. The backend authorizes
   * admin (any account) / shiller (own only), returning 404 otherwise.
   *
   * @param accountId the account to read.
   * @param opts.from/opts.to ISO-8601 bounds (inclusive).
   * @param opts.after cursor from a previous response — returns strictly older
   *   comments, which is how the paged history feed walks back through time.
   */
  comments(
    accountId: string,
    opts: { from?: string; to?: string; after?: string } = {},
  ): Observable<AccountComments> {
    let params = new HttpParams();
    if (opts.from) {
      params = params.set('from', opts.from);
    }
    if (opts.to) {
      params = params.set('to', opts.to);
    }
    if (opts.after) {
      params = params.set('after', opts.after);
    }
    return this.http.get<AccountComments>(
      `${this.baseUrl}/accounts/${accountId}/comments`,
      { params },
    );
  }

  /**
   * Walk several accounts' comments **one at a time** and merge them into a single
   * newest-first feed, emitting after every account so the caller can render
   * progressively instead of waiting for the whole fleet.
   *
   * Sequential by design: `concatMap` keeps exactly one request open at a time,
   * mirroring the dashboard's per-account refresh walk. This isn't slower than a
   * parallel fan-out — the backend already serializes every Reddit call behind a
   * global 60/min token bucket — but it lets the first account's comments paint
   * immediately instead of blocking on the slowest one.
   *
   * One failing account contributes an empty slice (`catchError`) rather than
   * aborting the walk, so a suspended or deleted account can't blank the feed.
   *
   * @param accountIds accounts to walk, in the order they should be fetched.
   * @param opts.limit max items kept in the merged feed (newest win).
   * @returns progress emissions, starting with an immediate empty `0 of N`.
   */
  mergedComments(
    accountIds: string[],
    opts: { limit: number },
  ): Observable<MergedCommentsProgress> {
    const { limit } = opts;
    const total = accountIds.length;
    const initial: MergedCommentsProgress = { comments: [], done: 0, total };
    if (total === 0) {
      return of(initial);
    }

    return from(accountIds).pipe(
      // One open request at a time; a dead account yields an empty slice.
      concatMap((id) =>
        this.comments(id).pipe(
          map((res) =>
            res.comments.map<TaggedComment>((c) => ({
              ...c,
              account: res.account.redditUsername,
            })),
          ),
          catchError(() => of([] as TaggedComment[])),
        ),
      ),
      scan(
        (
          state: MergedCommentsProgress,
          slice: TaggedComment[],
        ): MergedCommentsProgress => ({
          comments: [...state.comments, ...slice]
            .sort((a, b) => b.createdUtc.localeCompare(a.createdUtc))
            .slice(0, limit),
          done: state.done + 1,
          total,
        }),
        initial,
      ),
      // Emit an empty "0 of N" up front so the caller can show progress immediately.
      startWith(initial),
    );
  }
}
