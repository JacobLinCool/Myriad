import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDirectory = path.dirname(
  fileURLToPath(import.meta.resolve("@wasm-oj/server/package.json")),
);
const runtimeDirectory = path.join(serverDirectory, "crates/runtime-core");
const result = spawnSync(
  "cargo",
  [
    "build",
    "--locked",
    "--manifest-path",
    path.join(runtimeDirectory, "Cargo.toml"),
    "--target-dir",
    path.join(runtimeDirectory, "target"),
    "--release",
    "--bins",
  ],
  { cwd: serverDirectory, stdio: "inherit" },
);

if (result.error) {
  console.error(`Unable to start Cargo: ${result.error.message}`);
  process.exitCode = 1;
} else if (result.signal) {
  console.error(`Runtime build terminated by ${result.signal}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
