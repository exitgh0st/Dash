---
name: release
description: Bump the single unified Dash app version, update it everywhere (root README.md + backend/package.json + frontend/package.json and their lockfiles), then commit and push. A superset of the commit skill — infers one semver bump from the combined changes, lets you confirm/override, updates all version sources in lockstep, groups changes into conventional commits, pushes to GitHub, and ends with a version summary.
user-invocable: true
---

# Release Workflow

Dash uses **one unified app version** for the whole project. It lives in three places, kept in lockstep:

- **`README.md`** (repo root) — the human-facing source of truth: a shields badge (`version-X.Y.Z-…`) and a `**Version:** X.Y.Z` line.
- **`backend/package.json`** (+ `backend/package-lock.json`)
- **`frontend/package.json`** (+ `frontend/package-lock.json`)

There is no version string anywhere in app source or UI. Frontend and backend are two halves of one product shipped together, so they always carry the **same** number — do not version them independently.

## Step 1: Analyze Changes

1. Run `git status --porcelain` to list every changed, added, and deleted file.
2. Run `git diff` (and `git diff --staged` if anything is staged) to understand the actual content of every change.
3. For untracked files, read their contents to understand what they introduce.
4. **Never stage `.env` files.** If one appears in `git status`, flag it and stop.

If there are **no changes at all**, skip straight to Step 6 (print the current version) and stop.

## Step 2: Classify the Changes

Look at every changed path to understand the combined change set:

- Paths under `backend/`, `frontend/`, or root (`PROJECT-STATUS.md`, `.claude/`, `README.md`, etc.) all count toward the **same** app version — there is no per-project version anymore.
- Note what *kind* of changes they are (feature, fix, refactor, docs, chore, breaking) — this drives the bump level in Step 3.

## Step 3: Infer ONE Bump Level

Read the current app version from `backend/package.json` (all three sources are kept identical; if they disagree, flag the drift and use the README as the source of truth). Then pick a single semver bump from the **combined** changes:

- Any breaking API/contract change anywhere → **major**
- Any new feature (`feat`) → **minor**
- Otherwise (`fix` / `refactor` / `chore` / `style` / `docs` / `test`) → **patch**

Present it plainly, e.g.:

```
Dash: feat (frontend) + fix (backend)  ->  minor   0.0.2 -> 0.1.0
```

**Ask the user to confirm or override the bump before applying.** (Pre-1.0 semver is fine with npm's major/minor/patch — the user can override.)

## Step 4: Apply the Bump Everywhere

Compute the new version, then write it to all three sources in lockstep:

1. Bump the backend and capture the printed version:
   ```
   cd backend && npm version <level> --no-git-tag-version
   ```
   This prints `vX.Y.Z` and updates `backend/package.json` + `backend/package-lock.json` (no git commit/tag — committing is Step 5).
2. Set the frontend to that **exact** version:
   ```
   cd frontend && npm version X.Y.Z --no-git-tag-version --allow-same-version
   ```
3. Update `README.md`: replace **every** occurrence of the old version string with the new one — both the badge URL (`version-X.Y.Z-…`) and the `**Version:** X.Y.Z` line.

Afterwards, confirm all three read `X.Y.Z` before committing.

## Step 5: Commit + Push (reuse the commit skill)

Follow the commit skill's grouping, commit, and push logic — see `.claude/skills/commit/SKILL.md`, Steps 2–5. Do not duplicate those rules here; apply them, with these release-specific additions:

- All version-bump files go together in **one** dedicated commit: **`chore(release): bump app to X.Y.Z`** — `README.md`, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json`, `frontend/package-lock.json`.
- Order that release commit **last**, after the feature/fix commits, so the version reflects everything being pushed.
- Present the full commit plan for approval before executing (same as `/commit`).
- If on the default branch, branch first before committing (same repo rule `/commit` follows).
- After all commits, `git push`. **Pushing to GitHub is the publish step** — there is no separate deploy pipeline.

## Step 6: Version Summary (always last)

Print the single app version, marking the change:

```
Released:
  Dash  0.0.2 -> 0.1.0  (minor)
Synced: README.md, backend/package.json, frontend/package.json (+ lockfiles).
Pushed to origin/<branch>.
```

If nothing was committed (no changes), just report the current app version and that there was nothing to release.
