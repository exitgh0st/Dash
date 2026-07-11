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
  imports: [RouterLink, MatProgressBarModule, CommentsBarChartComponent],
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

  /** Bar-chart series: comment count per in-scope account. */
  readonly chartData = computed<BarDatum[]>(() =>
    this.accounts().map((a) => ({ label: a.username, value: a.weeklyComments })),
  );

  /** First-name-ish greeting from the email local part (no display names stored). */
  readonly greeting = computed(
    () => (this.auth.currentUser()?.email ?? '').split('@')[0],
  );

  constructor() {
    // Refetch the summary whenever the selected week changes (topbar pills).
    effect(() => {
      const range = this.rangeSvc.range();
      this.load(range);
    });
  }

  /** Load the summary for a week; on success, kick off the shiller recent list. */
  private load(range: 'this-week' | 'last-week'): void {
    this.loading.set(true);
    this.error.set(false);
    this.reddit.dashboard(range).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
        // Shillers also get a live "recent comments" feed across their accounts.
        if (!this.isAdmin()) {
          this.loadRecentComments(summary.accounts);
        }
      },
      error: () => {
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
