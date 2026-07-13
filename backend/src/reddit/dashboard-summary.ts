import { RedditAccountStatus } from '@prisma/client';

/** Which week the dashboard summarizes. */
export type DashboardRangeKey = 'this-week' | 'last-week';

/** The resolved date window a summary covers, plus a human label for the topbar. */
export interface DashboardRange {
  from: string; // ISO-8601 inclusive lower bound
  to: string; // ISO-8601 inclusive upper bound
  label: string; // e.g. "Jul 6 – Jul 12, 2026"
}

/** One tracked account's metrics for the selected week. */
export interface DashboardAccountRow {
  id: string;
  username: string;
  status: RedditAccountStatus;
  lastCheckedAt: string | null;
  /** Comments posted within the range. 0 when the account errored. */
  weeklyComments: number;
  /** Posts (submissions) made within the range. 0 when the account errored. */
  weeklyPosts: number;
  /** Current total karma from Reddit, or null when the account errored. */
  karma: number | null;
  /**
   * Karma gained so far this week = current karma − this week's baseline
   * snapshot. null when the account errored or no baseline exists yet.
   */
  karmaThisWeek: number | null;
  /**
   * Karma gained across last week = this week's baseline − last week's baseline.
   * null until baselines exist for two consecutive weeks (the "collecting data"
   * state).
   */
  karmaLastWeek: number | null;
  /** Owning shiller's email — populated for admins only. */
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
  /**
   * Weekly comment-quota target aggregated across in-scope accounts — the sum of
   * each account's owner's per-account `weeklyCommentQuota`. 0 when no accounts.
   */
  commentQuotaTarget: number;
  /** Weekly post-quota target, aggregated the same way from `weeklyPostQuota`. */
  postQuotaTarget: number;
}

/** Full payload of `GET /api/reddit/dashboard`. */
export interface DashboardSummary {
  range: DashboardRange;
  kpis: DashboardKpis;
  accounts: DashboardAccountRow[];
  /**
   * True when this response was served from cache but one or more accounts were
   * stale/cold and a background refresh was kicked off. The UI can use it to show
   * an "updating…" hint and silently re-fetch once to pick up fresher numbers.
   */
  refreshing?: boolean;
}
