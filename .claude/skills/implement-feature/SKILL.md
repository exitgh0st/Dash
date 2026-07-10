---
name: implement-feature
description: |
  Builds a Dash feature end-to-end. Use when the user says "implement X", "build X", "let's do X", or "/implement-feature [name-or-description]".

  Reads PROJECT-STATUS.md → Upcoming (or takes an ad-hoc description from args), asks 2–5 clarifying questions, implements, verifies build/lint/types and actual behavior, then updates PROJECT-STATUS.md.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
  - Agent
argument-hint: "[feature name or description]"
user-invocable: true
---

# Implement Feature Workflow

You are building a feature for the Dash project. Follow these steps strictly in order.

## Step 1: Load Context

- Read `PROJECT-STATUS.md` to understand what has been built so far and what's queued.
- Read `CLAUDE.md` for project-wide rules (backend, frontend, Reddit API, code quality).
- If `$ARGUMENTS` matches an entry in `PROJECT-STATUS.md → Upcoming`, use that plan. Otherwise treat `$ARGUMENTS` as an ad-hoc description and infer scope from it.
- If no Upcoming entry exists and no `$ARGUMENTS` were given, stop and ask the user what to build.

## Step 2: Read Relevant Source

- Use `Glob` and `Grep` to locate the files the feature will touch or depend on.
- Do NOT scan the whole tree — read only what the feature affects.
- Confirm any assumptions from the plan against what's actually in the code (real class names, real schema fields, real route paths).

## Step 3: Ask Clarifying Questions

- BEFORE writing any code, ask the user 2–5 questions about the feature. Focus on:
  - Naming (routes, DTO fields, component selectors)
  - Ambiguities in the plan
  - Edge cases (empty states, error handling, role permissions)
  - Anything to skip or defer
- WAIT for the user's response before proceeding. (Skip only if the user explicitly said "implement directly".)

## Step 4: Implement

- Follow the plan (if there is one) step by step.
- Follow all rules in `CLAUDE.md`:
  - Thin controllers, service-layer business logic
  - DTOs with `class-validator`
  - JWT guard + role guard on protected routes
  - Reddit calls go through `RedditService` — never from a controller
  - Never log/return refresh tokens
  - Angular standalone components, Material, responsive layouts, loading/empty/snackbar states
- **Write code-review-quality comments as you go** (see CLAUDE.md → Code Quality):
  - JSDoc/TSDoc on new/modified public methods, controllers, DTOs, guards, pipes, interceptors, component classes, exported utilities.
  - One-line intent comment above non-trivial logic blocks (business rules, rate-limit handling, token refresh, RxJS pipelines).
  - `// Reason:` / `// Why:` wherever the code looks surprising or encodes a trade-off.
  - Terse. No essays. No restating identifier names. No comments on self-evident code.

## Step 5: Verify

- **Build:** `npm run build` in `dash-api`, `ng build` in `dash-ui`. Both must pass with no errors.
- **Lint:** `npm run lint` where configured. Fix warnings.
- **Types:** no unresolved TypeScript errors.
- **Behavior:** start the dev server(s) and confirm the feature actually behaves as described — not just "compiles". For UI changes, click through the golden path and one edge case. If you cannot test the UI in this environment, say so explicitly rather than claiming success.
- **Comment audit:** scan your own diff and confirm CLAUDE.md comment rules are met. Add missing JSDoc/intent/rationale now, not later.
- Fix everything before moving on.

## Step 6: Update PROJECT-STATUS.md

This step is CRITICAL.

1. **Current Progress:** update "Last completed" to this feature; update "Next up" based on what remains in Upcoming (or "TBD" if nothing).
2. **What Exists So Far:** add the new modules / pages / components / entities / services under the relevant subsection. Update statuses if this feature completed a partially-built area.
3. **Upcoming:** remove the entry for this feature if it was planned there.
4. **Completed:** append an entry:
   ```markdown
   - **<Feature name>** — <1–2 sentence summary>. Files: <key files>. Endpoints: <if any>. Decisions: <deviations from spec>.
   ```
5. **Key Decisions Made:** add any decisions the user made in Step 3.
6. **Known Issues:** add anything discovered during implementation that isn't fixed.

## Step 7: Report

- One or two sentences on what was implemented (details live in `PROJECT-STATUS.md`).
- Tell the user what's next (from Upcoming) or ask what they want to build next.
- Suggest they run `/commit` when ready.
