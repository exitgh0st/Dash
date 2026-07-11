import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthUser } from '../../../core/auth/auth.models';
import { UsersService } from '../../../core/users/users.service';

/**
 * Dialog for an admin to create a shiller account. Collects email + password
 * (password mirrors the backend `CreateUserDto`: min 8 chars) and calls
 * `UsersService.create`. On success it closes returning the created user so the
 * list page can refresh; a duplicate email keeps the dialog open with an inline
 * snackbar so the admin can correct it.
 */
@Component({
  selector: 'app-create-shiller-dialog',
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
  templateUrl: './create-shiller-dialog.component.html',
  styleUrl: './create-shiller-dialog.component.scss',
})
export class CreateShillerDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly users = inject(UsersService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef =
    inject<MatDialogRef<CreateShillerDialogComponent, AuthUser>>(MatDialogRef);

  /** True while the create request is in flight; drives the progress bar. */
  readonly loading = signal(false);

  /** Toggles password visibility so the admin can verify what they typed. */
  readonly hidePassword = signal(true);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    // Min length mirrors the backend CreateUserDto (@MinLength(8)).
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  /** Validate, create the shiller, and close returning the new user on success. */
  submit(): void {
    // Guard against double-submit and invalid input.
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { email, password } = this.form.getRawValue();
    this.users.create(email, password).subscribe({
      next: (user) => {
        this.loading.set(false);
        this.dialogRef.close(user);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        // Reason: 409 = email already in use; keep the dialog open to let the
        // admin fix it. Everything else is an unexpected failure.
        const message =
          err.status === 409
            ? 'Email already in use.'
            : 'Could not create the account. Please try again.';
        this.snackBar.open(message, 'Dismiss', { duration: 4000 });
      },
    });
  }
}
