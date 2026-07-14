import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RedditAccountStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedditService } from './reddit.service';
import {
  PublicRedditAccount,
  toPublicRedditAccount,
} from './public-reddit-account';
import { RedditComment } from './reddit-comment';
import type {
  DashboardAccountRow,
  DashboardRange,
  DashboardRangeKey,
  DashboardSummary,
} from './dashboard-summary';
import type { AuthenticatedUser } from '../auth/auth.types';

/** An account plus its fetched comments — the comments-endpoint response shape. */
export interface AccountComments {
  account: PublicRedditAccount;
  comments: RedditComment[];
}

/**
 * A RedditAccount joined with its owner's email (for admin dashboard rows) and
 * per-account weekly quotas (summed into the dashboard's quota targets).
 */
type AccountWithOwner = Prisma.RedditAccountGetPayload<{
  include: {
    user: {
      select: { email: true; weeklyCommentQuota: true; weeklyPostQuota: true };
    };
  };
}>;

// How long a cached AccountWeekMetric stays "fresh". Past this, a dashboard read
// still serves the cached value instantly but kicks off a background refresh.
const METRICS_STALE_MS = 5 * 60 * 1000;

// Cap on concurrent per-account write transactions during a refresh. Each account
// writes in one transaction (one DB connection), so refreshing a large fleet in
// parallel would otherwise exhaust the shared Postgres pool (Supabase's session
// pooler caps at ~15 clients). 5 keeps us comfortably under that while the Reddit
// reads themselves stay fully parallel (bounded only by RedditService's throttle).
const MAX_CONCURRENT_REFRESH_WRITES = 5;

/** The freshly-polled figures a refresh produces (or null when Reddit failed). */
interface RefreshedFigures {
  weeklyComments: number;
  weeklyPosts: number;
  karma: number;
  status: RedditAccountStatus;
}

/** A cached week metric row as loaded for the dashboard read. */
interface CachedWeekMetric {
  weeklyComments: number;
  weeklyPosts: number;
  refreshedAt: Date;
}

/** Monday 00:00:00.000 (local) of the week containing `date`. */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0=Sun..6=Sat. `(day + 6) % 7` = days elapsed since Monday.
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

/** Format a Mon–Sun span like "Jul 6 – Jul 12, 2026" for the topbar. */
function formatRangeLabel(weekStart: Date, weekEnd: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const from = weekStart.toLocaleDateString('en-US', opts);
  const to = weekEnd.toLocaleDateString('en-US', opts);
  return `${from} – ${to}, ${weekEnd.getFullYear()}`;
}

/**
 * Resolve a range key to a concrete window. The label always spans the full
 * Mon–Sun week; the filter `to` is "now" for the current week (we can't count
 * future days) and Sunday 23:59:59.999 for a completed past week.
 */
function resolveRange(key: DashboardRangeKey): DashboardRange {
  const now = new Date();
  const thisWeekStart = startOfWeek(now);

  const isLast = key === 'last-week';
  const weekStart = new Date(thisWeekStart);
  if (isLast) {
    weekStart.setDate(weekStart.getDate() - 7);
  }

  // Sunday 23:59:59.999 of the summarized week.
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  weekEnd.setMilliseconds(-1);

  return {
    from: weekStart.toISOString(),
    to: isLast ? weekEnd.toISOString() : now.toISOString(),
    label: formatRangeLabel(weekStart, weekEnd),
  };
}

/**
 * Orchestrates a shiller's tracked Reddit accounts: validates a username against
 * Reddit and persists/lists/removes RedditAccounts. It sits between the controller
 * and both RedditService (Reddit API) and Prisma (persistence). Accounts are
 * tracked by public username only — no per-account OAuth or token is stored.
 */
@Injectable()
export class RedditAccountsService {
  private readonly logger = new Logger(RedditAccountsService.name);

  // Keys (`accountId:weekStartMs`) of in-flight background refreshes, so
  // overlapping dashboard requests don't spawn duplicate Reddit crawls for the
  // same account/week. Safe as in-memory state on this singleton service — it
  // only guards concurrency, never correctness.
  private readonly refreshingKeys = new Set<string>();

  // Simple counting semaphore bounding concurrent refresh write-transactions to
  // MAX_CONCURRENT_REFRESH_WRITES, so a large-fleet refresh can't exhaust the DB
  // connection pool. `dbWriteQueue` holds resolvers for callers waiting for a slot.
  private dbWriteActive = 0;
  private readonly dbWriteQueue: Array<() => void> = [];

  constructor(
    private readonly reddit: RedditService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Build the role-scoped dashboard summary for the current week (or last week),
   * served from the DB metrics cache (stale-while-revalidate) — no Reddit call in
   * the request path.
   *
   * Admins see every tracked account (with the owner's email); a shiller sees only
   * their own. Per-account weekly counts come from `AccountWeekMetric`; current
   * karma/status come from `RedditAccount`. Accounts whose cache is missing (cold)
   * are refreshed synchronously so their row isn't empty; accounts whose cache is
   * older than {@link METRICS_STALE_MS} are returned stale and refreshed in the
   * background. KPIs are summed from the assembled rows.
   *
   * @param requester the authenticated principal (role decides scope).
   * @param rangeKey which week to summarize; defaults to the current week.
   * @param force when true, bypass the staleness check and re-poll Reddit
   *   synchronously for every in-scope account (a user-triggered "Refresh"), so
   *   the response reflects Reddit's current state rather than the cache.
   */
  async getDashboard(
    requester: AuthenticatedUser,
    rangeKey: DashboardRangeKey = 'this-week',
    force = false,
  ): Promise<DashboardSummary> {
    const range = resolveRange(rangeKey);
    const isAdmin = requester.role === 'admin';

    // Always join the owner (cheap) but only expose it to admins in the row.
    const accounts = await this.prisma.redditAccount.findMany({
      where: isAdmin ? {} : { userId: requester.userId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            email: true,
            weeklyCommentQuota: true,
            weeklyPostQuota: true,
          },
        },
      },
    });

    // Karma-trend baselines are anchored to the *current* week regardless of the
    // viewed range, so viewing "last week" still records this week's baseline.
    const thisWeekStart = startOfWeek(new Date());
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    // The viewed week decides which cached counts to read.
    const viewedWeekStart =
      rangeKey === 'last-week' ? lastWeekStart : thisWeekStart;

    const accountIds = accounts.map((a) => a.id);
    // Two cheap DB reads, no Reddit: karma baselines + the viewed week's cached counts.
    const [baselines, metrics] = await Promise.all([
      this.loadKarmaBaselines(accountIds, thisWeekStart, lastWeekStart),
      this.loadWeekMetrics(accountIds, viewedWeekStart),
    ]);

    const now = Date.now();
    // A forced refresh re-polls every account synchronously (cache bypass); a
    // normal load only refreshes cold rows inline and stale rows in the background.
    // Cold = no cached row yet → must refresh synchronously so the row isn't empty.
    const coldAccounts = accounts.filter((a) => !metrics.get(a.id));
    const syncAccounts = force ? accounts : coldAccounts;
    // Stale = cached but older than the window → serve stale, refresh in background.
    // Skipped entirely on a forced load (every account is refreshed synchronously).
    const staleAccounts = force
      ? []
      : accounts.filter((a) => {
          const m = metrics.get(a.id);
          return (
            m !== undefined && now - m.refreshedAt.getTime() > METRICS_STALE_MS
          );
        });

    // Populate the synchronous set up front (parallelized). Their fresh figures are
    // used directly for this response; the cache is now warm for subsequent loads.
    const freshByAccount = new Map<string, RefreshedFigures | null>();
    await Promise.all(
      syncAccounts.map(async (account) => {
        freshByAccount.set(
          account.id,
          await this.refreshAccountMetrics(
            account,
            range,
            thisWeekStart,
            viewedWeekStart,
          ),
        );
      }),
    );

    // Kick stale accounts' refreshes off without waiting (deduped).
    for (const account of staleAccounts) {
      this.refreshInBackground(account, range, thisWeekStart, viewedWeekStart);
    }

    // Assemble rows from cache + any just-fetched cold figures. Order follows
    // `accounts` (createdAt asc).
    const rows: DashboardAccountRow[] = accounts.map((account) =>
      this.assembleRow(account, isAdmin, {
        metric: metrics.get(account.id) ?? null,
        fresh: freshByAccount.get(account.id),
        baselineThisWeek:
          baselines.get(this.baselineKey(account.id, thisWeekStart)) ?? null,
        baselineLastWeek:
          baselines.get(this.baselineKey(account.id, lastWeekStart)) ?? null,
      }),
    );

    return {
      range,
      kpis: {
        weeklyComments: rows.reduce((sum, r) => sum + r.weeklyComments, 0),
        weeklyPosts: rows.reduce((sum, r) => sum + r.weeklyPosts, 0),
        totalAccounts: rows.length,
        activeAccounts: rows.filter((r) => r.status === 'active').length,
        totalKarma: rows.reduce((sum, r) => sum + (r.karma ?? 0), 0),
        karmaGainedThisWeek: rows.reduce(
          (sum, r) => sum + (r.karmaThisWeek ?? 0),
          0,
        ),
        // Quota targets are per-account: each account contributes its owner's
        // weekly quota, so the target scales with how many accounts are in scope.
        commentQuotaTarget: accounts.reduce(
          (sum, a) => sum + a.user.weeklyCommentQuota,
          0,
        ),
        postQuotaTarget: accounts.reduce(
          (sum, a) => sum + a.user.weeklyPostQuota,
          0,
        ),
      },
      accounts: rows,
      // Signal the UI to silently re-fetch once: only stale (background-refreshing)
      // accounts leave fresher numbers pending — cold ones were refreshed inline.
      refreshing: staleAccounts.length > 0 ? true : undefined,
    };
  }

  /**
   * Batch-load the viewed week's cached metric rows for the given accounts in one
   * query, keyed by accountId. Accounts with no cached row are absent from the map.
   */
  private async loadWeekMetrics(
    accountIds: string[],
    weekStart: Date,
  ): Promise<Map<string, CachedWeekMetric>> {
    const rows = await this.prisma.accountWeekMetric.findMany({
      where: { accountId: { in: accountIds }, weekStart },
      select: {
        accountId: true,
        weeklyComments: true,
        weeklyPosts: true,
        refreshedAt: true,
      },
    });
    const map = new Map<string, CachedWeekMetric>();
    for (const r of rows) {
      map.set(r.accountId, {
        weeklyComments: r.weeklyComments,
        weeklyPosts: r.weeklyPosts,
        refreshedAt: r.refreshedAt,
      });
    }
    return map;
  }

  /**
   * Assemble one dashboard row from cached/just-refreshed figures — no Reddit call.
   *
   * Figure source precedence: a just-fetched cold refresh (`fresh`) wins; otherwise
   * the cached metric + the account's stored karma/status are used. A cold refresh
   * that failed (`fresh === null`) yields an error row.
   */
  private assembleRow(
    account: AccountWithOwner,
    isAdmin: boolean,
    data: {
      metric: CachedWeekMetric | null;
      fresh: RefreshedFigures | null | undefined;
      baselineThisWeek: number | null;
      baselineLastWeek: number | null;
    },
  ): DashboardAccountRow {
    const base = {
      id: account.id,
      username: account.redditUsername,
      ownerEmail: isAdmin ? account.user.email : undefined,
      // Owner id + quotas are admin-only — they drive the frontend's per-shiller
      // rollup (grouping key, group→shiller-detail link, per-shiller quota target).
      ownerId: isAdmin ? account.userId : undefined,
      weeklyCommentQuota: isAdmin ? account.user.weeklyCommentQuota : undefined,
      weeklyPostQuota: isAdmin ? account.user.weeklyPostQuota : undefined,
    };

    // Cold refresh failed and there's no cache to fall back to → error row.
    if (data.fresh === null) {
      return {
        ...base,
        status: RedditAccountStatus.error,
        lastCheckedAt: new Date().toISOString(),
        weeklyComments: 0,
        weeklyPosts: 0,
        karma: account.karma,
        karmaThisWeek: null,
        karmaLastWeek: null,
      };
    }

    // Prefer just-fetched cold figures; else fall back to cache + account snapshot.
    const weeklyComments =
      data.fresh?.weeklyComments ?? data.metric?.weeklyComments ?? 0;
    const weeklyPosts =
      data.fresh?.weeklyPosts ?? data.metric?.weeklyPosts ?? 0;
    const karma = data.fresh?.karma ?? account.karma;
    const status = data.fresh?.status ?? account.status;
    // Freshly refreshed rows are as-of now; cached rows keep the account's stamp.
    const lastCheckedAt = data.fresh
      ? new Date().toISOString()
      : (account.lastCheckedAt?.toISOString() ?? null);

    // Karma trend needs a numeric current karma; skip it when we've never captured one.
    let karmaThisWeek: number | null = null;
    let karmaLastWeek: number | null = null;
    if (karma !== null) {
      ({ karmaThisWeek, karmaLastWeek } = this.computeKarmaTrend(
        karma,
        data.baselineThisWeek,
        data.baselineLastWeek,
      ));
    }

    return {
      ...base,
      status,
      lastCheckedAt,
      weeklyComments,
      weeklyPosts,
      karma,
      karmaThisWeek,
      karmaLastWeek,
    };
  }

  /**
   * Batch-load the karma baselines for this week and last week across the given
   * accounts in one query, keyed by `accountId:weekStartMs` for O(1) lookup.
   */
  private async loadKarmaBaselines(
    accountIds: string[],
    thisWeekStart: Date,
    lastWeekStart: Date,
  ): Promise<Map<string, number>> {
    const snapshots = await this.prisma.karmaSnapshot.findMany({
      where: {
        accountId: { in: accountIds },
        weekStart: { in: [thisWeekStart, lastWeekStart] },
      },
      select: { accountId: true, weekStart: true, karma: true },
    });
    const map = new Map<string, number>();
    for (const s of snapshots) {
      map.set(this.baselineKey(s.accountId, s.weekStart), s.karma);
    }
    return map;
  }

  /** Composite map key for a (account, week) karma baseline. */
  private baselineKey(accountId: string, weekStart: Date): string {
    return `${accountId}:${weekStart.getTime()}`;
  }

  /**
   * Re-poll one account from Reddit and write its results to the cache: the viewed
   * week's comment/post counts (`AccountWeekMetric`), the current karma/status
   * snapshot (`RedditAccount`), and the create-only current-week karma baseline
   * (`KarmaSnapshot`). This is the "revalidate" half of the dashboard's
   * stale-while-revalidate flow — never called from the request's hot path except
   * for cold accounts.
   *
   * Isolated: on a Reddit failure it marks the account `error`, ensures a cache row
   * exists (so the account isn't perpetually re-treated as cold), and returns null
   * rather than throwing — one bad account can't fail the dashboard.
   *
   * @param thisWeekStart current week's Monday (the karma baseline is always
   *   anchored here, even when refreshing last week's counts).
   * @param viewedWeekStart the week whose counts are being refreshed.
   * @returns the fresh figures, or null when Reddit failed.
   */
  private async refreshAccountMetrics(
    account: AccountWithOwner,
    range: DashboardRange,
    thisWeekStart: Date,
    viewedWeekStart: Date,
  ): Promise<RefreshedFigures | null> {
    try {
      // The three reads are independent, so fetch them concurrently. All three
      // still pass through the shared 60/min gate in RedditService, so this is
      // safe on rate limits — it just collapses per-account latency from the sum
      // of the reads to the slowest one (comments/posts crawls + the /about read).
      const [comments, weeklyPosts, stats] = await Promise.all([
        this.reddit.getComments(account.redditUsername, {
          from: range.from,
          to: range.to,
        }),
        this.reddit.getWeeklyPostCount(account.redditUsername, {
          from: range.from,
          to: range.to,
        }),
        this.reddit.getAccountStats(account.redditUsername),
      ]);

      // Persist the current snapshot (karma/status/freshness) + the viewed week's
      // cached counts + the create-only current-week karma baseline as one atomic
      // transaction (a single DB connection), throttled by the write semaphore so a
      // parallel large-fleet refresh can't overrun the connection pool.
      await this.withDbSlot(() =>
        this.prisma.$transaction([
          this.prisma.redditAccount.update({
            where: { id: account.id },
            data: {
              lastCheckedAt: new Date(),
              status: stats.status,
              karma: stats.totalKarma,
            },
          }),
          this.prisma.accountWeekMetric.upsert({
            where: {
              accountId_weekStart: {
                accountId: account.id,
                weekStart: viewedWeekStart,
              },
            },
            create: {
              accountId: account.id,
              weekStart: viewedWeekStart,
              weeklyComments: comments.length,
              weeklyPosts,
              // Explicit now that `refreshedAt` isn't @updatedAt — this is a
              // genuine successful re-poll, so mark the row fresh.
              refreshedAt: new Date(),
            },
            update: {
              weeklyComments: comments.length,
              weeklyPosts,
              refreshedAt: new Date(),
            },
          }),
          // Write-through, create-only: the first karma seen this week becomes an
          // immutable baseline (≈ week-start karma). The empty `update` keeps it
          // frozen on later refreshes the same week.
          this.prisma.karmaSnapshot.upsert({
            where: {
              accountId_weekStart: {
                accountId: account.id,
                weekStart: thisWeekStart,
              },
            },
            create: {
              accountId: account.id,
              weekStart: thisWeekStart,
              karma: stats.totalKarma,
            },
            update: {},
          }),
        ]),
      );

      return {
        weeklyComments: comments.length,
        weeklyPosts,
        karma: stats.totalKarma,
        status: stats.status,
      };
    } catch (err) {
      // Reason: a deleted/suspended account or a transient Reddit failure must not
      // take down the dashboard — mark it errored and move on. Ensure a cache row
      // exists so a cold account isn't retried on the slow *synchronous* path every
      // load — but stamp it as immediately stale (epoch 0) so it's re-polled in the
      // *background* next load until it succeeds. `update: {}` preserves any
      // last-good counts AND the prior `refreshedAt` (no longer @updatedAt), so a
      // transient blip can't reset the staleness clock and freeze a stale count.
      this.logger.warn(
        `Metric refresh failed for u/${account.redditUsername}: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
      try {
        await this.withDbSlot(() =>
          this.prisma.$transaction([
            this.prisma.redditAccount.update({
              where: { id: account.id },
              data: {
                lastCheckedAt: new Date(),
                status: RedditAccountStatus.error,
              },
            }),
            this.prisma.accountWeekMetric.upsert({
              where: {
                accountId_weekStart: {
                  accountId: account.id,
                  weekStart: viewedWeekStart,
                },
              },
              create: {
                accountId: account.id,
                weekStart: viewedWeekStart,
                weeklyComments: 0,
                weeklyPosts: 0,
                // Epoch 0 → the row reads as stale forever until a real refresh
                // succeeds, so it's retried in the background rather than looking fresh.
                refreshedAt: new Date(0),
              },
              update: {},
            }),
          ]),
        );
      } catch (persistErr) {
        this.logger.warn(
          `Failed to persist error state for u/${account.redditUsername}: ${
            persistErr instanceof Error ? persistErr.message : 'unknown error'
          }`,
        );
      }
      return null;
    }
  }

  /**
   * Fire-and-forget a metric refresh for a stale account, deduped so overlapping
   * dashboard requests don't spawn duplicate Reddit crawls for the same account
   * and week. Errors are swallowed (already logged in `refreshAccountMetrics`).
   */
  private refreshInBackground(
    account: AccountWithOwner,
    range: DashboardRange,
    thisWeekStart: Date,
    viewedWeekStart: Date,
  ): void {
    const key = this.baselineKey(account.id, viewedWeekStart);
    if (this.refreshingKeys.has(key)) {
      return;
    }
    this.refreshingKeys.add(key);
    void this.refreshAccountMetrics(
      account,
      range,
      thisWeekStart,
      viewedWeekStart,
    ).finally(() => this.refreshingKeys.delete(key));
  }

  /**
   * Run a DB write through the refresh-write semaphore, blocking until a slot is
   * free so at most {@link MAX_CONCURRENT_REFRESH_WRITES} transactions run at once.
   * Guards the shared connection pool when many accounts refresh in parallel.
   */
  private async withDbSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.dbWriteActive < MAX_CONCURRENT_REFRESH_WRITES) {
      // A slot is free — take it.
      this.dbWriteActive += 1;
    } else {
      // At capacity — wait to be handed a slot directly (the active count is kept
      // reserved for us on transfer, so no separate increment here — this avoids
      // an overshoot race between a resumed waiter and a fresh fast-path caller).
      await new Promise<void>((resolve) => this.dbWriteQueue.push(resolve));
    }
    try {
      return await fn();
    } finally {
      const next = this.dbWriteQueue.shift();
      if (next) {
        // Transfer our slot to the next waiter; the active count stays the same.
        next();
      } else {
        this.dbWriteActive -= 1;
      }
    }
  }

  /**
   * Derive the karma-trend figures from live karma + the two weekly baselines.
   *
   * - `karmaThisWeek` = live − this-week baseline. On the first load of the week
   *   the baseline was just created (= live), so this reads 0 and grows as the
   *   week progresses.
   * - `karmaLastWeek` = this-week baseline − last-week baseline, but only when
   *   *both* baselines already existed before this request. Until then it stays
   *   null (the "collecting data" state), which needs ~2 weeks of usage.
   */
  private computeKarmaTrend(
    liveKarma: number,
    baselineThisWeek: number | null,
    baselineLastWeek: number | null,
  ): { karmaThisWeek: number; karmaLastWeek: number | null } {
    const effectiveThisWeek = baselineThisWeek ?? liveKarma;
    return {
      karmaThisWeek: liveKarma - effectiveThisWeek,
      karmaLastWeek:
        baselineThisWeek !== null && baselineLastWeek !== null
          ? baselineThisWeek - baselineLastWeek
          : null,
    };
  }

  /**
   * Best-effort: seed a create-only karma baseline for the current week when an
   * account is linked, using the karma already fetched during validation (no extra
   * Reddit call). A failure here must not fail the link — the account row is the
   * important artifact and the dashboard write-through will still seed a baseline
   * on first load — so we swallow and log.
   */
  private async captureLinkBaseline(
    accountId: string,
    karma: number,
  ): Promise<void> {
    try {
      const weekStart = startOfWeek(new Date());
      await this.prisma.karmaSnapshot.upsert({
        where: { accountId_weekStart: { accountId, weekStart } },
        create: { accountId, weekStart, karma },
        update: {},
      });
    } catch (err) {
      this.logger.warn(
        `Failed to capture link-time karma baseline for account ${accountId}: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Track a new Reddit account for a shiller by its public username.
   *
   * Normalizes the input (strips a `u/` or `/u/` prefix), confirms the account
   * exists via Reddit, and stores it under Reddit's canonical casing so the
   * `@@unique([userId, redditUsername])` constraint dedupes reliably.
   *
   * @param userId the owning shiller (from the verified access token).
   * @param redditUsername the username the shiller entered.
   * @throws NotFoundException if Reddit has no such account.
   * @throws ConflictException if this shiller already tracks that account.
   */
  async addAccount(
    userId: string,
    redditUsername: string,
  ): Promise<PublicRedditAccount> {
    // Accept "u/name", "/u/name", or "name" and trim surrounding whitespace.
    const normalized = redditUsername.trim().replace(/^\/?u\//i, '');

    // Resolve canonical casing + current health/karma from Reddit before persisting.
    const { name, status, totalKarma } =
      await this.reddit.validateUsername(normalized);

    try {
      const account = await this.prisma.redditAccount.create({
        data: { userId, redditUsername: name, status },
      });

      // Seed a karma-trend baseline at link time so this week's gain is measured
      // from the moment tracking begins — not from the first dashboard load, which
      // could be days later and would silently miss the interim gains. Same
      // create-only semantics as the dashboard write-through, so whichever runs
      // first freezes the immutable weekly baseline.
      await this.captureLinkBaseline(account.id, totalKarma);

      return toPublicRedditAccount(account);
    } catch (err) {
      // P2002 = unique constraint violation → the shiller already tracks it.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(`You are already tracking u/${name}.`);
      }
      throw err;
    }
  }

  /**
   * Fetch an account's Reddit comments for the comments view, enforcing access.
   *
   * Admins may read any account; a shiller may read only their own. A missing
   * account and a non-owned account both surface as NotFound, so a shiller can't
   * probe for other users' account ids. Also stamps `lastCheckedAt` since this is
   * a real poll of the account's activity.
   *
   * @param requester the authenticated principal (role decides scope).
   * @param accountId the RedditAccount to read.
   * @param range optional ISO-8601 `from`/`to` bounds passed through to Reddit.
   * @throws NotFoundException if the account doesn't exist or isn't the caller's.
   */
  async getAccountComments(
    requester: AuthenticatedUser,
    accountId: string,
    range: { from?: string; to?: string },
  ): Promise<AccountComments> {
    const account = await this.prisma.redditAccount.findUnique({
      where: { id: accountId },
    });
    // NotFound (not Forbidden) for a non-owning shiller — don't leak existence.
    if (
      !account ||
      (requester.role !== 'admin' && account.userId !== requester.userId)
    ) {
      throw new NotFoundException('Reddit account not found.');
    }

    const comments = await this.reddit.getComments(
      account.redditUsername,
      range,
    );

    // Record the poll time so the UI can show freshness later.
    const updated = await this.prisma.redditAccount.update({
      where: { id: account.id },
      data: { lastCheckedAt: new Date() },
    });

    return { account: toPublicRedditAccount(updated), comments };
  }

  /** List a shiller's tracked accounts (safe projection), oldest first. */
  async listForUser(userId: string): Promise<PublicRedditAccount[]> {
    const accounts = await this.prisma.redditAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map(toPublicRedditAccount);
  }

  /**
   * Stop tracking a Reddit account the caller owns. Ownership is enforced by
   * scoping the lookup to `userId` from the JWT, never trusting the client.
   * @throws NotFoundException if the account does not exist or is not the caller's.
   */
  async unlink(userId: string, accountId: string): Promise<void> {
    const account = await this.prisma.redditAccount.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) {
      throw new NotFoundException('Reddit account not found.');
    }
    await this.prisma.redditAccount.delete({ where: { id: account.id } });
  }
}
