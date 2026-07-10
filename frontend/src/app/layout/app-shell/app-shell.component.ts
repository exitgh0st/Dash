import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { map } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Application shell: a Material toolbar plus a responsive sidenav that wraps the
 * routed content. On handset widths the sidenav overlays content (`over`); on
 * larger screens it sits alongside (`side`) and stays open. The toolbar shows
 * the signed-in user and a logout action.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** The signed-in user, surfaced in the toolbar account menu. */
  readonly currentUser = this.auth.currentUser;

  /**
   * True when the viewport is a handset (mobile). Drives sidenav mode and open
   * state. Exposed as a signal so it can be read directly in event handlers
   * (e.g. closing the drawer after navigation) without an async pipe.
   */
  readonly isHandset = toSignal(
    this.breakpointObserver
      .observe(Breakpoints.Handset)
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  /** Revoke the session and return to the login page. */
  logout(): void {
    this.auth.logout().subscribe(() => {
      void this.router.navigate(['/login']);
    });
  }
}
