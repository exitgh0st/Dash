import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthUser } from '../../../core/auth/auth.models';
import { UsersService } from '../../../core/users/users.service';

/** Data passed into the edit dialog: the shiller being edited (with current quotas). */
export interface EditShillerData {
  id: string;
  email: string;
  weeklyCommentQuota: number;
  weeklyPostQuota: number;
}

/**
 * Dialog for an admin to edit a shiller: change the email, set a new password,
 * and/or adjust the weekly comment/post quotas. The password field is optional —
 * left blank, it is omitted from the PATCH so the existing password is unchanged.
 * Quotas are per-account weekly targets that feed the dashboard's quota progress.
 * On success it closes returning the updated user so the list can refresh; a
 * duplicate email keeps the dialog open with an inline snackbar.
 */
@Component({
  selector: 'app-edit-shiller-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './edit-shiller-dialog.component.html',
  styleUrl: './edit-shiller-dialog.component.scss',
})
export class EditShillerDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly users = inject(UsersService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef =
    inject<MatDialogRef<EditShillerDialogComponent, AuthUser>>(MatDialogRef);

  /** The shiller being edited; supplied by the opener via MatDialog data. */
  readonly data = inject<EditShillerData>(MAT_DIALOG_DATA);

  /** True while the update request is in flight; drives the progress bar. */
  readonly loading = signal(false);

  /** Toggles password visibility so the admin can verify what they typed. */
  readonly hidePassword = signal(true);

  readonly form = this.fb.nonNullable.group({
    email: [this.data.email, [Validators.required, Validators.email]],
    // Optional: only enforce the min length when the admin actually types one.
    password: ['', [Validators.minLength(8)]],
    // Per-account weekly targets; 0 is valid and disables the quota bar.
    weeklyCommentQuota: [
      this.data.weeklyCommentQuota,
      [Validators.required, Validators.min(0)],
    ],
    weeklyPostQuota: [
      this.data.weeklyPostQuota,
      [Validators.required, Validators.min(0)],
    ],
  });

  /** Validate, update the shiller, and close returning the updated user. */
  submit(): void {
    // Guard against double-submit and invalid input.
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    // Only send a password when one was entered; otherwise leave it unchanged.
    // Quotas are always sent (the inputs are pre-filled, so they carry a value).
    const { email, password, weeklyCommentQuota, weeklyPostQuota } =
      this.form.getRawValue();
    const changes: {
      email?: string;
      password?: string;
      weeklyCommentQuota?: number;
      weeklyPostQuota?: number;
    } = { email, weeklyCommentQuota, weeklyPostQuota };
    if (password.trim().length > 0) {
      changes.password = password;
    }

    this.loading.set(true);
    this.users.update(this.data.id, changes).subscribe({
      next: (user) => {
        this.loading.set(false);
        this.dialogRef.close(user);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        // Reason: 409 = email already in use; keep the dialog open so the admin
        // can fix it. Everything else is an unexpected failure.
        const message =
          err.status === 409
            ? 'Email already in use.'
            : 'Could not update the account. Please try again.';
        this.snackBar.open(message, 'Dismiss', { duration: 4000 });
      },
    });
  }
}
