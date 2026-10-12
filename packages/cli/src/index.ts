import { Command } from "commander";
import * as workflow from "./workflow.js";
const jsonMode = process.argv.includes("--json");
const program = new Command()
  .exitOverride()
  .configureOutput({
    writeErr: (text) => {
      if (!jsonMode) process.stderr.write(text);
    },
  })
  .name("myriad")
  .version("0.2.0")
  .description(
    "Myriad: local exam authoring, validation and publication for teachers and agents",
  )
  .option("--json", "Emit a single JSON result")
  .option(
    "--non-interactive",
    "Never prompt (all commands are non-interactive)",
  );
function action(fn: (...args: any[]) => Promise<unknown>) {
  return async (...args: any[]) => {
    try {
      const data = await fn(...args);
      console.log(
        program.opts().json
          ? JSON.stringify({ ok: true, data })
          : JSON.stringify(data, null, 2),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        program.opts().json
          ? JSON.stringify({ ok: false, error: { message } })
          : message,
      );
      process.exitCode = 1;
    }
  };
}
function remote(command: Command) {
  return command
    .requiredOption("--remote <url>", "Worker URL")
    .option("--token-file <file>", "File containing the credential");
}
program.command("init <dir>").action(action(workflow.initialize));
program.command("build <dir>").action(action(workflow.build));
program.command("test <dir> <problem> <solution>").action(
  action(async (dir, pid, file) => {
    const result = await workflow.testSolution(dir, pid, file);
    if (result.score !== 1) process.exitCode = 1;
    return result;
  }),
);
remote(program.command("deploy <dir>")).action(action(workflow.deploy));
remote(program.command("pull <dir>")).action(action(workflow.pull));
program
  .command("export <dir>")
  .description(
    "Recreate an editable exam directory from the site, or from a downloaded export file",
  )
  .option("--exam <id>", "Exam ID to export from --remote")
  .option("--remote <url>", "Worker URL")
  .option("--token-file <file>", "File containing the credential")
  .option("--file <path>", "Export file downloaded from the teacher workspace")
  .option("--force", "Replace exam.json and problems/ in a non-empty directory")
  .action(action(workflow.exportExam));
program.command("verify <dir>").action(action(workflow.verify));
remote(program.command("status").requiredOption("--exam <id>")).action(
  action(async (o) => ({
    ...(await workflow.request(o, `/api/teacher/exams/${o.exam}`)),
    analysis: await workflow.request(
      o,
      `/api/teacher/exams/${o.exam}/analysis`,
    ),
  })),
);
remote(program.command("toolchain").command("push")).action(
  action(workflow.pushToolchain),
);
const results = program.command("results");
remote(results.command("upload <dir>")).action(action(workflow.uploadResults));
const permissions = program.command("permissions");
remote(permissions.command("list")).action(
  action((o) =>
    workflow.request(o, "/api/admin/creation-grants", "GET", undefined, true),
  ),
);
remote(
  permissions
    .command("grant")
    .requiredOption("--provider <provider>")
    .requiredOption("--subject <subject>"),
).action(
  action((o) =>
    workflow.request(
      o,
      "/api/admin/creation-grants",
      "POST",
      { provider: o.provider, subject: o.subject },
      true,
    ),
  ),
);
remote(permissions.command("revoke <account>")).action(
  action((id, o) =>
    workflow.request(
      o,
      `/api/admin/creation-grants/${encodeURIComponent(id)}`,
      "DELETE",
      undefined,
      true,
    ),
  ),
);
const members = program.command("members");
remote(members.command("list").requiredOption("--exam <id>")).action(
  action((o) =>
    workflow.request(
      o,
      `/api/teacher/exams/${encodeURIComponent(o.exam)}/members`,
    ),
  ),
);
remote(
  members
    .command("invite")
    .requiredOption("--exam <id>")
    .requiredOption("--provider <provider>")
    .requiredOption("--subject <subject>"),
).action(
  action((o) =>
    workflow.request(
      o,
      `/api/teacher/exams/${encodeURIComponent(o.exam)}/members`,
      "POST",
      { provider: o.provider, subject: o.subject },
    ),
  ),
);
remote(
  members.command("remove <account>").requiredOption("--exam <id>"),
).action(
  action((id, o) =>
    workflow.request(
      o,
      `/api/teacher/exams/${encodeURIComponent(o.exam)}/members/${encodeURIComponent(id)}`,
      "DELETE",
    ),
  ),
);
remote(program.command("stage <dir>")).action(action(workflow.stage));
remote(
  program
    .command("publish")
    .requiredOption("--exam <id>")
    .requiredOption("--revision <digest>")
    .requiredOption("--expected-revision <digest-or-none>"),
).action(
  action((o) =>
    workflow.request(
      o,
      `/api/teacher/exams/${encodeURIComponent(o.exam)}/revisions/${encodeURIComponent(o.revision)}/publish`,
      "POST",
      {
        expectedRevision:
          o.expectedRevision === "none" ? null : o.expectedRevision,
      },
    ),
  ),
);
export { program };
