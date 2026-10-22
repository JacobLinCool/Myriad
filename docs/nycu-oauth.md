# NYCU OAuth sign-in

NYCU OAuth is an optional sign-in provider that can be enabled on its own or alongside [Google sign-in](google-oauth.md). Students can sign in with an enabled provider or answer as guests using an identifier they enter themselves. Exam managers use verified accounts to access the permissions granted to them. This guide covers setting up your own NYCU application. See the [deployment guide](deployment.md) for the full Cloudflare resource and secret setup.

## Register an application

Follow the [official NYCU OAuth documentation](https://id.nycu.edu.tw/docs/) to register an application and obtain your own client ID and client secret:

| Field                    | Value                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Client name              | Your service name, for example Myriad                                                           |
| Client type              | `Public`                                                                                        |
| Authorization grant type | `Authorization code`                                                                            |
| Redirect URIs            | `https://judge.example.com/api/auth/nycu/callback`, with the domain replaced by your deployment |

For local testing, also register the exact callback URL, such as `http://localhost:8787/api/auth/nycu/callback`. Every allowed URL must be registered. Whether localhost URLs can be registered depends on the university's rules.

Myriad requests the `profile` scope and uses the returned `username` as the NYCU account identifier. It does not infer permissions from a name, email address, or display text. Accessing other university records requires additional scopes and corresponding code changes.

## Configure the Worker

For local development, use the Git-ignored `apps/worker/.dev.vars`:

```dotenv
APP_ORIGIN=http://localhost:8787
NYCU_CLIENT_ID=your-client-id
NYCU_CLIENT_SECRET=your-client-secret
ADMIN_IDENTITIES=[{"provider":"nycu","subject":"your-username"}]
```

Keep the existing `ADMIN_TOKEN` and `ATTEMPT_SECRET` in the same file. In production, put `APP_ORIGIN`, `NYCU_CLIENT_ID`, and `ADMIN_IDENTITIES` in your production configuration, and set `NYCU_CLIENT_SECRET` as a Worker secret:

```sh
pnpm --filter=@myriad/worker exec wrangler secret put NYCU_CLIENT_SECRET --config wrangler.production.jsonc
```

NYCU sign-in requires all three of `APP_ORIGIN`, `NYCU_CLIENT_ID`, and `NYCU_CLIENT_SECRET`. Deployments that use only NYCU can leave `FIREBASE_PROJECT_ID` and `FIREBASE_API_KEY` empty; no Firebase project is needed.

`APP_ORIGIN` must be a single origin with no path, trailing slash, or query. Use HTTPS in production. Local development accepts HTTP origins only for `localhost` or `127.0.0.1`. The hostname and port must match the URL used in the browser; the two local hostnames are not interchangeable.

`pnpm dev:worker` uses the port from `APP_ORIGIN` in `.dev.vars`, defaulting to 8787. `pnpm dev:web` provides a separate Vite origin and proxies API requests. Verify the complete sign-in and cookie flow from the Worker origin. If sign-in starts from another origin, the application shows the correct URL.

## Platform administrators and exam authors

`ADMIN_IDENTITIES` is a list of `(provider, subject)` pairs configured by the deployer and matched against verified OAuth accounts. The NYCU profile does not contain Myriad administrator roles. Without this list, there are no OAuth platform administrators. The separate `ADMIN_TOKEN` can still grant exam creation permission and upload toolchains.

Platform administrators sign in at `/teacher` and use **Account and permissions** to grant exam creation permission to themselves or other accounts. An account needs creation permission to create a new exam and become its owner. Owners can invite co-managers. Invitees do not need creation permission and can manage only the exams they are invited to.

After signing in, exam authors can create revocable personal CLI credentials. The CLI accepts them through `MYRIAD_TEACHER_TOKEN` or `--token-file`. Do not distribute the platform `ADMIN_TOKEN` to ordinary exam authors. See the [manager guide](agent-workflow.md) for more on permissions and CLI commands.

## Sessions and verification

- Authorization uses a one-time state and S256 PKCE. The callback consumes a valid state before creating a session.
- NYCU sessions use a 24-hour HttpOnly cookie, with a session hash stored in the database. The university access token is used only to fetch the account during that sign-in.
- Guest, NYCU, and Google identities have distinct participant IDs. Even when their display text matches, their drafts, submissions, summaries, cooldowns, and grades remain separate.
- The same NYCU session works in both student and management interfaces. Each request checks management permissions separately, and management writes authenticated by a cookie must pass the Origin check.
- Failed, cancelled, or expired sign-ins return to the application with an error. Users can try again or answer as guests.

Automated tests use a local Worker and D1 with isolated OAuth responses. They cover state, callback replay, cancellation, expiry, cross-site logout, and identity isolation. For production verification, someone with a NYCU account must complete a real sign-in and check:

- Return to the original page.
- The account identifier.
- Session persistence after a refresh.
- Switching to a guest.
- Exam submissions.
- Management permissions.
