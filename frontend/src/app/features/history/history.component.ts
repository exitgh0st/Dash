import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { catchError, forkJoin, map, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { RedditAccountsService } from '../../core/reddit/reddit-accounts.service';
import { MatProgressBarModule } from '@angular/material/progress-bar';

/** A comment tagged with the account it came from, for the merged history feed. */
interface HistoryComment {
  id: string;
  body: string;
  subreddit: string;
  score: number;
  createdUtc: string;
  permalink: string;
  account: string;
}

// Cap the merged feed so a wide admin scope doesn't render an unbounded list.
const MAX_HISTORY_ITEMS = 40;

/**
 * Activity History: a merged, newest-first feed of recent comments across the
 * caller's in-scope accounts (admin = all accounts, shiller = own). Post history
 * is a "coming soon" placeholder — Dash reads comments only for now. Account
 * discovery is role-scoped by the backend; one failing account is tolerated.
 */
@Component({
  selector: 'app-history',
  standalone: true,
  imports: [MatProgressBarModule],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
})
export class HistoryComponent implements OnInit {
  private readonly reddit = inject(RedditAccountsService);
  private readonly auth = inject(AuthService);

  private readonly isAdmin = computed(() => this.auth.role() === 'admin');

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly comments = signal<HistoryComment[]>([]);

  /** Active sort mode for the feed: newest-first (default) or most-upvoted. */
  readonly sort = signal<'newest' | 'top'>('newest');

  /**
   * The feed reordered for display per the active sort. Client-side only — never
   * mutates the source `comments()` array and issues no network request.
   * Reason: this sorts the already-loaded, recency-capped feed (the 40 most
   * recent merged comments), so "Most upvoted" ranks that recent window, not an
   * all-time top query — consistent with History being a recent-activity view.
   */
  readonly sortedComments = computed<HistoryComment[]>(() => {
    const list = this.comments();
    if (this.sort() === 'newest') return list;
    return [...list].sort(
      (a, b) => b.score - a.score || b.createdUtc.localeCompare(a.createdUtc),
    );
  });

  ngOnInit(): void {
    this.load();
  }

  /** Discover in-scope account ids (role-scoped), then fetch + merge comments. */
  private load(): void {
    this.loading.set(true);
    this.error.set(false);

    // Admin scope comes from the dashboard summary (all accounts); shillers use
    // the cheap own-accounts list. Both yield the ids we then fetch comments for.
    const accountIds$ = this.isAdmin()
      ? this.reddit.dashboard('this-week').pipe(
          map((s) => s.accounts.map((a) => a.id)),
        )
      : this.reddit.list().pipe(map((accounts) => accounts.map((a) => a.id)));

    accountIds$.subscribe({
      next: (ids) => this.fetchComments(ids),
      error: () => this.failLoad(),
    });
  }

  /** Fetch each account's latest comments and merge into one newest-first feed. */
  private fetchComments(ids: string[]): void {
    if (ids.length === 0) {
      this.comments.set([]);
      this.loading.set(false);
      return;
    }
    forkJoin(
      ids.map((id) =>
        this.reddit.comments(id).pipe(
          map((res) =>
            res.comments.map((c) => ({
              ...c,
              account: res.account.redditUsername,
            })),
          ),
          // One bad account shouldn't blank the whole feed.
          catchError(() => of([] as HistoryComment[])),
        ),
      ),
    ).subscribe({
      next: (lists) => {
        const merged = lists
          .flat()
          .sort((a, b) => b.createdUtc.localeCompare(a.createdUtc))
          .slice(0, MAX_HISTORY_ITEMS);
        this.comments.set(merged);
        this.loading.set(false);
      },
      error: () => this.failLoad(),
    });
  }

  /** Switch the display sort. Purely reorders the loaded feed — no re-fetch. */
  setSort(mode: 'newest' | 'top'): void {
    this.sort.set(mode);
  }

  private failLoad(): void {
    this.loading.set(false);
    this.error.set(true);
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
