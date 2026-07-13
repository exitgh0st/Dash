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

  /** Bar-chart series: comment count per in-scope account. */
  readonly chartData = computed<BarDatum[]>(() =>
    this.accounts().map((a) => ({ label: a.username, value: a.weeklyComments })),
  );

  /**
   * Series for the karma-trend chart. `lastWeek` is left null (not coalesced to 0)
   * so the chart can tell "no last-week data yet" apart from "last week gained 0"
   * and draw a single this-week bar until a real comparison exists.
   */
  readonly karmaTrendData = computed<KarmaTrendDatum[]>(() =>
    this.accounts().map((a) => ({
      label: a.username,
      thisWeek: a.karmaThisWeek ?? 0,
      lastWeek: a.karmaLastWeek,
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

  // Delay before the silent re-fetch that picks up background-refreshed numbers.
  private static readonly REFRESH_REFETCH_MS = 5000;
  // Pending silent re-fetch timer, cleared on every new load so a range switch
  // can't leave a stale-week refetch queued.
  private refetchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Refetch the summary whenever the selected week changes (topbar pills).
    effect(() => {
      const range = this.rangeSvc.range();
      this.load(range);
    });
  }

  /**
   * Load the summary for a week; on success, kick off the shiller recent list.
   *
   * When the backend served stale numbers with a background refresh in flight
   * (`summary.refreshing`), schedule a single silent re-fetch to swap in the
   * fresher values once they land. A silent re-fetch neither shows the spinner nor
   * re-arms itself, so it can't spin or flicker.
   *
   * @param range the week to load.
   * @param silent when true, this is the follow-up refresh — no spinner, no
   *   re-scheduling, and errors leave the current data in place.
   */
  private load(range: 'this-week' | 'last-week', silent = false): void {
    // Cancel any queued re-fetch — a new load supersedes it.
    if (this.refetchTimer !== null) {
      clearTimeout(this.refetchTimer);
      this.refetchTimer = null;
    }
    if (!silent) {
      this.loading.set(true);
      this.error.set(false);
    }
    this.reddit.dashboard(range).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
        // Shillers also get a live "recent comments" feed across their accounts.
        // Only on a user-driven load — the silent refresh only updates the counts.
        if (!this.isAdmin() && !silent) {
          this.loadRecentComments(summary.accounts);
        }
        // Numbers were stale + refreshing server-side: grab the fresher ones once.
        if (summary.refreshing && !silent) {
          this.refetchTimer = setTimeout(
            () => this.load(range, true),
            DashboardComponent.REFRESH_REFETCH_MS,
          );
        }
      },
      error: () => {
        // A failed silent refresh keeps the data we already have on screen.
        if (silent) return;
        this.loading.set(false);
        this.error.set(true);
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
