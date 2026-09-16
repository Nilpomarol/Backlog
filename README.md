# Backlog

> An invite-only feedback and product-roadmap app for the small applications you build and share.

Backlog gives friends, family, and early users a simple place to report bugs, suggest ideas, vote on what matters, and follow work through to completion. It keeps the operational controls private while making feedback easy to contribute.

![Backlog product preview](public/og.png)

## Why it exists

Feedback for small personal products often gets lost between chat messages, notes, and half-remembered conversations. Backlog turns that feedback into a lightweight, structured workflow without opening an app's internal planning to everyone.

## Highlights

- **Invite-only, role-aware access** — Firebase identity is verified by the API; administrators, card owners, and other users have deliberately different capabilities.
- **Per-app feedback boards** — capture bugs, features, improvements, tasks, and investigations; vote on requests and avoid duplicates with title-similarity suggestions.
- **A practical workflow** — move work through backlog, in progress, review, done, and discarded; use priority, effort, child cards, and checklists where useful.
- **Resilient on the move** — installable PWA with persisted read data, an offline outbox, and revision-conflict detection for queued writes.
- **Built for a real deployment** — API request IDs, write-body limits, per-user throttling, Cloudflare deployment guidance, and GitHub Actions validation.

## Architecture

| Layer | Technology |
| --- | --- |
| Client | React, TypeScript, Vinext/Vite, TanStack Query |
| API | Hono on Cloudflare Workers |
| Data | Turso (libSQL) with Drizzle ORM |
| Identity | Firebase Authentication with an invited-email allowlist |
| Delivery | Cloudflare Workers, PWA service worker, GitHub Actions |

The browser never receives database credentials. Firebase browser configuration is public app configuration; the API verifies identity tokens and enforces permissions before reading or writing data.

## Screens

The repository includes the visual product preview above. The app itself is access-controlled, so the public repository contains no real user data or credentials.

## Run locally

Requires Node.js 22.13 or later.

```bash
npm ci
cp .env.example .env.local
npm run db:setup
npm run dev
```

In PowerShell, replace the copy command with `Copy-Item .env.example .env.local`.

`db:setup` applies the tracked migrations and can create the initial administrator invitation when `ADMIN_EMAIL` is set. See [`.env.example`](.env.example) for every local variable.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
```

The test command builds the production bundle before checking API guardrails, permissions, duplicate matching, offline behaviour, generated precache assets, and server-rendered routes. The same checks run on pull requests and on `main` in [GitHub Actions](.github/workflows/ci.yml).

## Deployment

Backlog is prepared to deploy to Cloudflare Workers. The full setup—Firebase authorized domains, Turso secrets, runtime/build variable split, and release checks—is in [the deployment guide](doc/CLOUDFLARE_DEPLOYMENT.md).

## Project status

This is an actively developed personal product. The core feedback, workflow, offline, and access-control flows are working; features and interface details continue to evolve.
