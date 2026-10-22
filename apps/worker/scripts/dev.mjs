// Runs `wrangler dev` on the port of APP_ORIGIN in .dev.vars, so local OAuth
// login returns to the address the browser is actually using.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

let port = "8787";
try {
  const origin = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .match(/^APP_ORIGIN=(.+)$/m)?.[1]
    ?.trim();
  if (origin) port = new URL(origin).port || port;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const args = ["dev", "--local", "--port", port, ...process.argv.slice(2)];
console.log(`Myriad: http://localhost:${port}`);
const child = spawn("wrangler", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});
// Stopping this script stops wrangler and its runtime too.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) =>
  signal ? process.kill(process.pid, signal) : process.exit(code ?? 0),
);
