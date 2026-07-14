import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedditAccountStatus } from '@prisma/client';
import axios, {
  AxiosInstance,
  AxiosResponse,
  isAxiosError,
  RawAxiosResponseHeaders,
  AxiosResponseHeaders,
} from 'axios';
import {
  RedditComment,
  RedditListing,
  toRedditComment,
} from './reddit-comment';

// Reddit's token endpoint lives on www.reddit.com; authenticated API calls on
// oauth.reddit.com. Kept as constants so the two hosts are never confused.
const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_API_BASE_URL = 'https://oauth.reddit.com';

// Reddit's first-party Devvit CLI OAuth client — a *public* client (no secret).
// A refresh token must be refreshed against the SAME client that minted it, so
// this must match how REDDIT_REFRESH_TOKEN was obtained:
//   - copy-paste login flow (`~/.devvit/token` has "copyPaste": true) → this id
//   - localhost login flow                                            → 'Bep8X2RRjuoyuxkKsKxFuQ'
// Override with REDDIT_OAUTH_CLIENT_ID if your token came from the localhost flow
// (or if Reddit rotates the id, which would otherwise break refresh).
const DEFAULT_DEVVIT_CLIENT_ID = 'TWTsqXa53CexlrYGBWaesQ';

// Refresh the cached access token this long before its real expiry, so an
// in-flight request never races a token that expires mid-call.
const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 2 * 60 * 1000;

// Reddit allows 60 requests/min per OAuth client. We throttle globally to stay
// under that with one shared credential, regardless of how many callers hit us.
const RATE_LIMIT_MAX_REQUESTS = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// Comment paging safety cap: at most this many 100-item pages per read, so a wide
// date range can't fan out into an unbounded crawl of an account's whole history.
const MAX_COMMENT_PAGES = 10;
const COMMENTS_PAGE_LIMIT = 100;

/** A minted access token and the epoch-ms at which it should be considered stale. */
interface CachedAccessToken {
  accessToken: string;
  expiresAt: number;
}

/** Sleep helper for the rate-limit gate. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single choke point for all Reddit API access.
 *
 * Every Reddit call in Dash goes through this service — controllers never talk
 * to Reddit directly. It owns the required User-Agent header, minting/caching a
 * bearer token from the one shared Devvit refresh token, and error normalization.
 * Because Reddit comment history is public, a single `scope=*` token reads any
 * tracked account by username; there is no per-account OAuth.
 */
@Injectable()
export class RedditService {
  private readonly logger = new Logger(RedditService.name);

  // Shared axios instance so the mandatory User-Agent is set on every request
  // (Reddit rejects requests without a descriptive one). No baseURL because the
  // token host (www) and API host (oauth) differ.
  private readonly http: AxiosInstance;

  // In-memory cache of the current access token. Reddit access tokens live 24h;
  // caching avoids a token exchange on every read and is safe because there is a
  // single shared credential (not per-request/per-user state).
  private cachedToken: CachedAccessToken | null = null;

  // Single-flight guard for token minting: when the cache is cold and many reads
  // fire at once (e.g. a parallel dashboard refresh), they share one in-flight
  // refresh instead of each hitting Reddit's token endpoint — concurrent refreshes
  // of the same grant are otherwise rejected, spuriously erroring a row.
  private tokenMintInFlight: Promise<string> | null = null;

  // Epoch-ms timestamps of recent Reddit API requests, used to enforce the global
  // 60/min budget. Entries older than the rolling window are pruned on each admit.
  private requestTimestamps: number[] = [];

  // Serializes slot admission: concurrent callers queue on this chain so only one
  // computes/waits at a time and they can't collectively overshoot the budget.
  private throttleChain: Promise<void> = Promise.resolve();

  // Explicit backoff floor (epoch-ms) set from X-Ratelimit-Reset when Reddit says
  // the remaining budget is exhausted; 0 means no active backoff.
  private rateLimitResetAt = 0;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      headers: {
        'User-Agent': this.config.getOrThrow<string>('REDDIT_USER_AGENT'),
      },
    });
  }

  /**
   * Admit one Reddit API request through the global rate-limit gate, blocking the
   * caller until a slot is free. Admissions are serialized on a promise chain so
   * parallel callers queue in order rather than racing the same budget.
   */
  private acquireSlot(): Promise<void> {
    const run = this.throttleChain.then(() => this.waitForSlot());
    // Swallow errors on the chain so one caller's failure doesn't wedge the queue.
    this.throttleChain = run.catch(() => undefined);
    return run;
  }

  /** Wait until sending now respects both the rolling 60/min window and any backoff. */
  private async waitForSlot(): Promise<void> {
    // Honor an explicit backoff from a prior "remaining ~0" response first.
    const backoffMs = this.rateLimitResetAt - Date.now();
    if (backoffMs > 0) {
      await sleep(backoffMs);
    }

    this.pruneTimestamps();
    // At capacity: wait until the oldest request ages out of the rolling window.
    if (this.requestTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      const waitMs =
        this.requestTimestamps[0] + RATE_LIMIT_WINDOW_MS - Date.now();
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      this.pruneTimestamps();
    }
    this.requestTimestamps.push(Date.now());
  }

  /** Drop request timestamps that have fallen outside the rolling window. */
  private pruneTimestamps(): void {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > cutoff);
  }

  /**
   * Feed Reddit's rate-limit headers back into the gate: when the remaining budget
   * hits ~0, set a backoff floor at the advertised reset so we pause proactively
   * instead of eating a 429.
   */
  private updateRateLimitFromHeaders(
    headers: RawAxiosResponseHeaders | AxiosResponseHeaders,
  ): void {
    const remaining = Number(headers['x-ratelimit-remaining']);
    const resetSeconds = Number(headers['x-ratelimit-reset']);
    if (
      !Number.isNaN(remaining) &&
      remaining <= 1 &&
      !Number.isNaN(resetSeconds)
    ) {
      this.rateLimitResetAt = Date.now() + resetSeconds * 1000;
    }
  }

  /**
   * Perform a throttled authenticated GET against the Reddit API, updating the
   * rate-limit gate from the response headers. Every oauth.reddit.com call in this
   * service goes through here so the 60/min budget is enforced in one place.
   */
  private async redditGet<T>(
    url: string,
    accessToken: string,
  ): Promise<AxiosResponse<T>> {
    await this.acquireSlot();
    const response = await this.http.get<T>(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    this.updateRateLimitFromHeaders(response.headers);
    return response;
  }

  /**
   * Return a valid Reddit bearer access token, minting a fresh one from the
   * shared Devvit refresh token when the cache is empty or near expiry.
   *
   * Uses HTTP Basic auth with the public Devvit client id and an empty secret
   * (`base64("<clientId>:")`), exactly as the devvit CLI does.
   * @throws BadRequestException if Reddit rejects the refresh (e.g. revoked token).
   */
  async getAccessToken(): Promise<string> {
    // Serve the cached token until it enters the pre-expiry buffer window.
    if (
      this.cachedToken &&
      Date.now() < this.cachedToken.expiresAt - ACCESS_TOKEN_EXPIRY_BUFFER_MS
    ) {
      return this.cachedToken.accessToken;
    }

    // Coalesce concurrent cold-cache callers onto one mint; the first to arrive
    // starts it, the rest await the same promise.
    if (this.tokenMintInFlight) {
      return this.tokenMintInFlight;
    }
    this.tokenMintInFlight = this.mintAccessToken().finally(() => {
      this.tokenMintInFlight = null;
    });
    return this.tokenMintInFlight;
  }

  /**
   * Exchange the shared Devvit refresh token for a fresh access token and cache it.
   * Always routed through {@link getAccessToken}'s single-flight guard, so at most
   * one refresh request is in flight at a time.
   * @throws BadRequestException if Reddit rejects the refresh (e.g. revoked token).
   */
  private async mintAccessToken(): Promise<string> {
    const clientId = this.config.get<string>(
      'REDDIT_OAUTH_CLIENT_ID',
      DEFAULT_DEVVIT_CLIENT_ID,
    );
    const refreshToken = this.config.getOrThrow<string>('REDDIT_REFRESH_TOKEN');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    try {
      const { data } = await this.http.post<{
        access_token: string;
        expires_in: number;
      }>(REDDIT_TOKEN_URL, body.toString(), {
        // Public client: username = client id, password = empty string.
        auth: { username: clientId, password: '' },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      this.cachedToken = {
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };
      return this.cachedToken.accessToken;
    } catch (err) {
      // Reason: never log the refresh/access token — only the status/context.
      this.logger.warn(
        `Reddit token refresh failed: ${
          isAxiosError(err) ? err.response?.status : 'unknown error'
        }`,
      );
      throw new BadRequestException('Failed to obtain a Reddit access token.');
    }
  }

  /**
   * Validate that a Reddit account exists and report its health, via the shared
   * token. Called when a shiller adds an account by username.
   * @returns the account's canonical username (correct casing from Reddit), a
   *   status (`suspended` if Reddit flags it, otherwise `active`), and its current
   *   total karma — the karma lets the caller seed a link-time trend baseline
   *   without a second Reddit call (this is the same `/about` payload `getAccountStats`
   *   reads).
   * @throws NotFoundException if no such account exists (Reddit 404).
   * @throws BadRequestException on any other lookup failure.
   */
  async validateUsername(username: string): Promise<{
    name: string;
    status: RedditAccountStatus;
    totalKarma: number;
  }> {
    const accessToken = await this.getAccessToken();
    try {
      const { data } = await this.redditGet<{
        data: {
          name: string;
          is_suspended?: boolean;
          total_karma?: number;
          link_karma?: number;
          comment_karma?: number;
        };
      }>(
        `${REDDIT_API_BASE_URL}/user/${encodeURIComponent(username)}/about`,
        accessToken,
      );

      const about = data.data;
      // `total_karma` is the modern aggregate; fall back to link+comment for older
      // payloads (same derivation as `getAccountStats`).
      const totalKarma =
        about.total_karma ??
        (about.link_karma ?? 0) + (about.comment_karma ?? 0);

      return {
        name: about.name,
        status: about.is_suspended
          ? RedditAccountStatus.suspended
          : RedditAccountStatus.active,
        totalKarma,
      };
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      // Reddit returns 404 for a nonexistent/shadowbanned handle.
      if (status === 404) {
        throw new NotFoundException(`Reddit user u/${username} not found.`);
      }
      this.logger.warn(
        `Reddit user lookup failed: ${status ?? 'unknown error'}`,
      );
      throw new BadRequestException('Failed to look up the Reddit account.');
    }
  }

  /**
   * Fetch an account's current health and total karma from `/about`, via the
   * shared token. Used by the dashboard to show per-account karma and status
   * without needing per-account OAuth.
   *
   * @param username the Reddit account (canonical casing).
   * @returns the account's status (`suspended` if Reddit flags it, else `active`)
   *   and current total karma.
   * @throws NotFoundException if no such account exists (Reddit 404).
   * @throws BadRequestException on any other lookup failure.
   */
  async getAccountStats(
    username: string,
  ): Promise<{ status: RedditAccountStatus; totalKarma: number }> {
    const accessToken = await this.getAccessToken();
    try {
      const { data } = await this.redditGet<{
        data: {
          is_suspended?: boolean;
          total_karma?: number;
          link_karma?: number;
          comment_karma?: number;
        };
      }>(
        `${REDDIT_API_BASE_URL}/user/${encodeURIComponent(username)}/about`,
        accessToken,
      );

      const about = data.data;
      // `total_karma` is the modern aggregate; fall back to link+comment for
      // older payloads that don't include it.
      const totalKarma =
        about.total_karma ??
        (about.link_karma ?? 0) + (about.comment_karma ?? 0);

      return {
        status: about.is_suspended
          ? RedditAccountStatus.suspended
          : RedditAccountStatus.active,
        totalKarma,
      };
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      if (status === 404) {
        throw new NotFoundException(`Reddit user u/${username} not found.`);
      }
      this.logger.warn(
        `Reddit user stats lookup failed: ${status ?? 'unknown error'}`,
      );
      throw new BadRequestException('Failed to look up the Reddit account.');
    }
  }

  /**
   * Fetch a Reddit account's comments, newest-first, optionally bounded to a
   * date range. Comment history is public, so this reads via the shared token.
   *
   * With no `from` bound a single most-recent page (100 comments) is returned.
   * When `from` is set, pages are followed via the `after` cursor until a comment
   * older than `from` is seen (the listing is descending), the cursor runs out, or
   * {@link MAX_COMMENT_PAGES} is reached — whichever comes first. `to` filters out
   * anything newer than the upper bound without stopping the crawl.
   *
   * @param username the Reddit account (canonical casing from `validateUsername`).
   * @param range optional ISO-8601 `from`/`to` bounds (inclusive).
   * @throws NotFoundException if the account no longer exists (Reddit 404).
   * @throws BadRequestException on any other fetch failure.
   */
  async getComments(
    username: string,
    range: { from?: string; to?: string } = {},
  ): Promise<RedditComment[]> {
    const accessToken = await this.getAccessToken();
    const fromMs = range.from ? new Date(range.from).getTime() : undefined;
    const toMs = range.to ? new Date(range.to).getTime() : undefined;

    const collected: RedditComment[] = [];
    let after: string | null = null;
    let page = 0;
    // Set once we page past the lower bound, to stop the descending crawl.
    let crossedFrom = false;

    try {
      do {
        const url = new URL(
          `${REDDIT_API_BASE_URL}/user/${encodeURIComponent(username)}/comments`,
        );
        url.searchParams.set('limit', String(COMMENTS_PAGE_LIMIT));
        url.searchParams.set('raw_json', '1'); // don't HTML-escape comment bodies
        // No explicit `sort`: the user comments listing is already newest-first by
        // default, which the descending-crawl early-break below relies on. Passing
        // `sort=new` makes Reddit serve a stale sorted-listing edge cache, freezing
        // counts at old values — so we deliberately omit it.
        if (after) {
          url.searchParams.set('after', after);
        }

        const { data } = await this.redditGet<RedditListing>(
          url.toString(),
          accessToken,
        );
        const children = data.data.children ?? [];

        for (const child of children) {
          const createdMs = child.data.created_utc * 1000;
          // Upper bound: skip anything newer than `to` (can occur on page 1).
          if (toMs !== undefined && createdMs > toMs) {
            continue;
          }
          // Lower bound: the listing is descending, so the first comment older
          // than `from` means every later one is too — stop here.
          if (fromMs !== undefined && createdMs < fromMs) {
            crossedFrom = true;
            break;
          }
          collected.push(toRedditComment(child));
        }

        after = data.data.after;
        page += 1;
        // Only keep paging for a bounded (`from`-set) range we haven't yet crossed,
        // while a cursor exists and we're under the page cap. No `from` → one page.
      } while (
        fromMs !== undefined &&
        !crossedFrom &&
        after &&
        page < MAX_COMMENT_PAGES
      );

      return collected;
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      if (status === 404) {
        throw new NotFoundException(`Reddit user u/${username} not found.`);
      }
      this.logger.warn(
        `Reddit comment fetch failed: ${status ?? 'unknown error'}`,
      );
      throw new BadRequestException('Failed to fetch the account comments.');
    }
  }

  /**
   * Count a Reddit account's posts (submissions) within a date range, via the
   * shared token. Powers the dashboard's weekly post-quota progress.
   *
   * Mirrors {@link getComments}' descending-listing crawl: pages `/submitted`
   * via the `after` cursor until a submission older than `from` is seen (the
   * listing is newest-first), the cursor runs out, or {@link MAX_COMMENT_PAGES}
   * is reached. Only the count is returned — post bodies aren't rendered anywhere
   * yet, so we don't project them.
   *
   * @param username the Reddit account (canonical casing).
   * @param range ISO-8601 `from`/`to` bounds (inclusive); `from` is required for
   *   a meaningful weekly count — without it only the newest page is counted.
   * @throws NotFoundException if the account no longer exists (Reddit 404).
   * @throws BadRequestException on any other fetch failure.
   */
  async getWeeklyPostCount(
    username: string,
    range: { from?: string; to?: string } = {},
  ): Promise<number> {
    const accessToken = await this.getAccessToken();
    const fromMs = range.from ? new Date(range.from).getTime() : undefined;
    const toMs = range.to ? new Date(range.to).getTime() : undefined;

    let count = 0;
    let after: string | null = null;
    let page = 0;
    // Set once we page past the lower bound, to stop the descending crawl.
    let crossedFrom = false;

    try {
      do {
        const url = new URL(
          `${REDDIT_API_BASE_URL}/user/${encodeURIComponent(username)}/submitted`,
        );
        url.searchParams.set('limit', String(COMMENTS_PAGE_LIMIT));
        url.searchParams.set('raw_json', '1');
        // Same as getComments: omit `sort` and rely on the default newest-first
        // listing. `sort=new` triggers Reddit's stale sorted-listing cache.
        if (after) {
          url.searchParams.set('after', after);
        }

        const { data } = await this.redditGet<RedditListing>(
          url.toString(),
          accessToken,
        );
        const children = data.data.children ?? [];

        for (const child of children) {
          const createdMs = child.data.created_utc * 1000;
          // Upper bound: skip anything newer than `to` (can occur on page 1).
          if (toMs !== undefined && createdMs > toMs) {
            continue;
          }
          // Lower bound: descending listing, so the first post older than `from`
          // means every later one is too — stop here.
          if (fromMs !== undefined && createdMs < fromMs) {
            crossedFrom = true;
            break;
          }
          count += 1;
        }

        after = data.data.after;
        page += 1;
      } while (
        fromMs !== undefined &&
        !crossedFrom &&
        after &&
        page < MAX_COMMENT_PAGES
      );

      return count;
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      if (status === 404) {
        throw new NotFoundException(`Reddit user u/${username} not found.`);
      }
      this.logger.warn(
        `Reddit post fetch failed: ${status ?? 'unknown error'}`,
      );
      throw new BadRequestException('Failed to fetch the account posts.');
    }
  }
}
