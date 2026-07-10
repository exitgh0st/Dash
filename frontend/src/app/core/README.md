# core/

Singleton, app-wide concerns (services, guards, interceptors).

TODO(auth): add `AuthService` (login/register/logout, token storage, current
user + role signal), an HTTP interceptor that attaches the JWT, and a
`RoleGuard('admin' | 'shiller')` used by the shell's child routes.
