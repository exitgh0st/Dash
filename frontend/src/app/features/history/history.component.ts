import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { MergedCommentFeed } from '../../core/reddit/merged-comment-feed';
import { RedditAccountsService } from '../../core/reddit/reddit-accounts.service';
import { TaggedComment } from '../../core/reddit/reddit.models';
import { MatProgressBarModule } from '@angular/material/progress-bar';

// Comments shown per page of the merged feed.
const PAGE_SIZE = 40;

/**
 * Activity History: a merged, newest-first, **paged** feed of comments across the
 * caller's in-scope accounts (admin = all accounts, shiller = own). Post history
 * is a "coming soon" placeholder — Dash reads comments only for now. Account
 * discovery is role-scoped by the backend; one failing account is tolerated.
 *
 * The merge and cursor bookkeeping live in {@link MergedCommentFeed}; this
 * component only wires account discovery to it and renders the pager.
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

  /** Paged multi-account feed; view-scoped, so it's constructed here. */
  readonly feed = new MergedCommentFeed(this.reddit, PAGE_SIZE);

  // Account discovery runs before the feed opens, so its state is tracked apart
  // from the feed's and folded into the two flags the template reads.
  private readonly discovering = signal(true);
  private readonly discoveryFailed = signal(false);

  // True only until the first account's comments land — after that the feed is
  // rendered and the remaining accounts fill in behind the progress line.
  readonly loading = computed(() => this.discovering() || this.feed.loading());
  readonly error = computed(
    () => this.discoveryFailed() || this.feed.error(),
  );
  readonly comments = this.feed.page;

  /** Progress of the sequential per-account fill, shown as "Loading X of N…". */
  readonly walkProgress = this.feed.fillProgress;

  /** Whether accounts are still being fetched (drives the progress line). */
  readonly walking = this.feed.filling;

  /** Active sort mode for the feed: newest-first (default) or most-upvoted. */
  readonly sort = signal<'newest' | 'top'>('newest');

  /**
   * The current page reordered for display per the active sort. Client-side only —
   * never mutates the feed's page and issues no network request.
   * Reason: this sorts the *current page*, so "Most upvoted" ranks the 40 comments
   * on screen, not an all-time top query — the live Reddit API has no such query,
   * and ranking across pages would mean fetching an account's whole history.
   */
  readonly sortedComments = computed<TaggedComment[]>(() => {
    const list = this.comments();
    if (this.sort() === 'newest') return list;
    return [...list].sort(
      (a, b) => b.score - a.score || b.createdUtc.localeCompare(a.createdUtc),
    );
  });

  ngOnInit(): void {
    this.load();
  }

  /** Discover in-scope account ids (role-scoped), then open the paged feed. */
  private load(): void {
    this.discovering.set(true);
    this.discoveryFailed.set(false);

    // Admin scope comes from the dashboard summary (all accounts); shillers use
    // the cheap own-accounts list. Both yield the ids the feed then pages over.
    const accountIds$ = this.isAdmin()
      ? this.reddit.dashboard('this-week').pipe(
          map((s) => s.accounts.map((a) => a.id)),
        )
      : this.reddit.list().pipe(map((accounts) => accounts.map((a) => a.id)));

    accountIds$.subscribe({
      next: (ids) => {
        this.discovering.set(false);
        this.feed.open(ids);
      },
      error: () => {
        this.discovering.set(false);
        this.discoveryFailed.set(true);
      },
    });
  }

  /** Switch the display sort. Purely reorders the current page — no re-fetch. */
  setSort(mode: 'newest' | 'top'): void {
    this.sort.set(mode);
  }

  /**
   * Advance a page. Guarded on the fill: until every account has a buffered
   * comment the on-screen list is a preview, so paging from it could skip
   * comments that a not-yet-fetched account still holds.
   */
  nextPage(): void {
    if (!this.feed.hasNext() || this.walking()) return;
    this.feed.next();
  }

  /** Step back to the previous page — served from memory, no requests. */
  prevPage(): void {
    this.feed.prev();
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
