import { afterEach, beforeEach, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../scripts/build-runtime.mjs", import.meta.url),
);
const serverDirectory = path.dirname(
  createRequire(import.meta.url).resolve("@wasm-oj/server/package.json"),
);
let bin: string;
beforeEach(async () => {
  bin = await fs.mkdtemp(path.join(os.tmpdir(), "myriad runtime tools "));
});
afterEach(async () => {
  await fs.rm(bin, { recursive: true, force: true });
});

function run() {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, PATH: bin },
  });
}
async function cargo(body: string) {
  await fs.writeFile(path.join(bin, "cargo"), `#!/bin/sh\n${body}\n`, {
    mode: 0o755,
  });
}

it("builds the installed runtime using its pinned toolchain and expected output directory", async () => {
  await cargo('printf "%s\\n" "$PWD" "$@"');
  const result = run();
  expect(result.status).toBe(0);
  expect(result.stdout.trim().split("\n")).toEqual([
    serverDirectory,
    "build",
    "--locked",
    "--manifest-path",
    path.join(serverDirectory, "crates/runtime-core/Cargo.toml"),
    "--target-dir",
    path.join(serverDirectory, "crates/runtime-core/target"),
    "--release",
    "--bins",
  ]);
});

it("preserves Cargo failure exit codes", async () => {
  await cargo("exit 7");
  expect(run().status).toBe(7);
});

it("reports a missing Cargo executable", () => {
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Unable to start Cargo:");
  expect(result.stderr).toContain("ENOENT");
});

it("reports Cargo termination by a signal", async () => {
  await cargo("kill -TERM $$");
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Runtime build terminated by SIGTERM");
});
