import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardRangeService } from '../../core/dashboard/dashboard-range.service';
import { RedditAccountsService } from '../../core/reddit/reddit-accounts.service';
import {
  DashboardAccountRow,
  DashboardSummary,
  RedditAccountStatus,
} from '../../core/reddit/reddit.models';
import {
  BarDatum,
  CommentsBarChartComponent,
} from './comments-bar-chart.component';
import {
  KarmaTrendChartComponent,
  KarmaTrendDatum,
} from './karma-trend-chart.component';

/** A recent comment tagged with the account it came from (shiller overview). */
interface RecentComment {
  id: string;
  body: string;
  subreddit: string;
  score: number;
  createdUtc: string;
  permalink: string;
  account: string;
}

/**
 * A shiller's accounts rolled up into one summary (admin manager view). Bounded by
 * the number of shillers — not accounts — so charts + the table stay readable no
 * matter how many Reddit accounts each shiller operates.
 */
interface ShillerGroup {
  ownerId: string;
  ownerEmail: string;
  accountCount: number;
  activeCount: number;
  weeklyComments: number;
  weeklyPosts: number;
  karma: number;
  /** Summed karma gained this week (null-safe sum; null contributions count as 0). */
  karmaThisWeek: number;
  /** Summed last-week karma gain, or null until any account has a last-week figure. */
  karmaLastWeek: number | null;
  /** Σ owner comment quota over this shiller's in-scope accounts. */
  commentQuotaTarget: number;
  /** Σ owner post quota over this shiller's in-scope accounts. */
  postQuotaTarget: number;
  /** The shiller's individual accounts, kept for the drill-down. */
  accounts: DashboardAccountRow[];
}

// Avatar palette (prototype colors), assigned by row index.
const AVATAR_COLORS = [
  '#2DD4A7',
  '#4C8DF6',
  '#8B7BF7',
  '#F5A623',
  '#F76B6B',
  '#38BDF8',
];

/**
 * Dashboard overview. Admins see a manager view across every tracked account;
 * shillers see a scoped employee view of their own accounts plus their recent
 * comments. Data comes from `GET /api/reddit/dashboard` and refetches when the
 * topbar range pill changes. Metrics that need deferred backend (karma-Δ, posts,
 * quotas) are intentionally absent or shown as "coming soon" — nothing faked.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    MatProgressBarModule,
    CommentsBarChartComponent,
    KarmaTrendChartComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly reddit = inject(RedditAccountsService);
  private readonly auth = inject(AuthService);
  private readonly rangeSvc = inject(DashboardRangeService);

  /** Admins get the all-accounts manager view; shillers the scoped employee view. */
  readonly isAdmin = computed(() => this.auth.role() === 'admin');

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly summary = signal<DashboardSummary | null>(null);

  // A user-triggered force-refresh is in flight (spins the Refresh button without
  // blanking the page — current numbers stay on screen until the fresh ones land).
  readonly refreshing = signal(false);

  // Shiller "recent comments" list (fetched separately from the summary counts).
  readonly recentLoading = signal(false);
  readonly recentComments = signal<RecentComment[]>([]);

  readonly kpis = computed(() => this.summary()?.kpis ?? null);
  readonly accounts = computed(() => this.summary()?.accounts ?? []);
  readonly rangeLabel = computed(() => this.summary()?.range.label ?? '');

  /**
   * Comment-quota fill for the progress bar: weekly comments over the aggregate
   * target, clamped to [0,100]. The bar caps at 100% while the card label still
   * shows the true (possibly over-quota) count. 0 when there's no target.
   */
  readonly commentQuotaPct = computed(() => {
    const k = this.kpis();
    if (!k || k.commentQuotaTarget <= 0) return 0;
    return Math.min(100, (k.weeklyComments / k.commentQuotaTarget) * 100);
  });

  /** Post-quota fill for the progress bar; same clamping as {@link commentQuotaPct}. */
  readonly postQuotaPct = computed(() => {
    const k = this.kpis();
    if (!k || k.postQuotaTarget <= 0) return 0;
    return Math.min(100, (k.weeklyPosts / k.postQuotaTarget) * 100);
  });

  /**
   * Per-shiller rollup for the admin manager view: fold every account into its
   * owner's group so the charts + table scale with the (small) shiller count
   * instead of the (unbounded) account count. Sorted by weekly comments desc so
   * the busiest shillers surface first. Empty for shillers (no `ownerId` on rows).
   */
  readonly shillerGroups = computed<ShillerGroup[]>(() => {
    const groups = new Map<string, ShillerGroup>();
    for (const a of this.accounts()) {
      // Group by owner id; fall back to email so a missing id never drops a row.
      const key = a.ownerId ?? a.ownerEmail ?? a.id;
      let g = groups.get(key);
      if (!g) {
        g = {
          ownerId: a.ownerId ?? '',
          ownerEmail: a.ownerEmail ?? '',
          accountCount: 0,
          activeCount: 0,
          weeklyComments: 0,
          weeklyPosts: 0,
          karma: 0,
          karmaThisWeek: 0,
          karmaLastWeek: null,
          commentQuotaTarget: 0,
          postQuotaTarget: 0,
          accounts: [],
        };
        groups.set(key, g);
      }
      g.accountCount += 1;
      if (a.status === 'active') g.activeCount += 1;
      g.weeklyComments += a.weeklyComments;
      g.weeklyPosts += a.weeklyPosts;
      g.karma += a.karma ?? 0;
      g.karmaThisWeek += a.karmaThisWeek ?? 0;
      // Sum last-week only over accounts that have it; stays null if none do.
      if (a.karmaLastWeek !== null) {
        g.karmaLastWeek = (g.karmaLastWeek ?? 0) + a.karmaLastWeek;
      }
      g.commentQuotaTarget += a.weeklyCommentQuota ?? 0;
      g.postQuotaTarget += a.weeklyPostQuota ?? 0;
      g.accounts.push(a);
    }
    return [...groups.values()].sort(
      (a, b) => b.weeklyComments - a.weeklyComments,
    );
  });

  /** Bar-chart series: comments summed per shiller (bounded to the shiller count). */
  readonly chartData = computed<BarDatum[]>(() =>
    this.shillerGroups().map((g) => ({
      label: this.localPart(g.ownerEmail),
      value: g.weeklyComments,
    })),
  );

  /**
   * Series for the karma-trend chart, aggregated per shiller. `lastWeek` stays null
   * (not coalesced to 0) so the chart can tell "no last-week data yet" apart from
   * "last week gained 0" and draw a single this-week bar until a real comparison exists.
   */
  readonly karmaTrendData = computed<KarmaTrendDatum[]>(() =>
    this.shillerGroups().map((g) => ({
      label: this.localPart(g.ownerEmail),
      thisWeek: g.karmaThisWeek,
      lastWeek: g.karmaLastWeek,
    })),
  );

  /**
   * True once at least one account has a this-week baseline (i.e. karma data to
   * chart). Since a baseline is seeded at link time, this is effectively "has a
   * healthy account" — the trend shows from week 1; the last-week bar fills in
   * after a full week. The empty state only shows when nothing has a baseline yet.
   */
  readonly hasKarmaTrend = computed(() =>
    this.accounts().some((a) => a.karmaThisWeek !== null),
  );

  // Which shiller groups are expanded (by owner key) in the drill-down table.
  readonly expandedShillers = signal<Set<string>>(new Set());

  /** First-name-ish greeting from the email local part (no display names stored). */
  readonly greeting = computed(
    () => (this.auth.currentUser()?.email ?? '').split('@')[0],
  );

  // Delay between silent re-fetches that pick up background-refreshed numbers.
  private static readonly REFRESH_REFETCH_MS = 4000;
  // Cap on chained silent re-fetches per user load, so a server that stays
  // `refreshing` (e.g. a slow crawl) can't make us poll unbounded.
  private static readonly MAX_SILENT_REFETCHES = 4;
  // Pending silent re-fetch timer, cleared on every new load so a range switch
  // can't leave a stale-week refetch queued.
  private refetchTimer: ReturnType<typeof setTimeout> | null = null;
  // Remaining silent-refetch budget for the current user load (reset per load).
  private refetchBudget = 0;

  constructor() {
    // Refetch the summary whenever the selected week changes (topbar pills).
    effect(() => {
      const range = this.rangeSvc.range();
      this.load(range);
    });
  }

  /** Force a live Reddit re-poll (cache bypass) for the current week. */
  refreshNow(): void {
    if (this.refreshing()) return;
    this.load(this.rangeSvc.range(), { force: true });
  }

  /**
   * Load the summary for a week; on success, kick off the shiller recent list.
   *
   * When the backend served stale numbers with a background refresh in flight
   * (`summary.refreshing`), schedule a bounded chain of silent re-fetches to swap
   * in the fresher values once they land — capped by {@link MAX_SILENT_REFETCHES}
   * so it can never poll forever. Silent re-fetches don't show the spinner.
   *
   * @param range the week to load.
   * @param opts.silent follow-up refresh — no spinner, errors leave current data.
   * @param opts.force ask the backend to bypass its cache and re-poll Reddit
   *   synchronously; spins the Refresh button instead of blanking the page.
   */
  private load(
    range: 'this-week' | 'last-week',
    opts: { silent?: boolean; force?: boolean } = {},
  ): void {
    const { silent = false, force = false } = opts;
    // Cancel any queued re-fetch — a new load supersedes it.
    if (this.refetchTimer !== null) {
      clearTimeout(this.refetchTimer);
      this.refetchTimer = null;
    }
    if (!silent) {
      // A fresh user load restarts the silent-refetch budget.
      this.refetchBudget = DashboardComponent.MAX_SILENT_REFETCHES;
      if (force) {
        // Keep the current data visible; only spin the button.
        this.refreshing.set(true);
      } else {
        this.loading.set(true);
        this.error.set(false);
      }
    }
    this.reddit.dashboard(range, force).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
        this.refreshing.set(false);
        // Shillers also get a live "recent comments" feed across their accounts.
        // Only on a user-driven load — the silent refresh only updates the counts.
        if (!this.isAdmin() && !silent) {
          this.loadRecentComments(summary.accounts);
        }
        // Numbers were stale + refreshing server-side: grab the fresher ones,
        // re-arming while the server still reports `refreshing` (bounded).
        if (summary.refreshing && this.refetchBudget > 0) {
          this.refetchBudget -= 1;
          this.refetchTimer = setTimeout(
            () => this.load(range, { silent: true }),
            DashboardComponent.REFRESH_REFETCH_MS,
          );
        }
      },
      error: () => {
        // A failed silent refresh keeps the data we already have on screen.
        if (silent) return;
        this.refreshing.set(false);
        this.loading.set(false);
        // A failed force-refresh also keeps current data — only the initial load
        // shows the full error state.
        if (!force) {
          this.error.set(true);
        }
      },
    });
  }

  /**
   * Fetch the newest comments across the shiller's accounts and merge them into
   * a single newest-first feed. One account failing is tolerated (its slice is
   * dropped) so the feed still renders.
   */
  private loadRecentComments(accounts: DashboardAccountRow[]): void {
    const ids = accounts.map((a) => a.id);
    if (ids.length === 0) {
      this.recentComments.set([]);
      return;
    }
    this.recentLoading.set(true);
    forkJoin(
      ids.map((id) =>
        this.reddit.comments(id).pipe(
          map((res) =>
            res.comments.map((c) => ({
              ...c,
              account: res.account.redditUsername,
            })),
          ),
          catchError(() => of([] as RecentComment[])),
        ),
      ),
    ).subscribe((lists) => {
      const merged = lists
        .flat()
        .sort((a, b) => b.createdUtc.localeCompare(a.createdUtc))
        .slice(0, 6);
      this.recentComments.set(merged);
      this.recentLoading.set(false);
    });
  }

  // ---- Presentation helpers ----

  /** Two-letter avatar initials from a username. */
  initials(name: string): string {
    return name.slice(0, 2).toUpperCase();
  }

  /** Deterministic avatar color for a row index. */
  avatarColor(index: number): string {
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
  }

  /** Email → local part (before `@`), for compact chart/group labels. */
  localPart(email: string): string {
    return (email ?? '').split('@')[0];
  }

  /** Stable key for a shiller group's expand state (owner id, or email fallback). */
  private groupKey(g: ShillerGroup): string {
    return g.ownerId || g.ownerEmail;
  }

  /** Toggle a shiller group's drill-down open/closed. */
  toggleShiller(g: ShillerGroup): void {
    const next = new Set(this.expandedShillers());
    const key = this.groupKey(g);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expandedShillers.set(next);
  }

  /** Whether a shiller group's accounts are currently expanded. */
  isExpanded(g: ShillerGroup): boolean {
    return this.expandedShillers().has(this.groupKey(g));
  }

  /** Comment-quota fill for a shiller group, clamped to [0,100]; 0 with no target. */
  groupCommentPct(g: ShillerGroup): number {
    if (g.commentQuotaTarget <= 0) return 0;
    return Math.min(100, (g.weeklyComments / g.commentQuotaTarget) * 100);
  }

  /** Post-quota fill for a shiller group; same clamping as {@link groupCommentPct}. */
  groupPostPct(g: ShillerGroup): number {
    if (g.postQuotaTarget <= 0) return 0;
    return Math.min(100, (g.weeklyPosts / g.postQuotaTarget) * 100);
  }

  /** Format a nullable number with thousands separators; null → em dash. */
  fmt(value: number | null): string {
    return value === null ? '—' : value.toLocaleString();
  }

  /** Pill style for a status: active reads as "met" (green), anything else "miss". */
  statusPill(status: RedditAccountStatus): 'met' | 'miss' {
    return status === 'active' ? 'met' : 'miss';
  }

  /** Whether an account has a karma Δ to show — true once a this-week baseline exists. */
  hasTrend(row: DashboardAccountRow): boolean {
    return row.karmaThisWeek !== null;
  }

  /** Whether a shiller group has any karma Δ to show (any account with a baseline). */
  groupHasTrend(g: ShillerGroup): boolean {
    return g.accounts.some((a) => a.karmaThisWeek !== null);
  }

  /** Group-level trend direction: this-week gain meets/beats last week (or no last week). */
  groupTrendUp(g: ShillerGroup): boolean {
    if (g.karmaLastWeek === null) return true;
    return g.karmaThisWeek >= g.karmaLastWeek;
  }

  /**
   * True when this week's karma gain meets or beats last week's (drives green/orange).
   * With no last-week figure yet, reads as up (neutral/green) — we don't imply a
   * down-trend against data we don't have.
   */
  trendUp(row: DashboardAccountRow): boolean {
    if (row.karmaLastWeek === null) return true;
    return (row.karmaThisWeek ?? 0) >= row.karmaLastWeek;
  }

  /** Signed karma-gain label for the Δ column, e.g. "+142" / "-30" / "0". */
  fmtSigned(value: number | null): string {
    if (value === null) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toLocaleString()}`;
  }

  /** Relative-ish "time ago" label for a comment timestamp. */
  timeAgo(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }
}
