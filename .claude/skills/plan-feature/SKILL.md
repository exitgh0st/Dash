---
name: plan-feature
description: |
  Plans a new Dash feature before you build it. Use whenever the user wants to think through a change — "plan X", "how would we add X", "make a plan for X", or "/plan-feature [description]".

  Interviews the user, reads relevant source, drafts a short prescriptive plan, iterates until approved, then appends it to PROJECT-STATUS.md → Upcoming so /implement-feature can pick it up.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
argument-hint: "[feature description]"
user-invocable: true
---

# Plan Feature

You produce short, actionable Dash implementation plans. The result should be prescriptive enough that `/implement-feature` can build it without ambiguity — but nowhere near the ceremony of a formal ticket.

---

## Step 1 — Understand the request

If the user passed a description as args (`/plan-feature admin sees a leaderboard of shillers by karma this week`), use that. If not, ask: "What do you want to plan?"

Then ask, in a single `AskUserQuestion` call, only what you still need — skip anything already obvious:

- **Scope:** backend-only / frontend-only / full-stack?
- **Priority / urgency:** any deadline or blocker context?
- **Anything to specifically include or skip?**

Do not ask about dependencies — infer them from source.

---

## Step 2 — Read context

1. Read `PROJECT-STATUS.md` — what already exists, what's queued, what the current phase is.
2. Read `CLAUDE.md` if you haven't this session — global rules and Reddit API guidance shape almost every plan.
3. Read only the source files relevant to the feature (backend module, frontend feature folder, Prisma schema). Use `Glob` and `Grep` to locate them. Do NOT scan the whole tree.
4. Reuse existing services, DTOs, components where they exist — don't propose new versions of things that already exist.

---

## Step 3 — Draft the plan

Keep it short. Structure:

```markdown
### <Feature name>
**Scope:** backend / frontend / full-stack
**Depends on:** <existing services / entities, or "none">

**Objective:** one paragraph — what and why.

**Backend changes:** (omit if none)
- New service methods (file:method)
- New endpoints (METHOD /api/path — DTO)
- Prisma schema additions
- Migrations required (yes/no)

**Frontend changes:** (omit if none)
- New pages/components (file — role guard)
- New services (file — API calls)
- Material modules to import

**Acceptance criteria:**
- <verifiable statement>
- <verifiable statement>

**Files to touch:**
- create: <path>
- modify: <path>
```

**Rules:**
- File paths must match what actually exists — no guesses.
- Reference services/components by their real class names.
- Prisma queries must match the actual schema.
- Every acceptance criterion must be independently verifiable ("Admin sees all shillers sorted by weekly comment count descending"), not vague ("the page works").

---

## Step 4 — Present and iterate

Show the full plan markdown to the user and ask: "Does this look right, or any changes?"

Iterate until they approve.

---

## Step 5 — Append to PROJECT-STATUS.md

Edit `PROJECT-STATUS.md` and add the approved plan under the **Upcoming** section. If Upcoming currently says `_Planned but not started..._`, replace that placeholder with the plan; otherwise append after existing Upcoming entries.

Tell the user the plan has been saved and that they can run `/implement-feature "<feature name>"` when ready.

---

## Tips

- **The plan is a hand-off to `/implement-feature`.** Everything a fresh session needs to build the feature should be in the plan or in `PROJECT-STATUS.md`.
- **Don't restate CLAUDE.md rules in the plan** — the implementer already reads them.
- **Skip sections that don't apply.** A backend-only feature has no Frontend section.
- **Do not write code in the plan.** Interfaces (DTO field names, endpoint signatures) are fine; full method bodies belong in `/implement-feature`.
