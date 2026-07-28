import { computed, signal } from '@angular/core';
import { Observable, catchError, concatMap, defer, from, of, tap } from 'rxjs';
import { RedditAccountsService } from './reddit-accounts.service';
import { TaggedComment } from './reddit.models';

/**
 * Per-account paging state. `cursor` is tri-state:
 * - `undefined` — never fetched, so a first page is still owed
 * - `string`    — a Reddit fullname to resume from
 * - `null`      — exhausted, nothing older exists (or the account failed)
 */
interface AccountBuffer {
  id: string;
  buffer: TaggedComment[];
  cursor: string | null | undefined;
}

/**
 * A paged, newest-first comment feed merged across several Reddit accounts.
 *
 * **Why this isn't just "ask each account for page 2".** Each account has its own
 * independent listing, so a globally-correct newest-first page can only be emitted
 * once *every* non-exhausted account has at least one buffered comment — only then
 * is the newest buffered head guaranteed to be the newest comment overall. So this
 * is a k-way merge: per-account buffers are topped up as they drain, and a page is
 * built by repeatedly taking the newest head across all buffers.
 *
 * That is also what makes it cheap. A buffer holds a Reddit page (~100 comments)
 * while a display page consumes {@link pageSize} (40), so after the initial fill of
 * N requests, most Next clicks are served entirely from memory.
 *
 * Prev is always free: emitted pages are retained, so going back is an index move
 * with no refetch and no cursor rewinding (Reddit cursors only walk one way).
 *
 * Instantiate one per view — it holds view-scoped state and is not injectable.
 */
export class MergedCommentFeed {
  private accounts: AccountBuffer[] = [];
  /** Every page emitted so far, so Prev (and re-Next) never refetch. */
  private pages: TaggedComment[][] = [];
  private readonly pageIndex = signal(0);
  /** Bumped on every state mutation so the computed signals below recompute. */
  private readonly version = signal(0);

  /** True until the first account's comments land, so the view can show a spinner. */
  readonly loading = signal(true);
  /** True when the whole feed failed (account discovery or a fatal error). */
  readonly error = signal(false);
  /** Accounts fetched so far in the current fill, for a "Loading X of N" line. */
  readonly fillProgress = signal<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  /** Whether accounts are still being fetched (drives the progress line). */
  readonly filling = computed(() => {
    const { done, total } = this.fillProgress();
    return total > 0 && done < total;
  });

  /**
   * The current page. While the initial fill is still running this is a
   * *non-consuming preview* — the newest {@link pageSize} across whatever has
   * landed so far — so the view paints progressively instead of blocking on the
   * slowest account. It is replaced by the real page once the fill completes.
   */
  readonly page = signal<TaggedComment[]>([]);

  /** 1-based page number for the pager label. */
  readonly pageNumber = computed(() => this.pageIndex() + 1);

  readonly hasPrev = computed(() => this.pageIndex() > 0);

  /**
   * Whether a next page exists: either one already emitted (we've paged back), or
   * unconsumed material — a non-empty buffer or an account with a live cursor.
   */
  readonly hasNext = computed(() => {
    this.version();
    if (this.pageIndex() + 1 < this.pages.length) return true;
    return this.accounts.some((a) => a.buffer.length > 0 || a.cursor !== null);
  });

  constructor(
    private readonly reddit: RedditAccountsService,
    private readonly pageSize = 40,
  ) {}

  /**
   * Start (or restart) the feed over a set of accounts and emit page 1.
   * Safe to call again — all paging state is reset first.
   *
   * @param accountIds accounts to merge, in the order they should be fetched.
   */
  open(accountIds: string[]): void {
    this.accounts = accountIds.map((id) => ({
      id,
      buffer: [],
      cursor: undefined,
    }));
    this.pages = [];
    this.pageIndex.set(0);
    this.error.set(false);
    this.page.set([]);
    this.fillProgress.set({ done: 0, total: accountIds.length });
    this.version.update((v) => v + 1);

    if (accountIds.length === 0) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    // Fill every buffer first, previewing as accounts land, then cut page 1.
    // `complete`, not `next`: the fill emits once per account.
    this.fillGaps(true).subscribe({
      complete: () => this.emitFreshPage(),
      error: () => this.fail(),
    });
  }

  /** Advance one page — free if we've been here before, otherwise drains buffers. */
  next(): void {
    if (this.pageIndex() + 1 < this.pages.length) {
      this.pageIndex.update((i) => i + 1);
      this.page.set(this.pages[this.pageIndex()]);
      return;
    }
    this.loading.set(true);
    this.emitFreshPage();
  }

  /** Step back to the previous retained page. Never issues a request. */
  prev(): void {
    if (!this.hasPrev()) return;
    this.pageIndex.update((i) => i - 1);
    this.page.set(this.pages[this.pageIndex()]);
  }

  /**
   * Build the next page and retain it.
   *
   * Alternates topping up drained buffers with draining the merged heads, because
   * a page of 40 can outlast a buffer whose account is nearly exhausted — one pass
   * isn't enough to guarantee correctness.
   */
  private emitFreshPage(): void {
    const page: TaggedComment[] = [];

    const step = (): void => {
      const taken = this.drainReadyHeads(page);
      // Stop when the page is full, or when nothing was taken and no buffer can
      // be refilled — i.e. every account is drained and exhausted.
      if (page.length >= this.pageSize || (taken === 0 && !this.needsFill())) {
        this.commitPage(page);
        return;
      }
      this.fillGaps(false).subscribe({
        complete: step,
        error: () => this.fail(),
      });
    };

    step();
  }

  /** Retain a freshly built page and show it. An empty last page is not retained. */
  private commitPage(page: TaggedComment[]): void {
    if (page.length > 0) {
      this.pages.push(page);
      this.pageIndex.set(this.pages.length - 1);
      this.page.set(page);
    } else if (this.pages.length > 0) {
      // Ran out mid-click: stay on the last real page rather than blanking it.
      this.page.set(this.pages[this.pageIndex()]);
    } else {
      this.page.set([]);
    }
    this.loading.set(false);
    this.version.update((v) => v + 1);
  }

  /**
   * Move the newest available comment into `page` repeatedly, stopping as soon as
   * the page is full or any account could still contribute (empty buffer + live
   * cursor) — taking a head while such an account exists could emit out of order.
   *
   * @returns how many comments were moved.
   */
  private drainReadyHeads(page: TaggedComment[]): number {
    let taken = 0;
    while (page.length < this.pageSize && !this.needsFill()) {
      let newest: AccountBuffer | null = null;
      for (const a of this.accounts) {
        if (a.buffer.length === 0) continue;
        if (
          newest === null ||
          a.buffer[0].createdUtc > newest.buffer[0].createdUtc
        ) {
          newest = a;
        }
      }
      if (newest === null) break; // every buffer empty and every cursor null
      page.push(newest.buffer.shift() as TaggedComment);
      taken += 1;
    }
    return taken;
  }

  /** Whether any account is drained but still has history left to fetch. */
  private needsFill(): boolean {
    return this.accounts.some((a) => a.buffer.length === 0 && a.cursor !== null);
  }

  /**
   * Top up every drained-but-not-exhausted buffer, one request at a time.
   *
   * Sequential by design: the backend funnels all Reddit reads through a global
   * 60 req/min token bucket, so a parallel fan-out would buy nothing and only
   * lengthen the first paint. A failing account is retired (empty buffer, null
   * cursor) instead of aborting the feed.
   *
   * @param preview when true, refresh the on-screen preview after each account so
   *   the initial fill renders progressively.
   */
  private fillGaps(preview: boolean): Observable<unknown> {
    // `defer` so the pending set is computed at subscribe time, not call time —
    // `emitFreshPage` re-subscribes after draining has changed which are empty.
    return defer(() => {
      const pending = this.accounts.filter(
        (a) => a.buffer.length === 0 && a.cursor !== null,
      );
      if (pending.length === 0) return of(null);

      if (preview) {
        this.fillProgress.set({ done: 0, total: pending.length });
      }

      return from(pending).pipe(
        concatMap((account) =>
          this.reddit
            .comments(account.id, { after: account.cursor ?? undefined })
            .pipe(
              tap((res) => {
                account.buffer = res.comments.map<TaggedComment>((c) => ({
                  ...c,
                  account: res.account.redditUsername,
                }));
                // An empty page means nothing older exists, whatever Reddit says.
                account.cursor = account.buffer.length === 0 ? null : res.after;
              }),
              catchError(() => {
                // Reason: retire the account rather than propagate. A suspended or
                // deleted account must not blank the feed or stall paging.
                account.buffer = [];
                account.cursor = null;
                return of(null);
              }),
            ),
        ),
        tap(() => {
          if (!preview) return;
          this.fillProgress.update((p) => ({ ...p, done: p.done + 1 }));
          this.previewNewest();
        }),
      );
    });
  }

  /**
   * Show the newest {@link pageSize} across all buffers *without consuming them*,
   * so the user sees comments as soon as the first account lands. Deliberately
   * approximate — a later account may still hold something newer, which is why
   * the view keeps Next disabled until the fill completes.
   */
  private previewNewest(): void {
    const merged = this.accounts
      .flatMap((a) => a.buffer)
      .sort((x, y) => y.createdUtc.localeCompare(x.createdUtc))
      .slice(0, this.pageSize);
    this.page.set(merged);
    this.loading.set(false);
  }

  private fail(): void {
    this.loading.set(false);
    this.error.set(true);
  }
}
