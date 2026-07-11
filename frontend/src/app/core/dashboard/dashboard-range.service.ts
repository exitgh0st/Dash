import { Injectable, signal } from '@angular/core';
import { DashboardRange } from '../reddit/reddit.models';

/**
 * Shared selected-week state for the dashboard. The app-shell topbar range pills
 * write to it; the dashboard reads it (via a signal effect) to refetch. Kept in a
 * root service so the pills and the routed page can coordinate without input
 * plumbing through the router-outlet.
 */
@Injectable({ providedIn: 'root' })
export class DashboardRangeService {
  /** Currently selected week. Defaults to the current week. */
  readonly range = signal<DashboardRange>('this-week');

  /** Set the active week (called by the topbar range pills). */
  set(range: DashboardRange): void {
    this.range.set(range);
  }
}
