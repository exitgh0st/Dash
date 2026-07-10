# PROJECT-STATUS.md — Dash

Living memory of the Dash project. Read this first in every session (or run `/resume`).

---

## Current Progress

- **Phase:** Scaffolded — backend + frontend skeletons build; ready for auth
- **Last completed:** Full-stack scaffold (NestJS + Prisma + Angular/Material) with `User` & `RedditAccount` schema
- **Next up:** Auth feature (JWT register/login, global `JwtAuthGuard` + `@Public()`, `RolesGuard`, Angular login page + `AuthService` + `RoleGuard`) and the initial Prisma migration

---

## What Exists So Far

### Backend
- `backend/` — NestJS (CLI 11) app. `main.ts` sets global `/api` prefix, `ValidationPipe({ whitelist, transform })`, CORS for the Angular origin, port from `ConfigService`.
- `AppModule` — global `ConfigModule`, imports `PrismaModule` / `UsersModule` / `RedditModule`. `// TODO(auth)` markers where the auth module + global guard go.
- `PrismaModule` / `PrismaService` — `@Global`, connect/disconnect on lifecycle.
- `UsersModule` — `UsersService` (stubbed `findByEmail` / `create`), `UsersController` shell. Service exported.
- `RedditModule` — `RedditService` (config-injected skeleton; rate-limit / token-refresh / axios `oauth.reddit.com` left as TODOs), `RedditController` shell. Service exported.
- `common/` — `@Public()` decorator; `crypto.util.ts` (AES-256-GCM `encrypt`/`decrypt` keyed by `ENCRYPTION_KEY`, verified round-trip + tamper-detect).
- `.env.example` (all vars), `.gitignore`.

### Frontend
- `frontend/` — Angular 20 standalone + Material 20 + ng2-charts/chart.js.
- App shell (`layout/app-shell`) — Material toolbar + responsive `mat-sidenav` driven by `BreakpointObserver` (`toSignal` `isHandset`; `over`/closed on handset, `side`/open on desktop).
- Placeholder `dashboard` route (`features/dashboard`) with loading (`mat-progress-spinner`) and empty states; lazy-loaded.
- `app.config.ts` — router, `provideHttpClient(withFetch())`, `provideAnimationsAsync()`.
- `environments/` (prod + development via `fileReplacements`); `styles.scss` with Material theme + semantic status CSS vars; `core/` placeholder for auth (`// TODO(auth)`).

### Entities (Prisma)
- `User` — `id`, `email` (unique), `passwordHash`, `role` (`UserRole` admin|shiller, default shiller), timestamps, `redditAccounts[]`.
- `RedditAccount` — `id`, `userId` (FK, cascade delete), `redditUsername`, `refreshTokenEncrypted`, `status` (`RedditAccountStatus` active|banned|suspended|error), `lastCheckedAt`, timestamps, `@@unique([userId, redditUsername])`.
- Client generated via `prisma generate`. **No migration run yet** (deferred with the auth feature).

### Services / APIs
- No HTTP endpoints implemented yet — controllers are shells. `UsersService` / `RedditService` exported for injection.

---

## Upcoming

_Planned but not started. `/plan-feature` appends here; `/implement-feature` reads from here or takes an ad-hoc description._

---

## Completed

_Finished features. `/implement-feature` moves entries here from Upcoming._

- **Repo bootstrap** — CLAUDE.md, AGENTS.md, PROJECT-STATUS.md, `.claude/settings.json`, skills (`resume`, `status`, `commit`, `plan-feature`, `implement-feature`).
- **Scaffold (NestJS + Angular + Prisma)** — two-project repo (`backend/` + `frontend/`). Backend module skeletons, Prisma schema (`User` + `RedditAccount`), config/validation/CORS wiring, `@Public()`, AES-256-GCM crypto util. Frontend responsive Material shell, placeholder dashboard, theme + env wiring. Verified: `npm run build` (backend) + `ng build` (both configs) clean, backend eslint clean, `prisma generate` (no migration), crypto round-trip, dev server serves the app. Auth + initial migration deferred to next.

---

## Key Decisions Made

- **Stack:** Angular 18+ / Angular Material · NestJS · Prisma · PostgreSQL — mirrors budgetwise for skill/knowledge reuse.
- **Auth:** JWT email/password for Dash accounts. Reddit OAuth is only for linking individual `RedditAccount`s, not for logging into Dash.
- **No wiki, no tickets.** Prompt-driven workflow with `PROJECT-STATUS.md` as the only persistent memory.
- **Reddit client:** plain `axios` against `oauth.reddit.com`. `snoowrap` is un-maintained; only reach for it if it saves real work.
- **Prisma pinned to 6.x.** npm's latest is Prisma 7, which drops `url` from the datasource block and requires a `prisma.config.ts` + driver adapter passed to `PrismaClient`. For a scaffold that's unnecessary ceremony, so we pinned `prisma`/`@prisma/client` to `^6` (6.19.3) — classic `url = env("DATABASE_URL")` schema and adapter-free `PrismaService`. Revisit if a v7 feature is needed.
- **Angular Material 20 theme configured by hand.** `ng add @angular/material` installed the packages but its theming schematic errored (`azure/blue` "primary" bug) before writing config, and it did not add `@angular/animations`. We wired the theme in `styles.scss` (`mat.theme(...)`), animations via `provideAnimationsAsync()`, and installed `@angular/animations` manually.
- **Frontend versions:** Angular 20 / Material 20 (newer than the "18+" floor in CLAUDE.md) — that's what the CLI installed; standalone-components + signals patterns apply.

---

## Known Issues

_None yet._
