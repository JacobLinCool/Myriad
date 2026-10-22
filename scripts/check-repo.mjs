import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const staged = new Set(
  execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean),
);

// .gitignore does not protect files already tracked or added with --force.
const privatePaths = [
  /(^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/,
  /(^|\/)(?:node_modules|dist|coverage|\.wrangler|\.myriad|\.lj|\.wasm-oj-cache|exports|report|\.deployment-backups|\.impeccable|\.claude|\.codex|\.agents|\.playwright-mcp)(?:\/|$)/,
  /\.shadow\.md$/,
  /(?:\.pem|\.key|\.sqlite(?:-.*)?|\.db(?:-.*)?)$/,
  /(^|\/)wrangler\.production\.jsonc$/,
  /(^|\/)(?:\.DS_Store|Thumbs\.db)$/,
];

const violations = [...new Set(files)].filter((file) => {
  // A staged copy can still be committed after its working file is removed.
  // Plain worktree deletions remain allowed so tracked private files can be removed.
  if (!staged.has(file) && !existsSync(join(root, file))) return false;
  if (/(^|\/)(?:\.env|\.dev\.vars)\.example$/.test(file)) return false;
  return privatePaths.some((pattern) => pattern.test(file));
});

if (violations.length) {
  console.error(
    "Private or generated files must stay outside the public source tree:",
  );
  for (const file of violations) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log("Repository file hygiene passed.");
}
