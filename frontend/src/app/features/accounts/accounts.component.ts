import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '../../core/auth/auth.service';
import { RedditAccountsService } from '../../core/reddit/reddit-accounts.service';
import {
  DashboardAccountRow,
  RedditAccount,
  RedditAccountStatus,
} from '../../core/reddit/reddit.models';
import { AddAccountDialogComponent } from '../reddit/add-account-dialog.component';
import {
  ConfirmUnlinkDialogComponent,
  ConfirmUnlinkData,
} from '../reddit/confirm-unlink-dialog.component';

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
 * Role-aware Accounts page. Admins see a read-only table of every tracked
 * account across all shillers (with owner + weekly metrics, from the dashboard
 * summary). Shillers see their own accounts with management — add by username
 * and remove — reusing the existing dialogs. The route only needs `authGuard`;
 * the view branches on role and the backend scopes the data.
 */
@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [DatePipe, RouterLink, MatProgressBarModule],
  templateUrl: './accounts.component.html',
  styleUrl: './accounts.component.scss',
})
export class AccountsComponent implements OnInit {
  private readonly reddit = inject(RedditAccountsService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly isAdmin = computed(() => this.auth.role() === 'admin');

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly adding = signal(false);

  /** Admin view: every account across shillers, with weekly metrics + owner. */
  readonly adminRows = signal<DashboardAccountRow[]>([]);
  /** Shiller view: the caller's own tracked accounts (for management). */
  readonly myAccounts = signal<RedditAccount[]>([]);

  ngOnInit(): void {
    this.load();
  }

  /** Load the correct dataset for the caller's role. */
  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    if (this.isAdmin()) {
      // All accounts + weekly metrics come from the dashboard summary.
      this.reddit.dashboard('this-week').subscribe({
        next: (summary) => {
          this.adminRows.set(summary.accounts);
          this.loading.set(false);
        },
        error: () => this.failLoad(),
      });
    } else {
      // Shiller management uses the cheap list (metrics live on the dashboard).
      this.reddit.list().subscribe({
        next: (accounts) => {
          this.myAccounts.set(accounts);
          this.loading.set(false);
        },
        error: () => this.failLoad(),
      });
    }
  }

  private failLoad(): void {
    this.loading.set(false);
    this.error.set(true);
  }

  /** Open the add-account dialog and, on confirm, track the entered username. */
  openAddDialog(): void {
    const ref = this.dialog.open<AddAccountDialogComponent, undefined, string>(
      AddAccountDialogComponent,
    );
    ref.afterClosed().subscribe((username) => {
      if (!username) {
        return;
      }
      this.addAccount(username);
    });
  }

  /** POST the username, then refresh; maps known errors to clear copy. */
  private addAccount(username: string): void {
    this.adding.set(true);
    this.reddit.addAccount(username).subscribe({
      next: (account) => {
        this.adding.set(false);
        this.snackBar.open(
          `Now tracking u/${account.redditUsername}.`,
          'Dismiss',
          { duration: 4000 },
        );
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.adding.set(false);
        // 404 = no such Reddit user, 409 = already tracking.
        const message =
          err.status === 404
            ? `No Reddit user u/${username} found.`
            : err.status === 409
              ? `You are already tracking u/${username}.`
              : 'Could not add the Reddit account.';
        this.snackBar.open(message, 'Dismiss', { duration: 4000 });
      },
    });
  }

  /** Confirm and remove an account, then refresh the list on success. */
  confirmUnlink(account: RedditAccount): void {
    const ref = this.dialog.open<
      ConfirmUnlinkDialogComponent,
      ConfirmUnlinkData,
      boolean
    >(ConfirmUnlinkDialogComponent, {
      data: { redditUsername: account.redditUsername },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.reddit.unlink(account.id).subscribe({
        next: () => {
          this.snackBar.open(
            `Stopped tracking u/${account.redditUsername}.`,
            'Dismiss',
            { duration: 4000 },
          );
          this.load();
        },
        error: () => {
          this.snackBar.open('Could not remove the account.', 'Dismiss', {
            duration: 4000,
          });
        },
      });
    });
  }

  // ---- Presentation helpers ----

  initials(name: string): string {
    return name.slice(0, 2).toUpperCase();
  }

  avatarColor(index: number): string {
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
  }

  fmt(value: number | null): string {
    return value === null ? '—' : value.toLocaleString();
  }

  statusPill(status: RedditAccountStatus): 'met' | 'miss' {
    return status === 'active' ? 'met' : 'miss';
  }
}
