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

/** A RedditAccount joined with just its owner's email (for admin dashboard rows). */
type AccountWithOwner = Prisma.RedditAccountGetPayload<{
  include: { user: { select: { email: true } } };
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
      include: { user: { select: { email: true } } },
    });

    // Sequential (not Promise.all) so we lean on the shared 60/min throttle
    // rather than firing every account's calls at once.
    const rows: DashboardAccountRow[] = [];
    for (const account of accounts) {
      rows.push(await this.buildDashboardRow(account, range, isAdmin));
    }

    return {
      range,
      kpis: {
        weeklyComments: rows.reduce((sum, r) => sum + r.weeklyComments, 0),
        totalAccounts: rows.length,
        activeAccounts: rows.filter((r) => r.status === 'active').length,
        totalKarma: rows.reduce((sum, r) => sum + (r.karma ?? 0), 0),
      },
      accounts: rows,
    };
  }

  /**
   * Fetch one account's weekly comment count + current karma/status, stamping
   * `lastCheckedAt`. Isolated so one bad account can't fail the whole dashboard.
   */
  private async buildDashboardRow(
    account: AccountWithOwner,
    range: DashboardRange,
    isAdmin: boolean,
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
      const stats = await this.reddit.getAccountStats(account.redditUsername);

      // Real poll of the account — persist freshness + latest known status.
      const updated = await this.prisma.redditAccount.update({
        where: { id: account.id },
        data: { lastCheckedAt: new Date(), status: stats.status },
      });

      return {
        ...base,
        status: stats.status,
        lastCheckedAt: updated.lastCheckedAt?.toISOString() ?? null,
        weeklyComments: comments.length,
        karma: stats.totalKarma,
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
        karma: null,
      };
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

    // Resolve canonical casing + current health from Reddit before persisting.
    const { name, status } = await this.reddit.validateUsername(normalized);

    try {
      const account = await this.prisma.redditAccount.create({
        data: { userId, redditUsername: name, status },
      });
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
