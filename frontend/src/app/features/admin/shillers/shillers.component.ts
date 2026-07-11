import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthUser, UserRole } from '../../../core/auth/auth.models';
import { UsersService } from '../../../core/users/users.service';
import { CreateShillerDialogComponent } from './create-shiller-dialog.component';

// Avatar palette (prototype colors), assigned by row index.
const AVATAR_COLORS = [
  '#8B7BF7',
  '#4C8DF6',
  '#2DD4A7',
  '#F5A623',
  '#F76B6B',
  '#38BDF8',
];

/**
 * Team & Access (admin-only): lists all Dash users as the prototype's Team table
 * with a dialog to invite (create) shillers. Route is gated by `roleGuard('admin')`.
 */
@Component({
  selector: 'app-shillers',
  standalone: true,
  imports: [DatePipe, RouterLink, MatProgressBarModule],
  templateUrl: './shillers.component.html',
  styleUrl: './shillers.component.scss',
})
export class ShillersComponent implements OnInit {
  private readonly users = inject(UsersService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly error = signal(false);

  /** All users returned by the API; empty triggers the empty state. */
  readonly users$ = signal<AuthUser[]>([]);

  ngOnInit(): void {
    this.loadUsers();
  }

  /** Fetch the user list, surfacing failures via a snackbar. */
  private loadUsers(): void {
    this.loading.set(true);
    this.error.set(false);
    this.users.list().subscribe({
      next: (users) => {
        this.users$.set(users);
        this.loading.set(false);
      },
      error: (_err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(true);
        this.snackBar.open('Could not load the team.', 'Dismiss', {
          duration: 4000,
        });
      },
    });
  }

  /** Open the invite dialog; on a successful create, confirm and refresh. */
  openCreateDialog(): void {
    const ref = this.dialog.open<
      CreateShillerDialogComponent,
      undefined,
      AuthUser
    >(CreateShillerDialogComponent);

    ref.afterClosed().subscribe((created) => {
      if (!created) {
        return;
      }
      this.snackBar.open(`Invited ${created.email}.`, 'Dismiss', {
        duration: 4000,
      });
      this.loadUsers();
    });
  }

  // ---- Presentation helpers ----

  /** Two-letter avatar initials from an email local part. */
  initials(email: string): string {
    return email.slice(0, 2).toUpperCase();
  }

  avatarColor(index: number): string {
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
  }

  /** Friendly role label matching the app's admin/shiller mapping. */
  roleLabel(role: UserRole): string {
    return role === 'admin' ? 'Admin' : 'Reddit Manager';
  }
}
