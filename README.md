# Myriad

> Reimagining programming exams and real-time online judging.

Myriad is a self-hosted C programming exam platform. Students compile and run their code in the browser with WASM-OJ. A Cloudflare Worker stores submissions and compares output checksums. Exam managers prepare problems, check reference solutions, and rejudge submissions locally. The server does not compile or run student code.

The frontend uses Svelte 5 and CodeMirror, with a Traditional Chinese interface. The backend runs on Cloudflare Workers, D1, and R2. This monorepo contains the frontend, backend, CLI, and shared data contracts, under the [MIT license](LICENSE). See [Third-party notices](THIRD_PARTY_NOTICES.md) for the licenses of dependencies and bundled toolchains.

## Introduction video

[Watch the Myriad introduction on YouTube](https://youtu.be/X6Rs7pJLypU)

## Why judge in the browser?

Myriad is intended for supervised programming exams with two assumptions: a controlled environment and a fixed time limit. Students can access the exam service, but cannot freely browse the internet, use phones, communicate with others, or consult AI tools such as ChatGPT. They have to rely on their own reasoning and the code they write. The institution enforces these conditions; Myriad does not provide network lockdown or proctoring.

Under these assumptions, access to the test inputs need not provide a useful shortcut. Exam authors should choose test sets large and varied enough that working out all the answers by hand is impractical within the time limit. A student who can reason through that data may already have much of the understanding needed to write a solution. Deriving the individual answers can also take longer. Our working assumption is that understanding the problem and writing a general solution is a better use of the available time than trying to extract answers from the test data.

We see browser judging as a practical fit for this setting. Students can compile and test their code locally, and the server does not need to execute their programs. This choice depends on the exam environment, the time limit, and the problems chosen. It does not make client-reported verdicts trustworthy. Exam managers still need to rejudge the submitted code locally to verify grades.

## Features and limits

- Run multiple exams with test-group scoring, starter code, manager previews, and collaborators assigned to individual exams.
- Students can sign in with NYCU or Google if enabled, or use a guest identifier. Guest identities are not verified. Anyone who knows a guest's identifier can view that guest's submission summaries while the exam is open. Summaries do not include source code.
- Live verdicts depend on what the client reports. A checksum does not prove that the code was run. To verify grades, exam managers download submissions, rerun them locally, and review any differences.
- Test data is sent to students' browsers while an exam is open and cannot be kept secret. The API blocks new access after the deadline, but data already downloaded cannot be recalled.
- You can enable OpenAI checks for specific implementation requirements. Doing so sends student code for that problem to OpenAI. Exam managers still need to review the model's judgments.

See the [architecture guide](docs/architecture.md) and [security policy](SECURITY.md) for data flows, stored data, and trust boundaries.

## Install and run locally

Use **Node.js 24.x, version 24.18.0 or later**, and **pnpm 12.4.2**. Browsers must support WebAssembly, Web Workers, SharedArrayBuffer, and cross-origin isolation. Use `localhost` for local development and HTTPS in production.

From the repository root, run:

```sh
pnpm install --frozen-lockfile
pnpm build
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

Edit `.dev.vars` and set `ADMIN_TOKEN` and `ATTEMPT_SECRET` to two different, high-entropy random values. `ATTEMPT_SECRET` must be at least 32 characters long. Run this command twice to generate one value for each:

```sh
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Keep `APP_ORIGIN=http://localhost:8787`. Leave unused OAuth credentials, OpenAI keys, and the PostHog key empty, then initialize the local database and start the app:

```sh
pnpm --filter=@myriad/worker exec wrangler d1 migrations apply DB --local
pnpm dev:worker
```

Open [localhost:8787](http://localhost:8787). Wrangler serves both the API and the built frontend. The exam list is empty on first launch. Local D1 and R2 data is stored in the Git-ignored `.wrangler/` directory; these commands do not create cloud resources.

After changing the frontend, run `pnpm --filter=@myriad/web build` again and refresh the page. For live updates, keep the Worker running, run `pnpm dev:web` in another terminal, and open [localhost:5173](http://localhost:5173). Test OAuth and cookie-authenticated management actions at the Worker's `APP_ORIGIN` URL. The Vite proxy does not make the two URLs share an origin.

NYCU and Google sign-in can be enabled independently. NYCU uses `NYCU_CLIENT_ID` and `NYCU_CLIENT_SECRET`. Google uses Firebase Authentication, configured with `FIREBASE_PROJECT_ID` and `FIREBASE_API_KEY`. Both use `APP_ORIGIN`. A provider's sign-in button appears only when its settings are present. Existing NYCU deployments can leave the Firebase settings empty.

You can start the site and run automated tests without OAuth. To create and publish exams in a fresh installation, first configure [NYCU sign-in](docs/nycu-oauth.md) or [Google sign-in](docs/google-oauth.md), then obtain exam-creation permission and a personal CLI credential.

## Create your first exam

The CLI commands `build`, `test`, and `verify` use a pinned version of the WASM-OJ native runtime. You need Rust/Cargo and local C/C++ build tools. Build the runtime first:

```sh
pnpm --filter=@myriad/cli runtime:build
```

The build uses the Rust toolchain specified by the dependency. You can also set `MYRIAD_RUNTIME_DIRECTORY` to a directory containing `wasm-oj-compiler` and `wasm-oj-runner` binaries for the same pinned WASM-OJ version. A missing runtime produces an error. The frontend build and ordinary unit tests do not need these executables.

1. Set `ADMIN_IDENTITIES` in `.dev.vars` to your verified account, for example `[{"provider":"nycu","subject":"your-username"}]`. For Google, use `provider: "google"` and the Google subject shown in Myriad's account information, not an email address or Firebase UID. Restart the Worker.
2. Open `/teacher` and sign in with your configured provider. On the account and permissions page, grant exam-creation permission to yourself or another author. Being a platform administrator does not itself grant permission to create exams.
3. On the same page, authors can generate their own personal CLI credential. Store it in `MYRIAD_TEACHER_TOKEN`, or use `--token-file` to point to a protected credential file.
4. As a platform administrator, use `MYRIAD_ADMIN_TOKEN` (which corresponds to the Worker's `ADMIN_TOKEN`) to upload the shared toolchain:

```sh
node packages/cli/bin/myriad.js --json toolchain push --remote http://localhost:8787
```

Then run the authoring workflow from the repository root. This example keeps the exam outside the repository so that real exam problems stay out of the public source tree:

```sh
node packages/cli/bin/myriad.js --json init ../my-exam
node packages/cli/bin/myriad.js --json build ../my-exam
node packages/cli/bin/myriad.js --json test ../my-exam aplusb ../my-exam/problems/aplusb/solution.c
node packages/cli/bin/myriad.js --json deploy ../my-exam --remote http://localhost:8787
```

By default, `init` schedules the exam to start one day later. Before publishing, edit the times, title, and description in `exam.json`, then run `build` again. Managers can preview what students will see before the exam starts. Preview submissions are excluded from student records and rejudging.

Each `deploy` overwrites the current exam version, including times and descriptions edited on the website. You can republish during an exam; each submission keeps the version it started judging against. See the [Manager and agent guide](docs/agent-workflow.md) for all commands, collaboration permissions, exports, and the post-exam `pull → verify → results upload` workflow.

## Development and checks

```sh
pnpm check
pnpm --filter=@myriad/worker exec wrangler deploy --dry-run
```

`pnpm check` runs builds, type checks, tests, formatting checks, and repository checks. Worker tests use local workerd, D1, and R2, and need permission to open local sockets. CLI tests do not cover the full native runtime workflow. Before going live, also follow the browser and local rejudging steps in the manager guide.

`--dry-run` checks Worker packaging only. It does not deploy or verify that production resources and OAuth work.

| Path                                 | Purpose                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [`apps/web`](apps/web)               | Svelte student interface and management dashboard; [frontend architecture](apps/web/ARCHITECTURE.md) |
| [`apps/worker`](apps/worker)         | API, identity and permissions, D1 migrations, and R2 access                                          |
| [`packages/shared`](packages/shared) | Data contracts, checksums, scoring, and telemetry formats                                            |
| [`packages/cli`](packages/cli)       | Build and publish exams; export and locally rejudge submissions                                      |
| [`examples`](examples)               | Public sample problems; update exam times and identifiers before use                                 |
| [`docs`](docs)                       | Deployment, architecture, and management guides                                                      |

Use your own Cloudflare, OAuth, and optional service settings for production. Follow the [deployment guide](docs/deployment.md). See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute and [SECURITY.md](SECURITY.md) to report vulnerabilities.
