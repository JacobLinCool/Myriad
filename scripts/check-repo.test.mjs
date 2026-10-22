import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

function repository(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "myriad-repo-check-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: path.join(directory, "empty-git-config"),
    GIT_AUTHOR_NAME: "Repository check fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.test",
    GIT_COMMITTER_NAME: "Repository check fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.test",
  };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  ]) {
    delete env[key];
  }
  const git = (...args) =>
    execFileSync("git", args, { cwd: directory, env, stdio: "pipe" });
  git("init", "--quiet");
  mkdirSync(path.join(directory, "scripts"));
  copyFileSync(
    new URL("./check-repo.mjs", import.meta.url),
    path.join(directory, "scripts/check-repo.mjs"),
  );
  const write = (file, contents = "synthetic fixture only\n") => {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), contents);
  };
  return {
    git,
    write,
    remove: (file) => rmSync(path.join(directory, file)),
    check: () =>
      spawnSync(process.execPath, ["scripts/check-repo.mjs"], {
        cwd: directory,
        env,
        encoding: "utf8",
      }),
  };
}

test("allows source, example configuration, and ignored local credentials", (t) => {
  const repo = repository(t);
  repo.write(".gitignore", ".env\n.dev.vars\n");
  repo.write(".env");
  repo.write(".dev.vars");
  repo.write("apps/web/.env.example", "VITE_POSTHOG_KEY=\n");
  repo.write("apps/worker/.dev.vars.example", "ADMIN_TOKEN=\n");
  repo.write("src/index.js", "export {};\n");
  repo.git("add", ".");
  assert.equal(repo.check().status, 0);
});

for (const file of [".env", "exports/submissions.json", "notes.shadow.md"]) {
  test(`rejects a staged ${file} after its working file is deleted`, (t) => {
    const repo = repository(t);
    repo.write(".gitignore", `${file}\n`);
    repo.write(file);
    repo.git("add", "--force", file);
    repo.remove(file);
    const result = repo.check();
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`- ${file}`));
  });
}

test("rejects a staged modification even when the working file is deleted", (t) => {
  const repo = repository(t);
  repo.write(".env", "KEY=first-fixture\n");
  repo.git("add", ".env");
  repo.git("commit", "--quiet", "-m", "Initial fixture");
  repo.write(".env", "KEY=second-fixture\n");
  repo.git("add", ".env");
  repo.remove(".env");
  assert.equal(repo.check().status, 1);
});

test("rejects private files already tracked in the repository", (t) => {
  const repo = repository(t);
  repo.write(".dev.vars");
  repo.git("add", ".dev.vars");
  repo.git("commit", "--quiet", "-m", "Initial fixture");
  assert.equal(repo.check().status, 1);
});

test("allows removing previously tracked private files", (t) => {
  const repo = repository(t);
  repo.write(".env");
  repo.git("add", ".env");
  repo.git("commit", "--quiet", "-m", "Initial fixture");
  repo.remove(".env");
  assert.equal(repo.check().status, 0);
  repo.git("add", "--update");
  assert.equal(repo.check().status, 0);
});
