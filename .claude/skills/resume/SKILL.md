---
name: resume
description: Resume the Dash project from where you left off. Use when starting a new Claude Code session or after context was lost. Reads PROJECT-STATUS.md and CLAUDE.md to restore full context.
user-invocable: true
---

# Resume Project Workflow

Use this when starting a fresh Claude Code session or when you've lost context.

## Step 1: Read Project State
Read `PROJECT-STATUS.md` for:
- What has been built so far
- What is next
- Key decisions and known issues

## Step 2: Read Project Rules
Read `CLAUDE.md` to refresh workflow rules, backend/frontend conventions, and the Reddit API integration guidelines.

## Step 3: Brief the User
Present a short summary based on what `PROJECT-STATUS.md` actually reports (do not hardcode counts):
- Current phase
- Last thing built — title
- Next up — title
- Key things built so far (brief list)
- Known issues (or "none")

## Step 4: Ask What's Next
- "Ready to build the next thing, or is there something else you'd like to do first?"
