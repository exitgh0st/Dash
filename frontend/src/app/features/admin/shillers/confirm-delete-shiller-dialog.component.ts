import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

/** Data passed into the confirm dialog: the shiller being deleted. */
export interface ConfirmDeleteShillerData {
  email: string;
  redditAccountCount: number;
}

/**
 * Confirmation dialog for deleting a shiller. Closes with `true` when the admin
 * confirms and `undefined` (falsy) on cancel, so the caller only deletes on an
 * explicit yes. Warns that the shiller's linked Reddit accounts go with them.
 */
@Component({
  selector: 'app-confirm-delete-shiller-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Delete shiller</h2>
    <mat-dialog-content>
      Delete <strong>{{ data.email }}</strong>? This also removes their
      @if (data.redditAccountCount > 0) {
        {{ data.redditAccountCount }} linked Reddit account{{
          data.redditAccountCount === 1 ? '' : 's'
        }}
      } @else {
        linked Reddit accounts
      }
      and cannot be undone.
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button type="button" mat-button [mat-dialog-close]="undefined">
        Cancel
      </button>
      <button type="button" mat-flat-button color="warn" [mat-dialog-close]="true">
        Delete
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDeleteShillerDialogComponent {
  /** The shiller to delete; supplied by the opener via MatDialog data. */
  readonly data = inject<ConfirmDeleteShillerData>(MAT_DIALOG_DATA);
}
