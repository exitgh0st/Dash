/** Lifecycle status of a linked Reddit account (mirrors the backend enum). */
export type RedditAccountStatus = 'active' | 'banned' | 'suspended' | 'error';

/**
 * A linked Reddit account as returned by `/api/reddit/accounts`. Matches the
 * backend `PublicRedditAccount` projection — the encrypted refresh token is never
 * sent to the client.
 */
export interface RedditAccount {
  id: string;
  redditUsername: string;
  status: RedditAccountStatus;
  lastCheckedAt: string | null;
  createdAt: string;
}

/**
 * A single comment as returned by `/api/reddit/accounts/:id/comments`. Matches the
 * backend `RedditComment` projection — timestamps are ISO strings and `permalink`
 * is an absolute reddit.com URL.
 */
export interface RedditComment {
  id: string;
  body: string;
  subreddit: string;
  score: number;
  createdUtc: string;
  permalink: string;
}

/** Response of the comments endpoint: the account plus its comments, newest-first. */
export interface AccountComments {
  account: RedditAccount;
  comments: RedditComment[];
}

/** Which week the dashboard summarizes (mirrors the backend `DashboardRangeKey`). */
export type DashboardRange = 'this-week' | 'last-week';

/** The resolved date window a summary covers, plus a label for the topbar. */
export interface DashboardRangeInfo {
  from: string;
  to: string;
  label: string;
}

/** One tracked account's weekly metrics, as returned by `/api/reddit/dashboard`. */
export interface DashboardAccountRow {
  id: string;
  username: string;
  status: RedditAccountStatus;
  lastCheckedAt: string | null;
  weeklyComments: number;
  /** Posts (submissions) made this week; 0 when the account errored. */
  weeklyPosts: number;
  /** Current total karma, or null when the account errored. */
  karma: number | null;
  /** Karma gained so far this week (live − this-week baseline); null if errored. */
  karmaThisWeek: number | null;
  /** Karma gained last week; null until two consecutive weekly baselines exist. */
  karmaLastWeek: number | null;
  /** Owning shiller's email — present for admins only. */
  ownerEmail?: string;
}

/** Aggregate figures across the in-scope accounts. */
export interface DashboardKpis {
  weeklyComments: number;
  /** Sum of posts made this week across in-scope accounts. */
  weeklyPosts: number;
  totalAccounts: number;
  activeAccounts: number;
  totalKarma: number;
  /** Sum of per-account karma gained so far this week. */
  karmaGainedThisWeek: number;
  /** Weekly comment-quota target, summed from each account's owner's quota. */
  commentQuotaTarget: number;
  /** Weekly post-quota target, summed from each account's owner's quota. */
  postQuotaTarget: number;
}

/** Full payload of `GET /api/reddit/dashboard`. */
export interface DashboardSummary {
  range: DashboardRangeInfo;
  kpis: DashboardKpis;
  accounts: DashboardAccountRow[];
  /**
   * True when the response was served from cache with a background refresh in
   * flight (some accounts were stale). The dashboard silently re-fetches once to
   * pick up the fresher numbers.
   */
  refreshing?: boolean;
}
