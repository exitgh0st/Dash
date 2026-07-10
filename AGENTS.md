# AGENTS.md — Dash Unified Agent Instructions

## PRIORITY RULES (Always Apply First)

1. Read `PROJECT-STATUS.md` before any other file.
2. Ask 2–5 clarifying questions before writing code.
3. Wait for user answers before implementation.
4. Implement one focused change at a time.
5. Verify build / lint / typecheck before finalizing.
6. Never log or return Reddit refresh tokens.
7. Never trust `role` from the client — always from the JWT payload.

---

## Agent Commands (Skill Emulation)

### /resume

1. Read `PROJECT-STATUS.md`
2. Read `CLAUDE.md`
3. Summarize:
   * what exists so far
   * last thing built
   * next thing planned
   * known issues

### /status

Return:
* what's built
* what's next
* known issues

### /plan-feature [description]

Workflow:
1. Read `PROJECT-STATUS.md` and `CLAUDE.md`
2. Ask 2–5 clarifying questions
3. Draft plan: objective, backend changes, frontend changes, acceptance criteria, files to touch
4. Show plan, iterate until approved
5. Append to `PROJECT-STATUS.md → Upcoming`

### /implement-feature [description]

Workflow:
1. Read `PROJECT-STATUS.md`, `CLAUDE.md`, and any matching Upcoming entry
2. Ask 2–5 clarifying questions
3. Wait for answers
4. Implement
5. Verify:
   * build passes
   * lint passes
   * no TypeScript errors
   * feature actually behaves as described
6. Update `PROJECT-STATUS.md` (move to Completed, refresh What Exists So Far, log decisions/issues)

### /commit

Group changes into logical conventional commits, present plan, execute, push.

---

## Project Overview

Dash is a full-stack web app for tracking Reddit karma-farming across a team.

Two roles:
* **admin** — oversees all shillers and their Reddit accounts, watches weekly quotas
* **shiller** — operates 1..N Reddit accounts, uses Dash to see which accounts still need this week's comments

Shillers post/comment in US-stock-market subreddits to grow karma so each account reads as organic. Actual project promotion is future work; current job is karma farming.

### Tech Stack

* Frontend: Angular 18+, Angular Material, Chart.js (ng2-charts)
* Backend: NestJS, Prisma ORM, PostgreSQL
* Auth: JWT (email/password) for Dash accounts; Reddit OAuth per linked `RedditAccount`
* Reddit API: OAuth refresh-token flow, plain `axios` against `oauth.reddit.com`, global rate-limit throttle in `RedditService`

### Design Requirements

* Fully responsive: 375px → 1440px
* Angular Material required
* BreakpointObserver required where layout changes
* CSS Grid + Flexbox layouts

---

## Context Rules

### Session Start Read Order

1. `PROJECT-STATUS.md`
2. `CLAUDE.md`
3. Source files as needed

There is no wiki. There are no tickets. `PROJECT-STATUS.md` is the single persistent memory.

---

## Reddit API Rules

* Refresh tokens stored encrypted, never logged, never returned in API responses.
* All Reddit calls go through `RedditService` — never from a controller.
* Rate limit: 60 req/min per OAuth client. `RedditService` owns global throttling.
* Always set a descriptive `User-Agent` header.
* Env vars: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`, `REDDIT_REDIRECT_URI`.

### Never

* Log a refresh token
* Return a refresh token to the frontend
* Hit Reddit from a controller
* Poll Reddit without respecting `X-Ratelimit-Remaining`

---

## Backend Rules

* Thin controllers only
* Business logic in services
* Export every service
* DTO + class-validator required
* ValidationPipe:
  * whitelist: true
  * transform: true
* Handle Prisma:
  * P2002
  * P2003
* Nest exceptions:
  * NotFoundException
  * ConflictException
  * BadRequestException
  * ForbiddenException
* Prefix all routes with `/api`
* JWT guard global by default, opt out with `@Public()` on `/api/auth/*`
* Role guard reads `User.role` from JWT payload

### Never

* Put business logic in controllers
* Skip DTO validation
* Trust `role` from a request body or header

---

## Frontend Rules

* Standalone components only
* Angular Material only
* Responsive first
* BreakpointObserver required where layout changes
* Loading state required
* Empty state required
* Snackbar confirmations required
* Role-aware routes guarded by `RoleGuard('admin' | 'shiller')` — never rely on hiding a link

### Colors

* Quota met = `#4CAF50`
* Quota short = `#FF9800`
* Account banned/suspended/error = `#F44336`

---

## Code Quality Rules

* Descriptive names only
* One component/service per file
* **Code-review-quality comments on every change.**

### Required Comments

* JSDoc/TSDoc on every new or modified:
  * NestJS service method
  * NestJS controller handler
  * DTO class
  * guard / pipe / interceptor / filter
  * Angular component class
  * exported utility / helper / pipe
* One-line intent comment above non-trivial logic:
  * business rule branches
  * guardrail / validation branches
  * Reddit rate-limit / token-refresh handling
  * async flows and RxJS pipelines
  * complex selectors / computed signals
* Rationale comment (`// Reason:` or `// Why:`) anywhere the code:
  * looks surprising
  * defends against a specific edge case
  * encodes a deliberate trade-off

### Do Not Comment

* Self-evident code
* Obvious getters / setters
* Restatements of the identifier name
* Multi-paragraph docstrings — one short line is almost always enough

### Applies To

* TypeScript (NestJS + Angular)
* Prisma schema
* HTML templates (use `<!-- -->` for non-obvious structure)
* SCSS (for non-obvious layout hacks)

### Never

* Rename schema fields without asking
* Change API contracts silently
* Add migrations unless requested
* Ship code changes without the comments above

---

## Clarification Protocol

Before coding always ask:

1. Any spec changes?
2. Naming preference?
3. Anything to skip?
4. Preferred implementation pattern?

Never skip unless user explicitly says: "implement directly".

---

## Verification Before Final Output

Must verify:

* npm build / ng build passes
* lint clean
* no TypeScript warnings
* feature behaves as described (not just compiles)

Fix issues before final response.
