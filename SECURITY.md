# Security policy

## Reporting a vulnerability

Use the repository host's private vulnerability reporting feature when it is enabled, such as **Security → Report a vulnerability** on GitHub. If no private reporting route is available, ask a maintainer to establish one in a public issue without including exploit details or sensitive data. Do not send production credentials, real student submissions, database dumps or unpublished exam material.

A useful report includes the affected commit, deployment assumptions, expected security boundary, reproducible steps using synthetic data and the impact. Fixes target the current development branch; this project does not promise a response deadline or backports to older releases.

## Security model

- Student execution and telemetry happen on an untrusted client. Matching checksums are provisional results, not proof that the submitted program ran. Use administrator-side verification when reliable grading is required.
- Guest identities are self-declared. Someone using the same guest label can access that label's public summaries while the exam is open; they cannot retrieve stored source code through those summaries. NYCU and Google identities require the corresponding verified session. Accounts and permissions are keyed by provider and subject, never by a matching display name or email address.
- Test inputs are distributed to browsers during an exam. Closing an exam stops new API access but cannot revoke downloaded material. Reference solutions and stored submissions are restricted to authorized exam managers.
- Exam owners and collaborators can access student source code, identities, telemetry and available network metadata for exams they manage. Platform administrators manage creation grants and shared toolchains. Cloudflare account access is a separate, more powerful infrastructure boundary.
- Drafts remain in browser storage, isolated by identity and exam. Clearing browser storage can remove them; public submission summaries do not restore source code.

See [architecture and data flows](docs/architecture.md) for the complete context.

## Deployment responsibilities

Use unique high-entropy values for `ADMIN_TOKEN` and `ATTEMPT_SECRET`. Keep personal CLI tokens, `.dev.vars`, production configuration, exports and verification reports private. Rotate a compromised credential; rotating `ATTEMPT_SECRET` invalidates existing attempt write tokens and changes analytics pseudonyms, so coordinate the impact on active exams.

Serve the application over HTTPS and preserve the Worker security and cross-origin-isolation headers. Configure `APP_ORIGIN` and the OAuth callback for the same origin. Apply database migrations, review account grants and use synthetic data when testing a deployment.

NYCU and Google login are enabled independently. NYCU uses its Worker client ID and secret; Google uses `FIREBASE_PROJECT_ID` and `FIREBASE_API_KEY` with Google enabled in Firebase Authentication. The Worker uses Firebase's REST authorization-code flow, binds its one-use login cookie to Firebase state, session ID and context, and verifies the Firebase ID token's signature, project issuer and audience, expiry, authentication time and Google provider identity. Myriad's Google subject comes from the signed `firebase.identities["google.com"]` claim, not the Firebase UID, email or display name. Firebase manages the Google OAuth client secret. Enabling login does not grant exam-creation or administrator permissions.

Firebase may retain Google profile, email and sign-in data; Myriad retains the Google subject, display name and its own session records, but does not store the returned Firebase or Google tokens or email. Disabling login configuration, disabling or deleting a Firebase user, or revoking Firebase tokens does not immediately invalidate existing Myriad sessions or personal CLI credentials. Myriad sessions expire after 24 hours or logout; revoke Myriad permissions and CLI credentials separately when required. See [Google through Firebase setup](docs/google-oauth.md).

Submissions and internal telemetry can contain student identifiers, source code, device IDs, IP addresses and User-Agent data. Establish appropriate access, retention, backup and deletion practices for your deployment. Myriad does not provide a general retention scheduler.

OpenAI semantic checks and PostHog analytics are optional integrations. Semantic checks send source code to OpenAI; `store=false` is a request setting, not a claim about every provider retention policy. PostHog uses pseudonymous account identifiers and configurable browser capture; pseudonymization and masking do not make all event data anonymous. Review the configured services and inform participants before enabling them.

The [deployment guide](docs/deployment.md) documents required settings and the operational verification steps.
