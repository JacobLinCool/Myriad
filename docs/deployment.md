# Deploy to Cloudflare

This guide uses your own Cloudflare account and domain. For local development, see the [README](../README.md). You can enable [NYCU OAuth](nycu-oauth.md), [Google sign-in through Firebase Authentication](google-oauth.md), or both. Production requires Workers, D1, R2, and a configured sign-in provider. Optional OpenAI and PostHog integrations need accounts with those services.

## Deployment configuration and resources

`apps/worker/wrangler.jsonc` contains local defaults, with no production account or domain. Set up your own deployment configuration from the repository root:

```sh
cp apps/worker/wrangler.production.example.jsonc apps/worker/wrangler.production.jsonc
```

`wrangler.production.jsonc` is Git-ignored. Fill in your Worker name, `account_id`, domain in `routes[].pattern`, and `vars.APP_ORIGIN`. The template uses a Cloudflare custom domain, so the domain must belong to a Cloudflare zone you can manage. Set `APP_ORIGIN` to a full HTTPS origin without a trailing slash, path, or query.

Sign in to Cloudflare, or set a `CLOUDFLARE_API_TOKEN` with the required permissions in a protected environment. Create resources from `apps/worker`:

```sh
cd apps/worker
pnpm exec wrangler login
pnpm exec wrangler d1 create myriad_d1 --config wrangler.production.jsonc
pnpm exec wrangler r2 bucket create myriad-bucket --config wrangler.production.jsonc
```

Copy the resource details into the configuration: `database_name` and `database_id` under `d1_databases`, and `bucket_name` under `r2_buckets`. Keep the binding names used by the code: `DB`, `BUCKET`, and `ASSETS`. If resources already exist, use their details instead.

Configure the sign-in providers you need in `vars`. NYCU uses `NYCU_CLIENT_ID` and the secret set below. Google uses `FIREBASE_PROJECT_ID` and `FIREBASE_API_KEY`. Set platform administrators in `ADMIN_IDENTITIES`, a JSON string such as `[{"provider":"nycu","subject":"your-username"}]`. For Google, use `provider: "google"` and the Google subject shown in Myriad, not the Firebase UID. See [Google sign-in setup](google-oauth.md#platform-administrators-and-exam-authors) to find it. Each sign-in option appears only when that provider's settings and `APP_ORIGIN` are nonempty; the origin is checked during login. Leave Firebase settings empty for an NYCU-only deployment.

Register the full callback with each provider first. For NYCU, use `APP_ORIGIN` plus `/api/auth/nycu/callback`. For Google, use `APP_ORIGIN` plus `/api/auth/google/callback`, registered on the Web OAuth client used by Firebase's Google provider. Enable the Google provider in Firebase and authorize your domain there as well. Once the application upgrade and provider setup are complete, enabling sign-in depends only on Worker configuration; the frontend does not need rebuilding.

## Secrets

Still in `apps/worker`, run these commands and enter the secret values when prompted:

```sh
pnpm exec wrangler secret put ADMIN_TOKEN --config wrangler.production.jsonc
pnpm exec wrangler secret put ATTEMPT_SECRET --config wrangler.production.jsonc
```

If you use NYCU, also set the university client secret:

```sh
pnpm exec wrangler secret put NYCU_CLIENT_SECRET --config wrangler.production.jsonc
```

Firebase's provider manages the Google OAuth client secret; the Worker does not need it. `FIREBASE_API_KEY` identifies the Firebase project and can be stored in your production `vars`. It is not a service-account private key.

Use different high-entropy random values for `ADMIN_TOKEN` and `ATTEMPT_SECRET`; the latter must be at least 32 characters long. Keep `ATTEMPT_SECRET` the same throughout an exam. Changing it invalidates existing attempt write credentials. `.dev.vars` is for local use only and does not replace production Worker secrets. Always pass the production configuration to secret commands so they target the correct Worker.

| Setting                                    | Purpose                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`                               | The same production HTTPS origin for users and OAuth callbacks                                                       |
| `ADMIN_IDENTITIES`                         | Verified OAuth accounts allowed to grant exam-creation permission; defaults to `[]`                                  |
| `ADMIN_TOKEN`                              | Platform service credential for creation grants and toolchain management; do not distribute to ordinary exam authors |
| `ATTEMPT_SECRET`                           | Issues attempt write credentials and pseudonymizes analytics identifiers                                             |
| `NYCU_CLIENT_ID` / `NYCU_CLIENT_SECRET`    | Optional university sign-in application settings                                                                     |
| `FIREBASE_PROJECT_ID` / `FIREBASE_API_KEY` | Optional Google sign-in through Firebase Authentication                                                              |
| `OPENAI_API_KEY` / `OPENAI_SEMANTIC_MODEL` | Optional implementation-requirement checks                                                                           |
| `POSTHOG_KEY` / `POSTHOG_HOST`             | Optional Worker analytics events and browser analytics proxy                                                         |

## Build, migrate, and deploy

For a new, empty database, apply all migrations in order. Before upgrading a deployment with existing data, read the migration notes below and back up the data.

```sh
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
cd ../..
pnpm check
pnpm --filter=@myriad/worker exec wrangler deploy --dry-run --config wrangler.production.jsonc
pnpm --filter=@myriad/worker deploy
```

The last command explicitly uses `wrangler.production.jsonc` and deploys the Worker with `apps/web/dist`. `--dry-run` does not validate cloud resources, permissions, external models, or real OAuth sign-in.

After deployment, check `/api/health`, the home page, and `crossOriginIsolated`, then complete these acceptance checks:

1. Sign in with a real account using each enabled provider. Confirm that the callback returns to the same production origin and disabled providers have no sign-in button.
2. Have a platform administrator grant exam-creation permission to an author, then have the author create a personal CLI credential.
3. Upload the toolchain with the platform credential. Then publish an exam containing synthetic data with the author's credential.
4. Check access restrictions before the exam, manager previews, normal student compilation and submission, interrupted-upload recovery, and restrictions after the deadline.
5. Download submissions, rejudge them with the local runtime, and upload the report. Confirm that ordinary students cannot access management data.

See the [operations guide](agent-workflow.md) for toolchain and exam publishing commands. Use separate identifiers and data for test exams and real exams.

## Optional services

### OpenAI implementation checks

This service is used only for problems configured with `semanticCheck`. Add the key:

```sh
pnpm --filter=@myriad/worker exec wrangler secret put OPENAI_API_KEY --config wrangler.production.jsonc
```

Set `vars.OPENAI_SEMANTIC_MODEL` in the production configuration to choose a model compatible with the application's Responses API request format. If unset, the default in [`semantic.ts`](../apps/worker/src/semantic.ts) is used. Verify model availability, quota, and actual judgments with your own API account; repository tests do not call a real model. Without an API key, the server rejects publication of problems with semantic requirements.

Requests send the implementation requirements and the first 20,000 Unicode characters of student code, without separate identifiers or tests, and use `store=false`. Explain this data flow to participants first; source code may itself contain personal data. Model failures can be retried. A failed semantic check makes the attempt's score zero, while keeping test results and reasons for managers to review.

### PostHog

Analytics are disabled by default. To enable browser and Worker analytics:

1. Copy `apps/web/.env.example` to the ignored `apps/web/.env` and set your `VITE_POSTHOG_KEY`. This project key is compiled into the browser bundle; do not use a personal API key.
2. On the Worker, set `POSTHOG_KEY` for the same project and `POSTHOG_HOST` to its ingestion host. The default host is `https://us.i.posthog.com`; explicitly set the corresponding URL for other regions.
3. Rebuild the frontend and deploy. Inspect actual events and PostHog's recording, autocapture, and retention settings.

The browser uses the same-origin `/ingest` proxy, which is unavailable without a Worker `POSTHOG_KEY`. To disable product analytics in both the browser and Worker, clear both keys. Then rebuild and deploy. This does not delete stored data or disable Myriad's built-in D1 telemetry. See the [architecture guide](architecture.md) for data contents and the limits of identity pseudonymization.

## Exports and existing data

Use CLI `pull` and the dashboard's export features for routine work. For infrastructure-level analysis, run this from the repository root:

```sh
pnpm --filter=@myriad/worker export-data --from "2026-01-01T00:00:00+08:00" --to "2026-01-02T00:00:00+08:00" --exam my-exam --skip posthog
```

Replace the time range and exam ID with your own. The export script reads `apps/worker/wrangler.production.jsonc` by default; use `--config` to select another file. Cloudflare reads require `CLOUDFLARE_API_TOKEN` in the environment. Unless you skip PostHog, you also need `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID`. For this script, `POSTHOG_HOST` means the PostHog API host, which defaults to `https://us.posthog.com`, not the Worker's ingestion host.

Output goes to the Git-ignored `exports/` directory by default. It may contain real identities, IP addresses, source code, and analytics events, so store it in a protected location. This is an analysis export, not a full backup and restore tool. Backups must cover D1, R2, and the deployment settings needed for recovery.

If upgrading from a deployment before `0009_exam_permissions.sql`, first create the mapping table `migration_teacher_identities(teacher_id, account_id, provider, subject)`. Use manually verified OAuth identities to assign each former manager a target account; `account_id` must be the retained legacy manager ID. Missing mappings cause migration failure. An empty database has no former managers and needs no mapping rows.

This migration preserves ownership, valid credentials, submissions, and reports, and removes the old management tables. It does not merge accounts by display name. Rehearse on a copy of the data before running it in production. Pause requests for incompatible schema changes; [`maintenance.ts`](../apps/worker/scripts/maintenance.ts) can serve as a temporary entry point. Update the Worker, frontend, and CLI together. Applied migrations are part of the data history and should not be edited or deleted.

`0014_auth_providers.sql` links login sessions to accounts and allows Google submission identities. Apply it when upgrading the application even if the deployment remains NYCU-only. Existing NYCU sessions, account identifiers, and submissions are preserved. Pending OAuth states are cleared, so users must restart any login in progress. This schema change also requires pausing requests, backing up data, and updating the application together. Do not let an old Worker continue using the new schema.
