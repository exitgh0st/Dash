import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RedditAccount } from '../../../core/reddit/reddit.models';
import { RedditAccountsService } from '../../../core/reddit/reddit-accounts.service';
import { UsersService } from '../../../core/users/users.service';

/**
 * Admin-only drill-down page (`/shillers/:userId`) listing one shiller's tracked
 * Reddit accounts. Each account links to the shared comments view. The route is
 * gated by `roleGuard('admin')`; this component assumes an admin session.
 */
@Component({
  selector: 'app-shiller-detail',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './shiller-detail.component.html',
  styleUrl: './shiller-detail.component.scss',
})
export class ShillerDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly reddit = inject(RedditAccountsService);
  private readonly users = inject(UsersService);
  private readonly snackBar = inject(MatSnackBar);

  /** The shiller's email, shown in the header; resolved from the users list. */
  readonly email = signal<string>('');

  /** True while the page is loading; drives the spinner. */
  readonly loading = signal(true);

  /** The shiller's tracked accounts; empty triggers the empty state. */
  readonly accounts = signal<RedditAccount[]>([]);

  ngOnInit(): void {
    const userId = this.route.snapshot.paramMap.get('userId') ?? '';
    this.load(userId);
  }

  /** Load the shiller (for the header email) and their accounts together. */
  private load(userId: string): void {
    this.loading.set(true);
    // Resolve the email via the by-id endpoint instead of scanning the full list.
    forkJoin({
      user: this.users.get(userId),
      accounts: this.reddit.listForUser(userId),
    }).subscribe({
      next: ({ user, accounts }) => {
        this.email.set(user.email);
        this.accounts.set(accounts);
        this.loading.set(false);
      },
      error: (_err: HttpErrorResponse) => {
        this.loading.set(false);
        this.snackBar.open('Could not load this shiller.', 'Dismiss', {
          duration: 4000,
        });
      },
    });
  }
}
