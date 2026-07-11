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
  /** Current total karma, or null when the account errored. */
  karma: number | null;
  /** Owning shiller's email — present for admins only. */
  ownerEmail?: string;
}

/** Aggregate figures across the in-scope accounts. */
export interface DashboardKpis {
  weeklyComments: number;
  totalAccounts: number;
  activeAccounts: number;
  totalKarma: number;
}

/** Full payload of `GET /api/reddit/dashboard`. */
export interface DashboardSummary {
  range: DashboardRangeInfo;
  kpis: DashboardKpis;
  accounts: DashboardAccountRow[];
}
