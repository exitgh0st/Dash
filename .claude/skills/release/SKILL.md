---
name: release
description: Bump the app version for whichever project changed (backend, frontend, or both), then commit and push. A superset of the commit skill — infers a semver bump per changed project, lets you confirm/override, updates package.json + package-lock.json, groups changes into conventional commits, pushes to GitHub, and ends with a version summary of both projects.
user-invocable: true
---

# Release Workflow

Bumps versions for the changed project(s), then runs the full commit + push flow. Versions live in exactly two canonical places per project — `backend/package.json` and `frontend/package.json`, each mirrored in its `package-lock.json`. There is **no version string anywhere in app source or UI**, so bumping those files is all that's required.

## Step 1: Analyze Changes

1. Run `git status --porcelain` to list every changed, added, and deleted file.
2. Run `git diff` (and `git diff --staged` if anything is staged) to understand the actual content of every change.
3. For untracked files, read their contents to understand what they introduce.
4. **Never stage `.env` files.** If one appears in `git status`, flag it and stop.

If there are **no changes at all**, skip straight to Step 6 (print current versions) and stop.

## Step 2: Detect Which Projects Changed

Classify every changed path:

- Path under `backend/` → **backend** changed.
- Path under `frontend/` → **frontend** changed.
- Anything else (`PROJECT-STATUS.md`, `.claude/`, root `README`, etc.) belongs to **neither** — it triggers **no** version bump.

A project is a bump candidate only if it has real source/config changes of its own. If only root-level files changed, bump nothing but still proceed to commit + push (Step 5).

## Step 3: Infer a Bump Level per Changed Project

For each changed project, judge the diff the same way `/commit` picks a conventional type, and map it to a semver bump:

- Breaking API/contract change → **major**
- New feature (`feat`) → **minor**
- Everything else (`fix` / `refactor` / `chore` / `style` / `docs` / `test`) → **patch**

Read the current version from each project's `package.json` and present a table, e.g.:

```
backend:  fix + chore  -> patch   0.0.1 -> 0.0.2
frontend: feat         -> minor   0.0.0 -> 0.1.0
```

**Ask the user to confirm or override each bump before applying.** (Pre-1.0 semver is fine with npm's major/minor/patch — the user can override, e.g. keep breaking changes at minor while under 0.x.)

## Step 4: Apply the Bump

For each confirmed project, run npm's version tool **in that project's directory** — it updates `package.json` **and** `package-lock.json` together without creating a git commit or tag:

```
cd backend  && npm version <level> --no-git-tag-version
cd frontend && npm version <level> --no-git-tag-version
```

`--no-git-tag-version` is required — committing is handled in Step 5. (Note: `npm version` runs a project's `version` lifecycle script if one is defined; neither project defines one today.)

## Step 5: Commit + Push (reuse the commit skill)

Follow the commit skill's grouping, commit, and push logic — see `.claude/skills/commit/SKILL.md`, Steps 2–5. Do not duplicate those rules here; apply them, with these release-specific additions:

- The bumped `package.json` / `package-lock.json` for a project go in a dedicated **`chore(release): bump <project> to <x.y.z>`** commit.
- Order the release commit(s) **last**, after the feature/fix commits, so the version bump reflects everything being pushed.
- Present the full commit plan for approval before executing (same as `/commit`).
- If on the default branch, branch first before committing (same repo rule `/commit` follows).
- After all commits, `git push`. **Pushing to GitHub is the publish step** — there is no separate deploy pipeline.

## Step 6: Version Summary (always last)

Print the current version of **both** projects, marking what changed:

```
Released:
  backend   0.0.1 -> 0.0.2  (patch)
  frontend  0.0.0           (unchanged)
Pushed to origin/<branch>.
```

If nothing was committed (no changes), just report both current versions and that there was nothing to release.
