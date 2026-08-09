# Backlog

A private, responsive backlog for personal applications. Friends and family can report bugs, suggest features, vote, and follow progress while the administrator controls the workflow.

## Architecture

- React and TypeScript on Vinext/Vite
- Hono API on Cloudflare Workers
- Turso with Drizzle ORM
- Firebase Authentication with an invited-email allowlist

The browser never receives Turso credentials. All permissions are enforced by the API.

## Local development

Install dependencies, copy `.env.example` to `.env.local`, and add development credentials. The visual backlog can be developed without production data; authenticated API routes require Firebase and Turso configuration.

```text
npm install
npm run dev
```

Database migrations are generated with `npm run db:generate`.

## Deployment

The repository is ready for deployment to Cloudflare Workers either from a
GitHub repository or from a local terminal. Cloudflare serves the responsive
frontend and the API together; Turso and Firebase remain externally managed.

Follow [the deployment checklist](doc/CLOUDFLARE_DEPLOYMENT.md) for the exact
Cloudflare settings, environment-variable split, Firebase domain setup, and
first-release checks.

## Database and invitations

Create or update the Turso schema with:

```text
npm run db:setup
```

Administrators can invite, revoke, and restore users from **Settings › People**
in the application. The command-line alternative remains available:

```text
npm run user:invite -- person@example.com "Display name"
```

Add `admin` as the last argument only when the person should control workflow and internal requests. List invitation and Firebase-link status with `npm run user:list`.

Administrators can also create, edit, reorder, archive, and restore applications
from **Settings › Apps**. Archiving preserves every existing request.

Authenticated write requests are limited to 32 KiB and throttled per user. Every API response includes a request identifier for safe troubleshooting.
