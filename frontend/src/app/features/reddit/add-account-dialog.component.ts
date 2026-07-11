import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

/**
 * Dialog for tracking a new Reddit account by username. Closes with the trimmed
 * username on confirm and `undefined` on cancel, so the caller only submits on an
 * explicit add. Reddit validity is enforced server-side; here we only block empty
 * input.
 */
@Component({
  selector: 'app-add-account-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>Add Reddit account</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Reddit username</mat-label>
        <span matTextPrefix>u/&nbsp;</span>
        <input
          matInput
          name="username"
          [(ngModel)]="username"
          (keyup.enter)="submit()"
          autocomplete="off"
          cdkFocusInitial
        />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button type="button" mat-button [mat-dialog-close]="undefined">
        Cancel
      </button>
      <button
        type="button"
        mat-flat-button
        color="primary"
        [disabled]="!username.trim()"
        (click)="submit()"
      >
        Add
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .full-width {
      width: 100%;
      min-width: 16rem;
    }
  `,
})
export class AddAccountDialogComponent {
  /** Bound to the username input; the `u/` prefix is display-only. */
  username = '';

  constructor(private readonly dialogRef: MatDialogRef<AddAccountDialogComponent>) {}

  /** Close with the trimmed username, ignoring empty/whitespace-only input. */
  submit(): void {
    const value = this.username.trim();
    if (!value) {
      return;
    }
    this.dialogRef.close(value);
  }
}
