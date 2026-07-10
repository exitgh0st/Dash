# CLAUDE.md — Dash Project Instructions

## What Is This Project?

Dash is a full-stack web app for tracking Reddit karma-farming work across a team of accounts.

**Two user roles:**
- **Admin** — oversees all shillers, reviews weekly quota status across every linked Reddit account, spots underperformers or banned accounts.
- **Shiller** — operates multiple Reddit accounts. Uses the app to see, per account, which accounts already met this week's comment quota and which still need work.

**Domain notes:**
- "Shilling" here is a nickname, not the current activity. Shillers post/comment in US-stock-market subreddits (e.g. r/wallstreetbets, r/stocks, r/investing) to grow karma so each account looks like a genuine long-time user. Actual project promotion happens later, when accounts are established — the current job is karma farming that reads as organic.
- Weekly comment quota is defined per shiller (or globally, TBD). The app polls the Reddit API to count how many comments each linked account has made in the current week.
- Each shiller-user in the app owns 1..N Reddit accounts (a `RedditAccount` entity linked to `User(role=shiller)`).

**Tech stack:**
- **Frontend:** Angular 18+ · Angular Material · Chart.js (ng2-charts)
- **Backend:** NestJS · Prisma ORM · PostgreSQL
- **Auth:** NestJS Passport + JWT, email/password. `User.role` is `admin` or `shiller`. Reddit OAuth is used only to authorize each linked `RedditAccount`, not to log a user into Dash.
- **Reddit integration:** OAuth refresh-token flow per linked account (see below).

**Design requirements:**
- Fully responsive — mobile (375px) and desktop (1440px)
- Angular Material components throughout
- `BreakpointObserver` from Angular CDK for responsive logic
- CSS Grid and Flexbox for layouts

---

## Reddit API Integration

- Register a Reddit app at https://www.reddit.com/prefs/apps. Use type **"web app"** so per-account OAuth (authorization code + refresh token) works — script apps only cover one account.
- Environment variables (in `.env`, never commit):
  ```
  REDDIT_CLIENT_ID=...
  REDDIT_CLIENT_SECRET=...
  REDDIT_USER_AGENT=dash/0.1 by <your-reddit-username>
  REDDIT_REDIRECT_URI=http://localhost:3000/api/reddit/callback
  ```
- **Per `RedditAccount` refresh token** — obtained via authorization code flow when a shiller links an account; store encrypted in DB. Never log tokens.
- **Client library:** default to plain `axios` against `https://oauth.reddit.com` (simpler, fewer surprises). `snoowrap` is fine if it saves real work, but it's un-maintained.
- **Rate limit:** 60 requests/min per OAuth client. The Reddit service must throttle globally — a queue/token-bucket in the service layer, not per-caller. Respect `X-Ratelimit-Remaining` / `X-Ratelimit-Reset` headers.
- **Endpoints in play:**
  - `GET /user/{username}/comments?limit=100&after=...` — recent comments (paginate until you cross the week boundary)
  - `GET /user/{username}/submitted` — recent posts (for future post quotas)
  - `GET /api/v1/me` — validate a refresh token after link
- **User-Agent header is required.** Reddit rejects requests without a descriptive one.

---

## Context Management — PROJECT-STATUS.md

`PROJECT-STATUS.md` at the repo root is the living memory of this project. It tracks: what's been built, what's next, key decisions, and known issues.

**Rules:**
1. **Start of every session:** read `PROJECT-STATUS.md` (or run `/resume`).
2. **After building anything non-trivial:** update `PROJECT-STATUS.md` — either via `/implement-feature` (which does it for you) or by hand.
3. This is a single flat file. No wiki, no ticket folder — those add process overhead that doesn't pay off at this project size.

---

## Working Style

Dash is prompt-driven — you tell the agent what you want and it builds it. Two skills exist to keep that structured:

| Skill | When to use |
|-------|------------|
| `/plan-feature [description]` | Think through a change before building. Asks clarifying questions, drafts a short plan, appends it to `PROJECT-STATUS.md → Upcoming`. |
| `/implement-feature [description]` | Build a feature end-to-end. Asks 2–5 clarifying questions, implements, verifies, updates `PROJECT-STATUS.md`. |
| `/resume` | Restore context in a fresh session — reads `PROJECT-STATUS.md`. |
| `/status` | Quick progress check. |
| `/commit` | Group changes into logical conventional commits and push. |

---

## Critical Workflow Rules

### Rule 1: Ask Before You Build

Before writing any code, ask the user 2–5 clarifying questions:
- Modifications to the spec?
- Naming preferences?
- Features to add, skip, or change?
- Preferred patterns or approaches?

**Wait for the user's response before proceeding.**

### Rule 2: Verify Before Committing

- Code compiles without errors (`npm run build` or `ng build`)
- Dev server starts cleanly
- No lint errors or TypeScript warnings
- Feature actually behaves as described (not just "compiles")

Fix issues before committing.

---

## Global Implementation Rules

### Backend
- **Thin controllers.** Business logic lives in services. Controllers validate input, call the service, return the result.
- **Export every service** from its module so other modules can inject it.
- **DTOs with class-validator** for all request bodies. Global `ValidationPipe` with `whitelist: true`, `transform: true`.
- **NestJS exceptions:** `NotFoundException`, `ConflictException`, `BadRequestException`, `ForbiddenException`. Handle Prisma error codes: P2002 (unique), P2003 (foreign key).
- **All routes prefixed `/api`** via `app.setGlobalPrefix('api')`.
- **Auth:** JWT guard globally by default; opt out with a `@Public()` decorator only for `/api/auth/*` routes. Role guard reads `User.role` from the JWT payload.
- **Reddit calls go through a single `RedditService`** — no controller talks to Reddit directly. The service owns rate limiting, token refresh, and error normalization.
- **Secrets** (`REDDIT_CLIENT_SECRET`, refresh tokens, JWT signing key) are read from `ConfigService`, never inlined.

### Frontend
- **Responsive first.** Every component works on mobile and desktop. Use `BreakpointObserver` + CSS Grid/Flexbox.
- **Angular Material** for all UI elements.
- **Standalone components** (no NgModules for pages).
- **Loading states** on every page (`mat-spinner` or `mat-progress-bar`).
- **Empty states** on every list/chart.
- **Snackbar confirmations** for all create/update/delete operations.
- **Role-aware routing:** admin routes are guarded by a `RoleGuard('admin')`; shiller routes by `RoleGuard('shiller')`. Never rely on hiding a link to enforce access.

### Colors (semantic)
- Quota met = `#4CAF50` (green)
- Quota short = `#FF9800` (orange)
- Account banned/suspended/error = `#F44336` (red)
- Admin accent — pick during theming
- Shiller accent — pick during theming

### Code Quality
- Descriptive names for variables, methods, and files.
- One component/service per file.
- **Code-review-quality comments on all changes.** Write code as if a real developer will review every diff. Add comments wherever they make review easier — not excessive, but deliberate.
  - **Required comments:**
    - JSDoc/TSDoc on every new/modified public service method, controller handler, DTO class, guard, pipe, interceptor, Angular component class, and exported utility — state purpose, params, return, and thrown exceptions.
    - A one-line intent comment above non-trivial logic blocks (business rules, guardrails, validation branches, Reddit rate-limit handling, token refresh, async flows, RxJS pipelines, complex selectors).
    - A rationale comment (`// Reason:` or `// Why:`) anywhere the code looks surprising, defends against a specific edge case, or encodes a deliberate trade-off.
  - **Do not comment:** self-evident code, obvious getters/setters, or restatements of the identifier name. One short line is almost always enough — never multi-paragraph docstrings.
  - **Applies to all languages in this repo:** TypeScript (NestJS + Angular), Prisma schema, HTML templates (use `<!-- -->` for non-obvious structural choices), SCSS (for non-obvious layout hacks).

### Never
- Log or return refresh tokens.
- Hit Reddit from a controller directly.
- Trust `role` from the client — always from the JWT payload.
- Add migrations without asking.
- Change API contracts silently.
