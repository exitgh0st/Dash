import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

/** Data passed into the confirm dialog: the account being unlinked. */
export interface ConfirmUnlinkData {
  redditUsername: string;
}

/**
 * Confirmation dialog for unlinking a Reddit account. Closes with `true` when the
 * shiller confirms and `undefined` (falsy) on cancel, so the caller only unlinks
 * on an explicit yes. Uses Material rather than the native `confirm()`.
 */
@Component({
  selector: 'app-confirm-unlink-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Unlink Reddit account</h2>
    <mat-dialog-content>
      Unlink <strong>u/{{ data.redditUsername }}</strong> from Dash? Its quota
      will no longer be tracked. You can re-link it later.
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button type="button" mat-button [mat-dialog-close]="undefined">
        Cancel
      </button>
      <button type="button" mat-flat-button color="warn" [mat-dialog-close]="true">
        Unlink
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmUnlinkDialogComponent {
  /** The account to unlink; supplied by the opener via MatDialog data. */
  readonly data = inject<ConfirmUnlinkData>(MAT_DIALOG_DATA);
}
