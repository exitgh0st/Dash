import { Routes } from '@angular/router';
import { AppShellComponent } from './layout/app-shell/app-shell.component';
import { authGuard, roleGuard } from './core/auth/auth.guard';

/**
 * Application routes.
 *
 * `/login` is public and renders outside the shell. Everything else renders
 * inside the authenticated AppShell, gated by `authGuard`. Dashboard, Accounts,
 * and Activity History are shared by both roles (each view scopes itself by role
 * and the backend enforces access); Team & Access is admin-only.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(
        (m) => m.LoginComponent,
      ),
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        // Role-branched overview (admin = all accounts, shiller = own).
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        // Role-aware: admin sees all accounts read-only; shiller manages own.
        path: 'accounts',
        loadComponent: () =>
          import('./features/accounts/accounts.component').then(
            (m) => m.AccountsComponent,
          ),
      },
      {
        // Merged comment-history feed for the caller's in-scope accounts.
        path: 'history',
        loadComponent: () =>
          import('./features/history/history.component').then(
            (m) => m.HistoryComponent,
          ),
      },
      {
        // Admin-only Team & Access (create + list users). roleGuard bounces shillers.
        path: 'team',
        canActivate: [roleGuard('admin')],
        loadComponent: () =>
          import('./features/admin/shillers/shillers.component').then(
            (m) => m.ShillersComponent,
          ),
      },
      // Back-compat: the old management route now lives at /team.
      { path: 'shillers', redirectTo: 'team', pathMatch: 'full' },
      {
        // Admin drill-down: one shiller's tracked Reddit accounts.
        path: 'shillers/:userId',
        canActivate: [roleGuard('admin')],
        loadComponent: () =>
          import('./features/admin/shillers/shiller-detail.component').then(
            (m) => m.ShillerDetailComponent,
          ),
      },
      {
        // Shared comments view — reached by an admin (from any account) and by a
        // shiller (from their own). Backend authorizes admin-any / shiller-own.
        path: 'reddit-accounts/:accountId/comments',
        loadComponent: () =>
          import('./features/reddit/account-comments.component').then(
            (m) => m.AccountCommentsComponent,
          ),
      },
      // Back-compat: the old shiller accounts route now lives at /accounts.
      { path: 'reddit-accounts', redirectTo: 'accounts', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
