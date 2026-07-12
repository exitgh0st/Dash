import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardRangeService } from '../../core/dashboard/dashboard-range.service';
import { DashboardRange } from '../../core/reddit/reddit.models';

/** Title + breadcrumb shown in the topbar for a given route. */
interface PageMeta {
  title: string;
  crumb: string;
}

/** Below this width the sidebar collapses into a toggled overlay drawer. */
const HANDSET_MAX_WIDTH = '(max-width: 1000px)';

/**
 * Application shell: the prototype's fixed sidebar + sticky topbar wrapping the
 * routed content. On wide screens the sidebar is docked; at/below 1000px it
 * collapses to an overlay drawer toggled from a topbar menu button. The topbar
 * shows the page title/breadcrumb and (on the dashboard) the week range pills.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly rangeSvc = inject(DashboardRangeService);

  /** The signed-in user, surfaced in the sidebar footer. */
  readonly currentUser = this.auth.currentUser;

  /** Gates admin-only nav (Team & Access). The route's roleGuard is the real gate. */
  readonly isAdmin = computed(() => this.auth.role() === 'admin');

  /** True at handset/tablet widths; drives the overlay-drawer behaviour. */
  readonly isHandset = toSignal(
    this.breakpointObserver
      .observe(HANDSET_MAX_WIDTH)
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  /** Open state of the mobile overlay drawer. Ignored when docked (desktop). */
  readonly drawerOpen = signal(false);

  /** Selected dashboard week (bound to the range pills). */
  readonly range = this.rangeSvc.range;

  // Current URL as a signal so the topbar title/breadcrumb react to navigation.
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Title + breadcrumb for the current route. */
  readonly pageMeta = computed<PageMeta>(() => this.metaFor(this.url()));

  /** Range pills only make sense on the dashboard, which consumes the range. */
  readonly showRange = computed(() => this.pageMeta().title === 'Dashboard');

  /** Two-letter avatar initials derived from the user's email local part. */
  readonly initials = computed(() => {
    const email = this.currentUser()?.email ?? '';
    return email.slice(0, 2).toUpperCase() || '—';
  });

  /** Friendly role label for the sidebar footer. */
  readonly roleLabel = computed(() =>
    this.auth.role() === 'admin' ? 'Admin' : 'Reddit Manager',
  );

  /** Map a URL to its topbar title/breadcrumb. */
  private metaFor(url: string): PageMeta {
    // Order matters: check the more specific comment/detail paths first.
    if (url.includes('/comments')) {
      return { title: 'Comments', crumb: 'Account activity' };
    }
    if (url.startsWith('/accounts')) {
      return { title: 'Accounts', crumb: 'Tracked Reddit accounts' };
    }
    if (url.startsWith('/history')) {
      return { title: 'Activity History', crumb: 'Post & comment history' };
    }
    if (url.startsWith('/team') || url.startsWith('/shillers')) {
      return { title: 'Team & Access', crumb: 'Roles & access control' };
    }
    if (url.startsWith('/guide')) {
      return { title: 'Guide', crumb: 'How Dash works' };
    }
    return { title: 'Dashboard', crumb: 'Overview' };
  }

  /** Select the dashboard week from the topbar pills. */
  setRange(range: DashboardRange): void {
    this.rangeSvc.set(range);
  }

  /** Toggle the mobile drawer. */
  toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }

  /** Close the drawer — called after navigating on handset so it doesn't linger. */
  closeDrawer(): void {
    if (this.isHandset()) {
      this.drawerOpen.set(false);
    }
  }

  /** Revoke the session and return to the login page. */
  logout(): void {
    this.auth.logout().subscribe(() => {
      void this.router.navigate(['/login']);
    });
  }
}
