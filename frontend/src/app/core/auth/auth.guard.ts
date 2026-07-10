import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { UserRole } from './auth.models';

/**
 * Allows the route only for a signed-in user; otherwise redirects to /login.
 * Access is never enforced by merely hiding links — this guard is the gate.
 */
export const authGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : router.parseUrl('/login');
};

/**
 * Factory guard that additionally requires a specific role. Use for admin-only
 * or shiller-only routes, e.g. `canActivate: [roleGuard('admin')]`.
 *
 * @param role the role required to activate the route.
 */
export function roleGuard(role: UserRole): CanActivateFn {
  return (): boolean | UrlTree => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) {
      return router.parseUrl('/login');
    }
    // Wrong role → bounce to the shared dashboard rather than reveal the route.
    return auth.role() === role ? true : router.parseUrl('/dashboard');
  };
}
