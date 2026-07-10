import { Component, OnInit, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';

/**
 * Placeholder dashboard page. Demonstrates the required loading and empty states
 * that real feature pages will follow. Content (quota widgets, charts) is added
 * once the backend endpoints exist.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [MatCardModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  /** True while data is loading; drives the spinner. */
  readonly loading = signal(true);

  /** Placeholder data set — empty for now so the empty state is shown. */
  readonly items = signal<unknown[]>([]);

  ngOnInit(): void {
    // Simulate an initial load so the loading→empty transition is visible.
    // TODO: replace with a real data call once quota endpoints exist.
    setTimeout(() => this.loading.set(false), 600);
  }
}
