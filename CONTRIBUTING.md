# Contributing

Myriad is a TypeScript monorepo for browser-based C programming exams. The product and operator documentation use Traditional Chinese; code identifiers and contributor documentation use English.

## Local setup

Use Node.js 24.18.0 or later within the 24.x release line and pnpm 12.4.2. Follow the [README](README.md) to install dependencies, build the workspace, configure local secrets and apply local D1 migrations. Cloudflare credentials, NYCU OAuth credentials, Firebase projects, OpenAI and PostHog are not needed for the automated test suite.

The Worker serves the built frontend and API at `http://localhost:8787` by default. `pnpm dev:web` provides Vite's development server with an API proxy; use the Worker origin to verify OAuth and authenticated browser writes. CLI execution of actual C programs requires the native runtime described in the README.

## Making changes

- Keep changes focused on one behavior. Explain the problem, resulting behavior and relevant validation in the pull request.
- Update shared schemas and all affected callers together when changing a contract. Compatibility layers need an explicit use case; remove obsolete paths instead of keeping unverified fallbacks.
- Keep exam authorization and timing checks on the server. Treat guest identifiers, claims, telemetry and performance measurements as untrusted input.
- Test behavior at its owning boundary. Worker integration tests use real local D1/R2; changes to transactions, permissions or submission retries should preserve that coverage.
- Use synthetic identities, submissions and fixtures. Never include real student data, unpublished exam content, tokens or deployment exports in issues, tests or pull requests.
- Update the corresponding operator or architecture documentation when changing setup, permissions, data collection or public behavior.

See [system architecture](docs/architecture.md) and [frontend architecture](apps/web/ARCHITECTURE.md) for ownership boundaries. The [administrator workflow](docs/agent-workflow.md) describes the CLI contract and end-to-end acceptance flow.

## Validation

From the repository root:

```sh
pnpm check
pnpm --filter=@myriad/worker exec wrangler deploy --dry-run
```

`pnpm check` runs the build, type checks, tests, formatting check and repository checks. Formatting commands cover the repository's maintained source and documentation. Use `pnpm format` to apply formatting before reviewing the diff.

For focused iteration, use package scripts such as:

```sh
pnpm --filter=@myriad/web test
pnpm --filter=@myriad/worker test
pnpm --filter=@myriad/shared test
pnpm --filter=@myriad/cli test
```

Build the shared package before running focused checks in a fresh checkout. Worker tests open local sockets; a restricted sandbox may need permission to run workerd. CLI unit tests do not replace a real native-runtime build, and automated OAuth tests do not establish that a live provider registration works. Document any manual checks and untested dependencies in the pull request.

## Reporting problems

For ordinary bugs, include the commit, runtime versions, a minimal synthetic reproduction and expected versus observed behavior. Remove credentials and personal data from logs and screenshots. Report vulnerabilities using [SECURITY.md](SECURITY.md), rather than a public issue containing exploit details.

Before publishing a fork or release, inspect the files and the full Git history for credentials, personal data, deployment identifiers, screenshots and private exports. `check:repo` checks tracked file paths; it does not scan file contents or Git history for secrets. Removing a file from the latest commit does not remove earlier copies. If a credential was exposed, revoke or rotate it and coordinate any required history cleanup before publication. Check `.gitignore` and the actual staged diff before pushing.

Contributions are provided under the repository's [MIT license](LICENSE). Only submit code, text, fixtures and assets you have the right to contribute.

Preserve the licenses and notices described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) when changing bundled runtime or toolchain assets.
