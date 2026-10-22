# Local workflow for exam managers and agents

Build problems, run reference solutions, and rejudge submissions on the exam manager's device. The remote service stores uploaded bundles, the active revision, student source snapshots, checksum claims, and rejudging reports. Exam managers are responsible for backing up and versioning their local problem source files.

First, complete [Install and run locally](../README.md#install-and-run-locally), then run `pnpm --filter=@myriad/cli runtime:build` to prepare the native runtime. For a new environment, see [NYCU sign-in](nycu-oauth.md) or [Google sign-in](google-oauth.md) to set up manager accounts, exam creation permission, and CLI credentials. Run this guide's commands from the repository root. Keep the exam directory next to the repository at `../midterm` so real exam content stays out of the public repository.

## The full cycle

1. A platform administrator grants exam creation permission to a `(provider, subject)` identity with `permissions grant`. The teaching assistant signs in to the management dashboard and creates a personal CLI credential under Account and permissions.
2. The exam manager and agent prepare problems locally: `init` → edit → `build` → `test`.
3. `deploy` uploads the entire bundle to the server and activates it immediately. Edit and deploy again at any time, including during an exam, to replace the active revision.
4. Open `/teacher` to inspect exam information, status, and problem versions. Use Preview as a student to try solving and judging problems.
5. Edit the exam title, start and end times, instructions, and scoring policy directly in `/teacher`. Changes take effect immediately, so you can extend an exam while it is running. Edit problem content locally and upload it. If you do not have the local problem directory, use `export` to restore it from the site, then edit, `build`, and `deploy`.
6. During the exam, monitor submission statistics in `/teacher`.
7. After the exam, use `pull` to download all submissions. Use `verify` to rejudge them locally, then `results upload` to upload an internal report if needed.

Students can see only the exam instructions before the exam starts. While it is open, they can read problems and submit solutions. After it ends, they see an ended notice; problems and test inputs are no longer available.

## Command contract

Run `node packages/cli/bin/myriad.js` from the repository root. Every command supports `--json --non-interactive` and runs without interactive prompts. Success produces `{ "ok": true, "data": ... }`. Errors produce `{ "ok": false, "error": { "message": ... } }` on stderr and exit with code 1. If any test fails, `test` also exits with code 1 but still returns per-test results. Argument parsing errors include `error.code`; `--help` returns plain help text.

- For exam manager commands, set `MYRIAD_TEACHER_TOKEN` or pass `--token-file /secure/path/token` each time.
- For platform administrator commands, set `MYRIAD_ADMIN_TOKEN` or supply a file with a platform administrator credential.
- Remote commands require an explicit `--remote https://your-judge.example`.
- Keep credentials out of URLs and problem bundles. Agent logs must never print environment variables or credential file contents.

## Create, design, and validate

```sh
node packages/cli/bin/myriad.js --json init ../midterm
```

This creates:

```text
midterm/
  exam.json
  problems/aplusb/
    problem.json
    statement.md
    solution.c
    tests/01.in
```

`exam.json` contains `id`, `title`, `startsAt`, `endsAt` (Unix milliseconds), `rules`, `policy` (`best` or `last`), and an independently generated random `salt` of at least 16 characters. IDs may contain letters, digits, hyphens, and underscores, up to 64 characters. By default, `init` sets the start time to one day later. Check the time zone and both timestamps after editing.

Each `problem.json` contains `title`, `order`, `normalize`, `limits`, `groups`, and `sampleCases`. The folder name is the problem ID. `groups[].tests` explicitly lists filenames in `tests/`; other files are not inferred. A solution earns a group's points only if it passes every test in that group. Statements support Markdown and math. `solution.c` is the exam manager's reference solution.

```sh
node packages/cli/bin/myriad.js --json build ../midterm
node packages/cli/bin/myriad.js --json test ../midterm aplusb ../midterm/problems/aplusb/solution.c
```

`build` runs the reference solutions against all tests and samples, stopping immediately on failure. On success, it writes `.myriad/bundle.json` with the configuration, statements, complete inputs, test index, expected digests, pinned toolchain, and local validation report. The canonical JSON SHA-256 is its revision, identifying that upload. Historical bundles are saved at `.myriad/bundles/<revision>.json`. If a rebuild fails, there is no current bundle to deploy.

`build` also computes each problem's `version`: a SHA-256 covering the toolchain, limits, output comparison rules, subtask groups, implementation requirements, and every test input and expected output digest. Statements, titles, and samples do not affect the version, so fixing a typo does not interrupt students. Changes to test inputs, expected outputs, limits, groups, or implementation requirements produce a new version. Every submission records the problem version used for judging.

`test` runs a solution against the complete bundle. Editing source files does not change an existing bundle; rebuild when you need to update what is published. Keep the entire `.myriad/bundles` directory. Rejudging after the exam requires the versions that were actually published.

## Publish and retry

```sh
node packages/cli/bin/myriad.js --json toolchain push --remote https://your-judge.example
node packages/cli/bin/myriad.js --json deploy ../midterm --remote https://your-judge.example
node packages/cli/bin/myriad.js --json status --exam midterm --remote https://your-judge.example
```

`deploy` reads and validates the bundle without rereading the source test files. It stages the bundle, then publishes it atomically using the returned `currentRevision` as the expected revision. If someone else has published first, it returns 409; review the changes before trying again. A failure leaves the active revision intact. Retrying the same bundle reuses stored content, so an interrupted upload can safely be retried with the same revision. Toolchain files can be sent again with identical content, but different content cannot overwrite the same path.

Creating an exam requires exam creation permission. Only the owner and invited collaborators can manage an existing exam, and only the owner can add or remove collaborators. Only platform administrators can upload the shared toolchain.

You can run `deploy` at any time, including during an exam, to replace the active revision. It returns:

- `url`, `previewUrl`, and `revision`.
- `problems`, with each problem's `version` and `change` (`added`, `changed`, or `unchanged`). `removedProblems` lists removed problems.
- `overwroteSiteSettings`, listing site settings overwritten by the local `exam.json`, such as an end time extended through the dashboard. To keep the site's settings, copy them into `exam.json`, then rebuild and deploy again. Inform the exam manager of the change.

When you replace problems during an exam:

- Problems whose versions have not changed are unaffected.
- Students' pages refresh changed problems in the background. New submissions using an old version require the student to review the new problem before resubmitting. Drafts are preserved.
- Submissions already being judged finish with the version they started with. Completed submissions retain their original verdicts and are not automatically rejudged.

`status` returns exam information, status, the last upload time, problem versions, and statistics so you can check the deployment.

## Export, edit, and upload again

```sh
node packages/cli/bin/myriad.js --json export ../midterm --exam midterm --remote https://your-judge.example
```

`export` restores an editable problem directory from the site:

- `exam.json` reflects the site's current settings, so the next deployment preserves edits made through the dashboard.
- Each problem includes `problem.json`, `statement.md`, `solution.c`, and `tests/`.
- `.myriad/bundles/` contains previous uploads, so you can rejudge the exam on another computer.

Exam managers can also download the same problem package from the dashboard's Results and export tab, then unpack it with `export ../midterm --file <downloaded-file>`.

If the directory already contains an exam, add `--force`. This replaces `exam.json` and `problems/`. The command returns:

- `settingsFromSite`, listing fields taken from the site that differ from the uploaded settings.
- `missingSolutions`, listing problems without reference solutions.

`build` includes each problem's `solution.c` in the bundle. The server stores it but does not execute it or expose it to students. If `missingSolutions` is not empty, supply the missing `solution.c` files before rebuilding.

Rebuilding an exported directory produces the same problem versions as the site because the inputs, expected outputs, and limits are unchanged. The revision changes because each build records its completion time.

## Edit exam information on the site

Select an exam in `/teacher` to see its information and problem table, including version prefixes. Problem content is read-only.

Choose Edit exam information to change the title, start and end times, instructions, and scoring policy. Changes take effect as soon as you save them. Student pages refresh automatically within one minute. The next `deploy` overwrites these fields with the local `exam.json` and lists them in `overwroteSiteSettings`.

## Monitor an exam

Sign in to `/teacher` and select an exam to see submission and student ID statistics, download/compilation/execution performance, error rates, raw telemetry exports, submission snapshot exports, and multiple student IDs used on one device. Guest student IDs are self-reported. NYCU and Google accounts come from verified sessions; a Google display name is neither a student ID nor an authorization identifier. Device and performance data cannot prove that a submission is authentic. Do not treat correlations or differences as proof of cheating.

## Rejudge locally and review internal results

Keep `.myriad/bundles/`. If you deploy more than once during an exam, submissions may belong to different uploads. `pull` returns `revisions` and `missingBundles`. `verify` uses each submission's revision to select the original bundle, including its inputs, expected outputs, and salt. If a bundle is missing, `verify` lists its revision and stops.

```sh
node packages/cli/bin/myriad.js --json pull ../midterm --remote https://your-judge.example
node packages/cli/bin/myriad.js --json verify ../midterm
node packages/cli/bin/myriad.js --json results upload ../midterm --remote https://your-judge.example
```

`pull` downloads all completed submissions with a stable sequence cursor and a fixed snapshot, saving them to `.myriad/submissions.json`. For final rejudging, pull after the exam ends so submissions still in progress do not make the report stale.

`verify` recompiles and runs every program locally, checking the source SHA-256, problem version, and original inputs. It writes `report/full.json`, including `problemVersion` for each submission, per-test verdicts, and categories for differences from the live verdict. If there are no submissions, it produces an empty report without starting the executor.

`results upload` uploads the report after the exam ends. The system checks the site's current scoring policy, the complete snapshot, every source hash, each problem version, and that version's test index. It rejects incomplete, duplicate, or stale reports. The response includes the report revision, scores by student ID, and the number of differences. Only that exam's managers can view the report.

Review rejudged scores and differences in the management dashboard. `best` selects the highest score for each problem; `last` selects each problem's most recently created completed submission. Problem scores are weighted equally and averaged on a 100-point scale. Difference categories do not cause additional deductions.

There is no command to publish grades and no student results page. The student interface supports preparation before an exam and submissions during it. At the deadline, it shows an ended notice and stops serving problems, test inputs, and submission queries. Exam managers can still export submissions, analytics, and rejudging data.

## Preview as a student before the exam

Before the exam starts, sign in to `/teacher` in the same browser, select the exam, and choose Preview as a student, or open the `previewUrl` returned by `deploy`. Preview bypasses the start time: you can read problems, use samples, run code locally, and submit for judging to check subtask scoring. A preview notice stays visible at the top of the page. Choose End preview to return to the normal student view.

The server allows preview only when a request includes `preview=1` and the same browser is signed in to the dashboard as the exam owner or a collaborator. Other users are rejected even if they supply the parameter. Preview submissions are marked as preview and excluded from student submission histories, management statistics, `pull`, exports, and rejudging snapshots. They also send no browser telemetry. Preview submissions created before the exam are cleared after it starts.

## Run a full local acceptance check

1. Use a separate local D1/R2 directory, apply all migrations, and start `wrangler dev --local --persist-to <directory>`.
2. Sign in with a test manager account using an enabled NYCU or Google provider. Grant exam creation permission and create a personal CLI credential. Upload the toolchain with a platform credential, then create and deploy two exams containing the same problem ID. Run the CLI from the repository root to reuse `.wasm-oj-cache`. A full cold-start check must include building the runtime and loading the toolchain for the first time.
3. Before the exam starts, check that problems cannot be read and run the standalone environment check. Run and submit code through manager preview, then confirm that management statistics exclude preview submissions. After the exam starts, run and submit code in a browser that is not signed in to the management dashboard.
4. Switch student IDs and exams, reload deep links, and navigate back. Check that drafts, submissions, and results remain isolated. Test both desktop and mobile tabs.
5. After the exam ends, run pull, verify, and upload. Review the internal report in the dashboard. Confirm that student APIs cannot read the report or submission summaries after the exam.
6. Run `pnpm test` for additional coverage of interrupted upload recovery, retried or conflicting claims, concurrent cooldowns, deadline boundaries, manager access revocation, and empty reports.

Changing the local clock or directly updating an isolated fixture's deadline only speeds up testing. These are not product APIs and must not be used to modify a live exam.

## Exam creation permission and collaboration

`ADMIN_IDENTITIES` designates platform administrators by their verified provider accounts. Supported providers are NYCU OAuth and Google through Firebase Authentication. The deployment's `ADMIN_TOKEN` is a separate platform service credential; teaching assistants do not need it. A platform administrator can grant exam creation permission under Account and permissions in the dashboard, or with `permissions grant --provider nycu --subject USERNAME`. For Google, use `permissions grant --provider google --subject GOOGLE_SUB`. Copy the Google identifier from the account information shown by Myriad; do not use a Firebase UID, email address, or name. Use `permissions revoke ACCOUNT_ID` to revoke exam creation permission while preserving existing ownership and collaborator access.

The owner can add collaborators in the exam permissions section or with `members invite --exam EXAM_ID --provider nycu --subject USERNAME`. Collaborators can edit, publish, preview, export, and rejudge that exam. They cannot invite others, and collaboration does not grant permission to create new exams. `members list --exam EXAM_ID` lists members; `members remove ACCOUNT_ID --exam EXAM_ID` removes one. Existing sessions and API credentials are subject to the new permissions on their next request.

To invite a Google account, use `--provider google --subject GOOGLE_SUB`. Ask the invitee to sign in and provide their subject. Accounts from different providers are not merged by matching names or email addresses; grant permissions separately.

To separate review from release, first run `stage DIR` and inspect its `revision` and `currentRevision`. Then run `publish --exam EXAM_ID --revision REVISION --expected-revision CURRENT_REVISION`. For the first publication, use `none` to indicate that no active revision exists. These commands all require `--remote` and a personal credential. `deploy` combines the same two steps. Dashboard data refreshes only on user action; the management interface does not poll automatically.

## Starter code and implementation requirements

Each problem's `problem.json` supports two optional fields, both included in uploads and exports:

```json
{
  "template": "#include <stdio.h>\n\nint solve(int *values, int n) {\n    // Complete the implementation\n}\n",
  "semanticCheck": "Traverse the array with pointers. Do not use array subscripts."
}
```

`template` is used only if the problem has no existing draft. Omit it to use the default template, or set it to an empty string for a blank editor. Changing the template does not change the judging version. `semanticCheck` accepts up to 2,000 Unicode characters. Changing it changes the problem version.

Submissions with implementation requirements run browser tests and an OpenAI semantic check requested by the Worker in parallel. Both results must be saved before the submission is finalized. If the model rejects the implementation, the test results and reason are retained, but the submission scores zero. If the service fails, the results are retained so the user can retry while the submission remains valid. Exam managers can inspect the source and the model's reason. Local rejudging reruns only the tests and preserves the existing semantic verdict.

Set `OPENAI_API_KEY` before publishing problems with implementation requirements. See the [deployment guide](deployment.md#openai-implementation-checks) for configuration and the data sent to the service. Validate synthetic examples that satisfy and violate the requirements with the actual model, and have an exam manager review its judgments.
