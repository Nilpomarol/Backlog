# Cloudflare deployment

This app is prepared for direct deployment from GitHub to Cloudflare Workers.
It does not depend on an OpenAI hosting account or service.

## Before connecting Cloudflare

1. Push this repository to a private GitHub repository.
2. In Firebase Authentication, enable Google as a sign-in provider.
3. Apply the Turso migrations locally with `npm run db:setup` if this has not
   already been done.
4. Keep `.env.local` private. It is ignored by Git and must never be committed.

## Create the Worker from GitHub

1. In the Cloudflare dashboard, open **Workers & Pages** and create an
   application by importing the GitHub repository.
2. Authorize only the repository or organization Cloudflare needs.
3. Use `shared-app-backlog` as the Worker name. This must match
   `wrangler.jsonc`.
4. Use these build settings:

   | Setting | Value |
   |---|---|
   | Production branch | `main` |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |
   | Non-production deploy command | `npx wrangler versions upload` |

Cloudflare will build and deploy pushes to the production branch. Pull requests
are validated separately by the included GitHub Actions workflow.

## Build variables

Add these under the Worker's build configuration. They are public Firebase web
configuration and are embedded in the browser bundle during the build:

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

Use the same values as `.env.local`. Despite the word `API_KEY`, Firebase web
configuration is public identification, not a server credential. Access is
still protected by Firebase authentication and the server-side invitation
allowlist.

## Runtime variables and secrets

In the deployed Worker's **Settings > Variables and Secrets**, add:

| Name | Kind | Source |
|---|---|---|
| `FIREBASE_PROJECT_ID` | Variable | Firebase project ID |
| `TURSO_DATABASE_URL` | Secret | Turso database URL |
| `TURSO_AUTH_TOKEN` | Secret | Turso database token |

Do not add `ADMIN_EMAIL` or `ADMIN_NAME` to Cloudflare. They are used only by
the local database setup command.

The Wrangler configuration keeps dashboard-managed variables when a new build
is deployed.

## Allow the production domain in Firebase

After the first deployment, copy the generated hostname, such as
`shared-app-backlog.<account>.workers.dev`. In Firebase Console, open
**Authentication > Settings > Authorized domains** and add its hostname without
`https://` or a path.

Repeat this step if you later attach a custom domain.

## Verify the release

1. Open `https://<your-domain>/api/health`; it should return a successful JSON
   response.
2. Sign in with the administrator Google account.
3. Create, edit, move, vote on, and delete a temporary card.
4. Invite an ordinary user from the in-app user-management screen.
5. Confirm that the ordinary user cannot see internal cards or administrator
   controls.
6. Check the phone layout as well as the desktop board.

## Optional local deployment

For a manual first deployment instead of Git integration:

```text
npx wrangler login
npm run deploy
```

For a build and packaging check that uploads nothing:

```text
npm run deploy:dry-run
```

## Ongoing operation

- A push to `main` triggers the production build after Git integration is
  enabled.
- GitHub Actions runs type checking, linting, and tests on pull requests and
  `main`.
- Database migrations are intentionally not run during deployment. Apply and
  review them explicitly with `npm run db:setup` before releasing code that
  depends on a new schema.
- Keep regular Turso exports outside the repository.
