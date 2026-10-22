# Google sign-in through Firebase Authentication

Google sign-in is optional and available to both students and exam managers. Myriad uses Firebase Authentication's REST authorization flow: the Worker verifies the Firebase ID token, then creates a Myriad session. Google sign-in stays hidden when Firebase is not configured. Existing NYCU deployments need no additional settings.

## Configure Firebase and Google

1. Create or choose a project in the [Firebase Console](https://console.firebase.google.com/). Under **Authentication → Sign-in method**, enable **Google** and set the support contact. Get the project ID and Web API key for the Worker configuration below.
2. Add your Myriad hostname, such as `judge.example.com`, under **Authentication → Settings → Authorized domains**. Add `localhost` separately for local testing; new projects do not allow it by default. Use separate projects for production and testing. [Firebase configuration guide](https://firebase.google.com/docs/auth/faq-and-troubleshooting)
3. Find the Web OAuth client used by the Google provider. In the [Google Cloud Console](https://console.cloud.google.com/) for the same project, edit that client's **Authorized redirect URIs** and add the full Myriad callback URL, such as `https://judge.example.com/api/auth/google/callback`. For the test project, add `http://localhost:8787/api/auth/google/callback`. The client ID and secret stored in the Firebase provider must belong to this Web client.

Myriad passes its own callback as `continueUri` in the REST `createAuthUri` call. Google redirects directly to the Worker, which calls `signInWithIdp` to finish signing in. Register the Myriad callback above; the Firebase JS SDK's `/__/auth/handler` does not replace it. This flow needs no Firebase Hosting, browser SDK, or sign-in proxy. [Firebase REST authorization contract](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/createAuthUri), [Google redirect URI rules](https://developers.google.com/identity/protocols/oauth2/web-server)

Set the Google OAuth consent screen's **Audience** to match your users: External for a public service, or Internal for accounts in that organization only. Public services must provide their own website, privacy policy, and contact information, publish the application, and complete any verification Google requires. With only basic identity scopes, Google Testing has a test-user exception and cannot serve as Myriad's account allowlist. Workspace administrator policies may still block sign-in. [Google audience rules](https://support.google.com/cloud/answer/15549945?hl=en)

Firebase may store Google profiles, email addresses, and sign-in records. Myriad requests no additional Google API scopes and does not use email as a permission identifier. Deployers must still explain Firebase's data handling in their privacy notice.

## Configure the Worker

For local development, edit the Git-ignored `apps/worker/.dev.vars`:

```dotenv
APP_ORIGIN=http://localhost:8787
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_API_KEY=your-firebase-web-api-key
```

Keep the existing `ADMIN_TOKEN`, `ATTEMPT_SECRET`, and any NYCU settings you need. The interface shows Google sign-in when `APP_ORIGIN` and both Firebase settings are nonempty; no separate feature flag is needed. Successful sign-in also requires a valid `APP_ORIGIN`: a single origin with no path, trailing slash, or query. Use HTTPS in production. For local development, HTTP origins are accepted only for `localhost` or `127.0.0.1`.

In production, set `vars.FIREBASE_PROJECT_ID` and `vars.FIREBASE_API_KEY` in your own `apps/worker/wrangler.production.jsonc`. The API key identifies the Firebase project; it is not a Google client secret or service-account private key. Use a key that allows server calls to the Identity Toolkit API. Browser HTTP referrer restrictions are not suitable for this Worker flow. Firebase manages the Google OAuth client secret in its provider configuration, so the Worker does not need it. [Firebase API key management](https://firebase.google.com/docs/projects/api-keys)

When upgrading to this version, back up the database and apply `0014_auth_providers.sql` before updating the Worker and frontend together. See the [deployment guide](deployment.md). After the upgrade, the frontend reads sign-in options from the Worker. Enabling Google requires no further frontend build or changes to CSP or cross-origin isolation headers.

Verify local sign-in from the Worker URL specified by `APP_ORIGIN`, which defaults to `http://localhost:8787`. Vite's `http://localhost:5173` is a different origin and cannot replace the registered callback. This integration uses the production Firebase REST endpoints and has no Authentication Emulator mode. Use a separate Firebase test project for local verification.

## Platform administrators and exam authors

Google sign-in verifies an account; it does not automatically grant exam creation or management permissions. Myriad identifies accounts by `(provider, subject)`. The provider is `google`, and the subject comes from `firebase.identities["google.com"]` in the verified Firebase ID token: Google's stable account identifier. **The UID shown in Firebase Console and the Firebase token's `sub` are a different identifier. Do not use them in Myriad's Google permission settings.** [Firebase identity fields](https://firebase.google.com/docs/reference/rules/rules.firestore.Request#auth)

Sign in with Google, then find your account identifier under **Account and permissions** in the management workspace. You can also open `/api/auth/session` in the same browser. There, `account.kind` is `google`, `account.label` is the subject, and `account.displayName` is only the display name. The deployer uses the subject in `ADMIN_IDENTITIES`, for example:

```dotenv
ADMIN_IDENTITIES=[{"provider":"google","subject":"123456789012345678901"}]
```

Replace this example ID with your own value. You can include NYCU administrators in the same list. After updating the Worker configuration, sign in at `/teacher` as a platform administrator. Use **Account and permissions** to grant exam creation permission to yourself or other exam authors. Platform administrator status alone does not grant creation permission.

CLI grant and invitation commands use `--provider google --subject GOOGLE_SUB`. Exam authors can create personal CLI credentials in the workspace using the same flow as NYCU users; see the [manager guide](agent-workflow.md#exam-creation-permission-and-collaboration). Email addresses, names, and Firebase UIDs cannot replace the Google subject. Myriad does not link NYCU, Google, or guest accounts by matching names or email addresses.

## Sessions, disabling sign-in, and verification

Sign-in uses a full-page redirect. The Worker binds a one-time sign-in cookie to the Firebase authorization state, session ID, and login context. The callback then completes sign-in through [`signInWithIdp`](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signInWithIdp). Before creating a Myriad session, the Worker verifies the Firebase token's signature, project issuer and audience, validity period, authentication time, and Google provider identity. [Firebase token verification contract](https://firebase.google.com/docs/auth/admin/verify-id-tokens)

Myriad stores the Google subject, display name, and session data. It does not store Firebase or Google tokens, or email addresses. Myriad sessions use a 24-hour HttpOnly cookie, with a session hash stored in the database. The display name does not affect account identity or existing permissions. Deployers manage user data in the Firebase project separately.

To disable Google sign-in, clear either `FIREBASE_PROJECT_ID` or `FIREBASE_API_KEY` in the Worker configuration and redeploy. The sign-in button disappears, and new Google sign-in requests are rejected.

Existing Myriad sessions remain valid until logout or their 24-hour expiry. Personal CLI credentials and account permissions are not revoked. Disabling or deleting a Firebase user, or revoking Firebase tokens, does not automatically clear Myriad sessions or CLI credentials that have already been issued. Revoke Myriad permissions or CLI credentials separately.

Automated tests use isolated Firebase REST responses and signing keys to verify the protocol and identity isolation. They do not verify your Firebase or Google Cloud configuration. Before opening the service to users, check the following with a real Google account:

1. The Google button appears only when all required settings are present. Deployments that use only NYCU keep their existing sign-in options.
2. Both successful sign-in and cancelled authorization return to the correct origin and original page. The session survives a refresh and is cleared on logout. The corresponding test user appears in Firebase Authentication.
3. Account information shows the correct Google subject. Google, NYCU, and guest accounts with matching names do not share drafts, submissions, or permissions.
4. A Google platform administrator can grant creation permission. Exam authors can create CLI credentials, publish a test exam, and invite co-managers. Ordinary signed-in users do not have these permissions.
5. Once Google is disabled, new Google sign-ins are rejected and other enabled providers still work.
