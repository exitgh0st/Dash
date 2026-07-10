import { Routes } from '@angular/router';
import { AppShellComponent } from './layout/app-shell/app-shell.component';

/**
 * Application routes. Everything renders inside the AppShell layout. Lazy
 * `loadComponent` keeps feature pages out of the initial bundle.
 *
 * TODO(auth): add a public /login route outside the shell, and guard the shell
 * children with RoleGuard('admin' | 'shiller').
 */
export const routes: Routes = [
  {
    path: '',
    component: AppShellComponent,
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
