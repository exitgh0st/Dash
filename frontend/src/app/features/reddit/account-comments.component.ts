import {
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RedditComment } from '../../core/reddit/reddit.models';
import { RedditAccountsService } from '../../core/reddit/reddit-accounts.service';

/**
 * Shared comments view (`/reddit-accounts/:accountId/comments`). Reached by an
 * admin drilling into a shiller's account and by a shiller viewing their own.
 * Lists the account's comments newest-first with a live count and a date-range
 * filter. Access is authorized server-side (admin-any / shiller-own → else 404).
 */
@Component({
  selector: 'app-account-comments',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
  ],
  templateUrl: './account-comments.component.html',
  styleUrl: './account-comments.component.scss',
})
export class AccountCommentsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly reddit = inject(RedditAccountsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly location = inject(Location);

  private accountId = '';

  /** The account's username, shown in the header once loaded. */
  readonly username = signal<string>('');

  /** True while comments are loading; drives the spinner. */
  readonly loading = signal(true);

  /** Fetched comments (newest-first); empty triggers the empty state. */
  readonly comments = signal<RedditComment[]>([]);

  /** Live count of the comments currently shown. */
  readonly count = computed(() => this.comments().length);

  /**
   * This week's total comment count, shown in the header ("X comments this week").
   * Captured from the initial this-week load and deliberately NOT changed when the
   * user filters the list to another range — the header always reflects the week.
   * Null until the first load lands (the template falls back to the live count).
   */
  readonly weeklyCount = signal<number | null>(null);

  /** Active sort mode for the list: newest-first (default) or most-upvoted. */
  readonly sort = signal<'newest' | 'top'>('newest');

  /**
   * The comments reordered for display per the active sort. Client-side only —
   * never mutates the source `comments()` array and issues no network request.
   * `newest` returns the source as-is (the backend already yields newest-first);
   * `top` sorts a copy by score desc, breaking ties by most-recent.
   */
  readonly sortedComments = computed<RedditComment[]>(() => {
    const list = this.comments();
    if (this.sort() === 'newest') return list;
    return [...list].sort(
      (a, b) => b.score - a.score || b.createdUtc.localeCompare(a.createdUtc),
    );
  });

  /**
   * Date-range filter, defaulted to *this week* (Monday → today) so the page opens
   * on the current week's comments rather than the account's entire history.
   */
  readonly range = new FormGroup({
    start: new FormControl<Date | null>(startOfWeek(new Date())),
    end: new FormControl<Date | null>(new Date()),
  });

  ngOnInit(): void {
    this.accountId = this.route.snapshot.paramMap.get('accountId') ?? '';
    // The initial range is this week, so capture the weekly total from this load.
    this.load({ updateWeekly: true });
  }

  /**
   * Fetch comments for the current account within the selected date range.
   *
   * @param opts.updateWeekly when true, also set {@link weeklyCount} from this
   *   response — only passed when the active range is this week (initial load /
   *   clear), so the weekly total stays put while the user filters to other ranges.
   */
  private load(opts: { updateWeekly?: boolean } = {}): void {
    this.loading.set(true);

    // Expand the picked calendar days to full-day ISO bounds: start → 00:00,
    // end → 23:59:59.999, so both endpoints are inclusive of the whole day.
    const { start, end } = this.range.value;
    const from = start ? startOfDay(start).toISOString() : undefined;
    const to = end ? endOfDay(end).toISOString() : undefined;

    this.reddit.comments(this.accountId, from, to).subscribe({
      next: (res) => {
        this.username.set(res.account.redditUsername);
        this.comments.set(res.comments);
        // Only refresh the weekly total on a this-week load, so filtering the list
        // to another range doesn't overwrite the header's weekly count.
        if (opts.updateWeekly) {
          this.weeklyCount.set(res.comments.length);
        }
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        // 404 = account missing or not the caller's; anything else is generic.
        const message =
          err.status === 404
            ? 'Account not found.'
            : 'Could not load comments.';
        this.snackBar.open(message, 'Dismiss', { duration: 4000 });
      },
    });
  }

  /** Switch the display sort. Purely reorders the loaded list — no re-fetch. */
  setSort(mode: 'newest' | 'top'): void {
    this.sort.set(mode);
  }

  /** Re-query with the currently selected date range. */
  applyFilter(): void {
    this.load();
  }

  /** Reset the date range back to this week (the default) and reload both views. */
  clearFilter(): void {
    this.range.setValue({ start: startOfWeek(new Date()), end: new Date() });
    this.load({ updateWeekly: true });
  }

  /** Navigate back to wherever the user came from (shiller detail or accounts). */
  goBack(): void {
    this.location.back();
  }
}

/**
 * Monday 00:00:00.000 (local) of the week containing `date`. Mirrors the backend's
 * week boundary (reddit-accounts.service.ts) so "this week" means the same span here.
 */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0=Sun..6=Sat. `(day + 6) % 7` = days elapsed since Monday.
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

/** Start of the given calendar day (local time). */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** End of the given calendar day (local time), inclusive to the millisecond. */
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
