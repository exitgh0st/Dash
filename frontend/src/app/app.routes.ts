import { Routes } from '@angular/router';
import { AppShellComponent } from './layout/app-shell/app-shell.component';
import { authGuard } from './core/auth/auth.guard';

/**
 * Application routes.
 *
 * `/login` is public and renders outside the shell. Everything else renders
 * inside the authenticated AppShell, gated by `authGuard`. Role-specific pages
 * should add `roleGuard('admin' | 'shiller')` to their child route once they
 * exist (dashboard is currently shared by both roles).
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
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
