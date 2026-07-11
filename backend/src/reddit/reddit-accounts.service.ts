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

  constructor(
    private readonly reddit: RedditService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Build the role-scoped dashboard summary for the current week (or last week).
   *
   * Admins see every tracked account (with the owner's email); a shiller sees
   * only their own. Per account we read the week's comment count and current
   * karma/status from Reddit through the shared, globally-throttled service, so
   * the browser never fans out N calls itself. KPIs are summed from the rows.
   *
   * @param requester the authenticated principal (role decides scope).
   * @param rangeKey which week to summarize; defaults to the current week.
   */
  async getDashboard(
    requester: AuthenticatedUser,
    rangeKey: DashboardRangeKey = 'this-week',
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
    const baselines = await this.loadKarmaBaselines(
      accounts.map((a) => a.id),
      thisWeekStart,
      lastWeekStart,
    );

    // Sequential (not Promise.all) so we lean on the shared 60/min throttle
    // rather than firing every account's calls at once.
    const rows: DashboardAccountRow[] = [];
    for (const account of accounts) {
      rows.push(
        await this.buildDashboardRow(account, range, isAdmin, {
          thisWeekStart,
          lastWeekStart,
          baselineThisWeek:
            baselines.get(this.baselineKey(account.id, thisWeekStart)) ?? null,
          baselineLastWeek:
            baselines.get(this.baselineKey(account.id, lastWeekStart)) ?? null,
        }),
      );
    }

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
   * Fetch one account's weekly comment count + current karma/status, stamping
   * `lastCheckedAt` and capturing/using its karma-trend baselines. Isolated so
   * one bad account can't fail the whole dashboard.
   *
   * @param baselines pre-fetched karma baselines for this/last week (from
   *   `loadKarmaBaselines`) plus the week-start dates used for the write-through
   *   snapshot.
   */
  private async buildDashboardRow(
    account: AccountWithOwner,
    range: DashboardRange,
    isAdmin: boolean,
    baselines: {
      thisWeekStart: Date;
      lastWeekStart: Date;
      baselineThisWeek: number | null;
      baselineLastWeek: number | null;
    },
  ): Promise<DashboardAccountRow> {
    const base = {
      id: account.id,
      username: account.redditUsername,
      ownerEmail: isAdmin ? account.user.email : undefined,
    };

    try {
      const comments = await this.reddit.getComments(account.redditUsername, {
        from: range.from,
        to: range.to,
      });
      // Second Reddit read for the post-quota metric — throttled globally with
      // the comment read via the shared 60/min gate, so it's just slower, not unsafe.
      const weeklyPosts = await this.reddit.getWeeklyPostCount(
        account.redditUsername,
        { from: range.from, to: range.to },
      );
      const stats = await this.reddit.getAccountStats(account.redditUsername);

      // Real poll of the account — persist freshness + latest known status.
      const updated = await this.prisma.redditAccount.update({
        where: { id: account.id },
        data: { lastCheckedAt: new Date(), status: stats.status },
      });

      // Write-through, create-only: the first karma seen this week becomes an
      // immutable baseline (≈ week-start karma). The empty `update` keeps it
      // frozen on later loads the same week.
      await this.prisma.karmaSnapshot.upsert({
        where: {
          accountId_weekStart: {
            accountId: account.id,
            weekStart: baselines.thisWeekStart,
          },
        },
        create: {
          accountId: account.id,
          weekStart: baselines.thisWeekStart,
          karma: stats.totalKarma,
        },
        update: {},
      });

      const { karmaThisWeek, karmaLastWeek } = this.computeKarmaTrend(
        stats.totalKarma,
        baselines.baselineThisWeek,
        baselines.baselineLastWeek,
      );

      return {
        ...base,
        status: stats.status,
        lastCheckedAt: updated.lastCheckedAt?.toISOString() ?? null,
        weeklyComments: comments.length,
        weeklyPosts,
        karma: stats.totalKarma,
        karmaThisWeek,
        karmaLastWeek,
      };
    } catch (err) {
      // Reason: a deleted/suspended account or a transient Reddit failure must
      // not take down the dashboard — surface this row as an error and continue.
      this.logger.warn(
        `Dashboard row failed for u/${account.redditUsername}: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
      return {
        ...base,
        status: RedditAccountStatus.error,
        lastCheckedAt: account.lastCheckedAt?.toISOString() ?? null,
        weeklyComments: 0,
        weeklyPosts: 0,
        karma: null,
        karmaThisWeek: null,
        karmaLastWeek: null,
      };
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
