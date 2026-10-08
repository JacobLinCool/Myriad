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
const teachers = program.command("teachers");
remote(teachers.command("create").requiredOption("--name <name>")).action(
  action((o) =>
    workflow.request(o, "/api/admin/teachers", "POST", { name: o.name }, true),
  ),
);
remote(teachers.command("revoke <id>")).action(
  action((id, o) =>
    workflow.request(o, `/api/admin/teachers/${id}`, "DELETE", undefined, true),
  ),
);
const legacy = program.command("legacy");
remote(legacy.command("list")).action(
  action((o) =>
    workflow.request(o, "/api/admin/legacy", "GET", undefined, true),
  ),
);
remote(legacy.command("assign <exam>").requiredOption("--teacher <id>")).action(
  action((eid, o) =>
    workflow.request(
      o,
      `/api/admin/legacy/${eid}/owner`,
      "POST",
      { teacherId: o.teacher },
      true,
    ),
  ),
);
remote(legacy.command("export <exam>")).action(
  action(async (eid, o) => {
    let after = 0;
    const submissions = [];
    for (;;) {
      const p = await workflow.request(
        o,
        `/api/teacher/legacy/${eid}?after=${after}`,
      );
      submissions.push(...p.submissions);
      if (!p.hasMore) break;
      after = p.nextCursor;
    }
    return { submissions };
  }),
);
export { program };
