# Dash

![version](https://img.shields.io/badge/version-0.1.0-2b90d9)

**Version:** 0.1.0

Full-stack web app for tracking Reddit karma-farming work across a team of accounts.

## Overview

- **Admin** — oversees all shillers and reviews weekly quota status across every linked Reddit account.
- **Shiller** — operates multiple Reddit accounts and tracks each account's weekly comment quota.

## Tech stack

- **Frontend:** Angular 20 · Angular Material · inline-SVG charts
- **Backend:** NestJS · Prisma ORM · PostgreSQL
- **Auth:** JWT email/password; Reddit access via a shared service token

## Repository layout

| Path | What it is |
|------|-----------|
| `backend/` | NestJS + Prisma API |
| `frontend/` | Angular single-page app |
| `PROJECT-STATUS.md` | Living project status, decisions, and known issues |
| `README-APP-GUIDE.md` | End-user guide |

## Versioning

Dash uses a **single unified app version** for the whole project. The version shown above
is the source of truth and is kept in lockstep with `backend/package.json` and
`frontend/package.json` (and their lockfiles) by the `/release` skill
(`.claude/skills/release/SKILL.md`), which bumps all of them together, commits, and pushes.
