#!/usr/bin/env node
import { program } from "../dist/index.js";

program.parseAsync(process.argv).catch((error) => {
  const exitCode = typeof error.exitCode === "number" ? error.exitCode : 1;
  if (exitCode && process.argv.includes("--json")) {
    console.error(
      JSON.stringify({
        ok: false,
        error: { code: error.code ?? "command_failed", message: error.message },
      }),
    );
  } else if (exitCode && !error.code?.startsWith("commander.")) {
    console.error(error.message);
  }
  process.exitCode = exitCode;
});
