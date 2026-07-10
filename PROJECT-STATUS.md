# PROJECT-STATUS.md — Dash

Living memory of the Dash project. Read this first in every session (or run `/resume`).

---

## Current Progress

- **Phase:** Auth complete — login works end-to-end against Supabase; ready for Reddit-account linking
- **Last completed:** Environment setup + Auth (JWT access+refresh, global guards, admin-only user creation, Angular login/guards). Initial migration `init_auth` applied; first admin seeded.
- **Next up:** Reddit account linking (OAuth authorization-code flow per `RedditAccount`, encrypted refresh-token storage, `RedditService` rate-limited client) and the shiller dashboard that lists linked accounts + weekly quota status.

---

## What Exists So Far

### Backend
- `backend/` — NestJS (CLI 11) app. `main.ts` sets global `/api` prefix, `ValidationPipe({ whitelist, transform })`, CORS for the Angular origin, port from `ConfigService`.
- `AppModule` — global `ConfigModule`, imports `PrismaModule` / `UsersModule` / `RedditModule` / `AuthModule`. Global `JwtAuthGuard` + `RolesGuard` registered by `AuthModule`, so every route is protected by default.
- `PrismaModule` / `PrismaService` — `@Global`, connect/disconnect on lifecycle.
- `AuthModule` — `AuthService` (credential validation, access+refresh issue/rotate/revoke), `AuthController` (`/api/auth`: `login`, `refresh`, `logout`, `me`), `JwtStrategy`, `JwtAuthGuard` (honors `@Public()`), `RolesGuard`, `@Roles()` + `@CurrentUser()` decorators, DTOs (`login`, `refresh`). Refresh tokens persisted as SHA-256 hashes only.
- `UsersModule` — `UsersService` (`findByEmail` / `findById` / `findAll` / `create` with bcrypt hashing + P2002→Conflict), `UsersController` (`POST /api/users` + `GET /api/users`, both `@Roles('admin')`), `dto/create-user.dto.ts`, `public-user.ts` (strips `passwordHash`). Service exported.
- `RedditModule` — `RedditService` (config-injected skeleton; rate-limit / token-refresh / axios `oauth.reddit.com` left as TODOs), `RedditController` shell. Service exported.
- `common/` — `@Public()` decorator; `crypto.util.ts` (AES-256-GCM `encrypt`/`decrypt`); `crypto/password.util.ts` (bcrypt `hashPassword`/`comparePassword`, 12 rounds).
- `prisma/seed.ts` — idempotently seeds the first admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`; wired via `package.json#prisma.seed` (ts-node). `tsconfig.build.json` excludes `prisma/` so `nest build` still emits `dist/main.js`.
- `.env.example` (all vars — see Known Issues re: JWT/ADMIN keys), `.gitignore`.

### Frontend
- `frontend/` — Angular 20 standalone + Material 20 + ng2-charts/chart.js.
- App shell (`layout/app-shell`) — Material toolbar + responsive `mat-sidenav` driven by `BreakpointObserver` (`toSignal` `isHandset`; `over`/closed on handset, `side`/open on desktop).
- Placeholder `dashboard` route (`features/dashboard`) with loading (`mat-progress-spinner`) and empty states; lazy-loaded.
- `app.config.ts` — router, `provideHttpClient(withFetch(), withInterceptors([authInterceptor]))`, `provideAnimationsAsync()`.
- `core/auth/` — `AuthService` (login/logout/refresh, localStorage tokens, `currentUser`/`isAuthenticated`/`role` signals, rehydrate on boot), `authInterceptor` (attaches bearer, single auto-refresh on 401 then retry, force-logout on failure), `authGuard` + `roleGuard(role)` factory, `auth.models.ts`.
- `features/auth/login` — standalone Material reactive-form login (email/password, show/hide, `mat-progress-bar` loading, snackbar on error), routed at public `/login`.
- App shell — toolbar account menu shows signed-in email + role and a logout action; email hidden < 600px. `app.routes.ts`: public `/login` + `authGuard` on the shell.
- `environments/` (prod + development via `fileReplacements`); `styles.scss` with Material theme + semantic status CSS vars.

### Entities (Prisma)
- `User` — `id`, `email` (unique), `passwordHash`, `role` (`UserRole` admin|shiller, default shiller), timestamps, `redditAccounts[]`.
- `RedditAccount` — `id`, `userId` (FK, cascade delete), `redditUsername`, `refreshTokenEncrypted`, `status` (`RedditAccountStatus` active|banned|suspended|error), `lastCheckedAt`, timestamps, `@@unique([userId, redditUsername])`.
- `RefreshToken` — `id`, `userId` (FK, cascade delete), `tokenHash` (unique, SHA-256 of the raw token), `expiresAt`, `revokedAt?`, `createdAt`, `@@index([userId])`.
- **Migration `20260710185552_init_auth` applied** to Supabase (creates all three tables + enums). First admin seeded.

### Services / APIs
- **Auth (`/api/auth`):** `POST /login`, `POST /refresh`, `POST /logout` (all take/return JSON), `GET /me`. Login/refresh public; the rest behind the global JWT guard.
- **Users (`/api/users`):** `POST` (admin creates a shiller), `GET` (admin lists users). Both `@Roles('admin')`.
- `UsersService` / `RedditService` / `AuthService` exported for injection. Reddit endpoints still shells.

---

## Upcoming

_Planned but not started. `/plan-feature` appends here; `/implement-feature` reads from here or takes an ad-hoc description._

---

## Completed

_Finished features. `/implement-feature` moves entries here from Upcoming._

- **Repo bootstrap** — CLAUDE.md, AGENTS.md, PROJECT-STATUS.md, `.claude/settings.json`, skills (`resume`, `status`, `commit`, `plan-feature`, `implement-feature`).
- **Scaffold (NestJS + Angular + Prisma)** — two-project repo (`backend/` + `frontend/`). Backend module skeletons, Prisma schema (`User` + `RedditAccount`), config/validation/CORS wiring, `@Public()`, AES-256-GCM crypto util. Frontend responsive Material shell, placeholder dashboard, theme + env wiring. Verified: `npm run build` (backend) + `ng build` (both configs) clean, backend eslint clean, `prisma generate` (no migration), crypto round-trip, dev server serves the app. Auth + initial migration deferred to next.
- **Environment setup + Auth (JWT)** — full-stack authentication. Backend: `AuthModule` with access+refresh JWTs (15m/7d), refresh-token rotation + revocation stored as SHA-256 hashes (`RefreshToken` table), global `JwtAuthGuard` (`@Public()` opt-out) + `RolesGuard` (`@Roles()`), bcrypt password hashing, admin-only `POST/GET /api/users`, `prisma/seed.ts` for the first admin. Frontend: `core/auth/` (signal-based session, HTTP interceptor with auto-refresh, `authGuard`/`roleGuard`), Material login page, guarded shell with logout. Files: `backend/src/auth/*`, `users/{public-user.ts,dto/create-user.dto.ts}`, `common/crypto/password.util.ts`, `prisma/{schema.prisma,seed.ts}`; `frontend/src/app/core/auth/*`, `features/auth/login/*`, `app.{config,routes}.ts`, `layout/app-shell/*`. Endpoints: `POST /api/auth/{login,refresh,logout}`, `GET /api/auth/me`, `POST|GET /api/users`. Verified: migration `init_auth` applied + admin seeded on Supabase; 12/12 live API checks pass (login/`me`/401/create-shiller/403/refresh-rotation/replay-401/bad-password); backend build+eslint clean, frontend `ng build` clean. Decisions: admin-only account creation (no public register), shiller-only `POST /users`, logout revokes only the current token, access+refresh with server-side revocation.

---

## Key Decisions Made

- **Stack:** Angular 18+ / Angular Material · NestJS · Prisma · PostgreSQL — mirrors budgetwise for skill/knowledge reuse.
- **Auth:** JWT email/password for Dash accounts. Reddit OAuth is only for linking individual `RedditAccount`s, not for logging into Dash.
- **No wiki, no tickets.** Prompt-driven workflow with `PROJECT-STATUS.md` as the only persistent memory.
- **Reddit client:** plain `axios` against `oauth.reddit.com`. `snoowrap` is un-maintained; only reach for it if it saves real work.
- **Prisma pinned to 6.x.** npm's latest is Prisma 7, which drops `url` from the datasource block and requires a `prisma.config.ts` + driver adapter passed to `PrismaClient`. For a scaffold that's unnecessary ceremony, so we pinned `prisma`/`@prisma/client` to `^6` (6.19.3) — classic `url = env("DATABASE_URL")` schema and adapter-free `PrismaService`. Revisit if a v7 feature is needed.
- **Angular Material 20 theme configured by hand.** `ng add @angular/material` installed the packages but its theming schematic errored (`azure/blue` "primary" bug) before writing config, and it did not add `@angular/animations`. We wired the theme in `styles.scss` (`mat.theme(...)`), animations via `provideAnimationsAsync()`, and installed `@angular/animations` manually.
- **Frontend versions:** Angular 20 / Material 20 (newer than the "18+" floor in CLAUDE.md) — that's what the CLI installed; standalone-components + signals patterns apply.
- **Auth = access + refresh tokens, admin-managed accounts.** No public registration: the seed script creates the first admin; admins create shillers via `POST /api/users` (role forced to `shiller` server-side). Access token 15m, refresh 7d. Refresh tokens are rotated on use and stored only as SHA-256 hashes in `RefreshToken`, so the DB can revoke/expire them without ever holding the raw token. Logout revokes only the presented (current-session) token. `bcrypt` at 12 rounds via `common/crypto/password.util.ts`.
- **Frontend session in `localStorage`.** Tokens + user cached under `dash.*` keys; the interceptor refreshes once on a 401 and force-logs-out to `/login` if that fails. Chosen for simplicity over httpOnly cookies for this internal tool.
- **DB = Supabase Postgres via the session pooler (port 5432).** That URL works for `prisma migrate`. Migrations applied directly from the dev machine.

---

## Known Issues

- **`backend/.env` and `.env.example` are agent-write-blocked.** The real `.env` was hand-created by the user with generated JWT/encryption secrets. `.env.example` still needs `JWT_ACCESS_SECRET`/`JWT_ACCESS_EXPIRES`, `JWT_REFRESH_SECRET`/`JWT_REFRESH_EXPIRES`, and `ADMIN_EMAIL`/`ADMIN_PASSWORD` added by hand if not already present.
- **Seeded admin uses a placeholder password.** `admin@dash.local` / `DashAdmin123!` — change it (re-seed after deleting the row, or add a password-change flow).
- **Frontend bundle exceeds the 500 kB budget by ~69 kB** (Angular Material footprint) — build warning only, not an error. Bump the budget in `angular.json` or defer trimming.
- **Prisma prints a `package.json#prisma` seed-config deprecation warning** (removed in Prisma 7). Harmless on the pinned v6; revisit if/when upgrading to a `prisma.config.ts`.
- **Frontend login UI not exercised in a browser this session** — verification was API-level (12/12) plus a clean `ng build`. Worth a manual click-through of `/login` → dashboard → logout.
