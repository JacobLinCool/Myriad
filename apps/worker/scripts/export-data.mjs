#!/usr/bin/env node
// Exports everything an exam analysis needs for any time range, read-only:
// D1 rows, Cloudflare per-minute load and query statistics, and PostHog events.
//
//   node scripts/export-data.mjs --from "YYYY-MM-DD HH:MM" --to "YYYY-MM-DD HH:MM" [--config FILE] [--exam ID]... [--out DIR] [--skip posthog,cloudflare,d1]
//
// Times without an offset are Taipei time. Cloudflare access requires
// CLOUDFLARE_API_TOKEN. PostHog requires POSTHOG_PERSONAL_API_KEY
// (scope: query:read) and POSTHOG_PROJECT_ID; POSTHOG_HOST defaults to
// the US API host. The output holds student IDs,
// source code and IP addresses: keep it private.
import {
  readFileSync,
  mkdirSync,
  createWriteStream,
  writeFileSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    exam: { type: "string", multiple: true, default: [] },
    out: { type: "string" },
    skip: { type: "string", default: "" },
    config: { type: "string" },
  },
});
if (!args.from || !args.to) {
  console.error(
    'Usage: export-data.mjs --from "YYYY-MM-DD HH:MM" --to "YYYY-MM-DD HH:MM" [--config FILE] [--exam ID]... [--out DIR] [--skip posthog,cloudflare,d1]',
  );
  process.exit(1);
}
/** A time without an offset is read as Taipei time. */
function instant(text) {
  const iso = text.trim().replace(" ", "T");
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}+08:00`);
  if (Number.isNaN(t)) throw new Error(`Cannot read time: ${text}`);
  return t;
}
const from = instant(args.from),
  to = instant(args.to);
if (to <= from) throw new Error("--to must be after --from");
const exams = args.exam;
const skip = new Set(args.skip.split(",").filter(Boolean));
for (const source of skip)
  if (!["d1", "cloudflare", "posthog"].includes(source))
    throw new Error(`Unknown source in --skip: ${source}`);
const stamp = (t) =>
  new Date(t + 8 * 3600_000)
    .toISOString()
    .slice(0, 16)
    .replace(/[-:]/g, "")
    .replace("T", "-");
const out = resolve(
  args.out ??
    join(
      here,
      "..",
      "..",
      "..",
      "exports",
      `${stamp(from)}_${stamp(to)}${exams.length ? `_${exams.join("+")}` : ""}`,
    ),
);
// Account, database and names come from the deployed Worker's configuration.
const needsCloudflare = !skip.has("d1") || !skip.has("cloudflare");
const configPath = args.config
  ? resolve(args.config)
  : join(here, "..", "wrangler.production.jsonc");
const wrangler = needsCloudflare
  ? JSON.parse(
      readFileSync(configPath, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/,(\s*[}\]])/g, "$1"),
    )
  : {};
const account = wrangler.account_id;
const database = wrangler.d1_databases?.find(
  (item) => item.binding === "DB",
)?.database_id;
const bucket = wrangler.r2_buckets?.find(
  (item) => item.binding === "BUCKET",
)?.bucket_name;
const script = wrangler.name;
if (needsCloudflare) {
  if (!/^[a-f0-9]{32}$/i.test(account ?? ""))
    throw new Error("Set account_id in the deployment config.");
  if (
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(database ?? "") ||
    database === "00000000-0000-0000-0000-000000000000"
  )
    throw new Error("Set the DB database_id in the deployment config.");
  if (!bucket || !script)
    throw new Error(
      "Set the Worker name and BUCKET bucket_name in the deployment config.",
    );
  if (!process.env.CLOUDFLARE_API_TOKEN)
    throw new Error(
      "Set CLOUDFLARE_API_TOKEN with read access to the exported resources.",
    );
}
mkdirSync(out, { recursive: true, mode: 0o700 });

const files = {};
function writer(name) {
  const path = join(out, name);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const stream = createWriteStream(path, { mode: 0o600 });
  files[name] = 0;
  return {
    write(row) {
      stream.write(`${JSON.stringify(row)}\n`);
      files[name]++;
    },
    close: () => new Promise((done) => stream.end(done)),
  };
}
function save(name, value) {
  const path = join(out, name);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  files[name] = Array.isArray(value) ? value.length : 1;
}

// D1, through the REST API. Only SELECT statements are ever sent.
async function d1(sql, params = []) {
  if (!/^\s*(SELECT|WITH)\b/i.test(sql)) throw new Error("Exports only read.");
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = await response.json();
  if (!body.success) throw new Error(`D1: ${JSON.stringify(body.errors)}`);
  rowsRead += body.result[0].meta?.rows_read ?? 0;
  return body.result[0].results;
}
let rowsRead = 0;
const PAGE = 500;
const examFilter = (column) =>
  exams.length ? ` AND ${column} IN (SELECT value FROM json_each(?))` : "";
const examParams = exams.length ? [JSON.stringify(exams)] : [];
const json = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

async function exportD1() {
  // Submissions, by sequence; each page's claims and semantic checks follow it.
  const attempts = writer("d1/attempts.jsonl"),
    claims = writer("d1/attempt_claims.jsonl"),
    semantic = writer("d1/semantic_checks.jsonl");
  const touched = new Set(exams);
  for (let after = 0; ;) {
    const page = await d1(
      `SELECT * FROM attempts WHERE sequence>? AND created_at>=? AND created_at<?${examFilter("exam_id")} ORDER BY sequence LIMIT ${PAGE}`,
      [after, from, to, ...examParams],
    );
    if (!page.length) break;
    after = page.at(-1).sequence;
    const ids = JSON.stringify(page.map((a) => a.id));
    for (const a of page) {
      attempts.write({ ...a, result: json(a.result) });
      touched.add(a.exam_id);
    }
    for (const c of await d1(
      "SELECT * FROM attempt_claims WHERE attempt_id IN (SELECT value FROM json_each(?)) ORDER BY attempt_id,idx",
      [ids],
    ))
      claims.write({ ...c, claim: json(c.claim), verdict: json(c.verdict) });
    for (const s of await d1(
      "SELECT * FROM semantic_checks WHERE attempt_id IN (SELECT value FROM json_each(?))",
      [ids],
    ))
      semantic.write({ ...s, result: json(s.result) });
    process.stdout.write(`\r  attempts ${files["d1/attempts.jsonl"]}`);
  }
  console.log();
  await Promise.all([attempts.close(), claims.close(), semantic.close()]);

  const telemetry = writer("d1/browser_telemetry.jsonl");
  for (let after = 0; ;) {
    const page = await d1(
      `SELECT * FROM browser_telemetry WHERE sequence>? AND received_at>=? AND received_at<?${examFilter("exam_id")} ORDER BY sequence LIMIT ${PAGE * 4}`,
      [after, from, to, ...examParams],
    );
    if (!page.length) break;
    after = page.at(-1).sequence;
    for (const t of page) {
      telemetry.write({ ...t, event: json(t.event) });
      touched.add(t.exam_id);
    }
    process.stdout.write(
      `\r  browser_telemetry ${files["d1/browser_telemetry.jsonl"]}`,
    );
  }
  console.log();
  await telemetry.close();

  // Settings of every exam the range touched, and their verification reports.
  const ids = JSON.stringify([...touched]);
  save(
    "d1/exam_catalog.json",
    (
      await d1(
        "SELECT * FROM exam_catalog WHERE id IN (SELECT value FROM json_each(?))",
        [ids],
      )
    ).map((e) => ({ ...e, manifest: json(e.manifest) })),
  );
  save(
    "d1/result_reports.json",
    (
      await d1(
        "SELECT * FROM result_reports WHERE exam_id IN (SELECT value FROM json_each(?)) ORDER BY uploaded_at",
        [ids],
      )
    ).map((r) => ({ ...r, report: json(r.report), scores: json(r.scores) })),
  );
}

// Cloudflare Analytics. Per-minute rows stay under the API's 10,000-row limit
// for ranges up to about a week; query statistics keep the busiest queries.
async function graphql(query) {
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const body = await response.json();
  if (body.errors?.length)
    throw new Error(`Cloudflare Analytics: ${JSON.stringify(body.errors)}`);
  return body.data.viewer.accounts[0];
}
async function exportCloudflare() {
  const range = `datetime_geq: "${new Date(from).toISOString()}", datetime_lt: "${new Date(to).toISOString()}"`;
  const minutes = Math.ceil((to - from) / 60_000);
  if (minutes > 10_000)
    console.warn(
      "  Range is over 10,000 minutes; per-minute series are truncated.",
    );
  const a =
    await graphql(`{ viewer { accounts(filter: {accountTag: "${account}"}) {
    worker: workersInvocationsAdaptive(limit: 10000, orderBy: [datetimeMinute_ASC], filter: {scriptName: "${script}", ${range}}) {
      dimensions { datetimeMinute status } sum { requests errors subrequests cpuTimeUs wallTime responseBodySize }
      quantiles { cpuTimeP50 cpuTimeP90 cpuTimeP99 wallTimeP50 wallTimeP99 }
    }
    d1: d1AnalyticsAdaptiveGroups(limit: 10000, orderBy: [datetimeMinute_ASC], filter: {databaseId: "${database}", ${range}}) {
      dimensions { datetimeMinute } sum { readQueries writeQueries rowsRead rowsWritten queryBatchResponseBytes }
    }
    d1Time: d1QueriesAdaptiveGroups(limit: 10000, orderBy: [datetimeMinute_ASC], filter: {databaseId: "${database}", ${range}}) {
      dimensions { datetimeMinute } count sum { queryDurationMs rowsRead rowsWritten }
    }
    byDuration: d1QueriesAdaptiveGroups(limit: 200, orderBy: [sum_queryDurationMs_DESC], filter: {databaseId: "${database}", ${range}}) {
      dimensions { query } count sum { queryDurationMs rowsRead rowsWritten }
    }
    byRows: d1QueriesAdaptiveGroups(limit: 200, orderBy: [sum_rowsRead_DESC], filter: {databaseId: "${database}", ${range}}) {
      dimensions { query } count sum { queryDurationMs rowsRead rowsWritten }
    }
    r2: r2OperationsAdaptiveGroups(limit: 10000, orderBy: [datetimeMinute_ASC], filter: {bucketName: "${bucket}", ${range}}) {
      dimensions { datetimeMinute actionType } sum { requests responseObjectSize }
    }
  } } }`);
  save("cloudflare/worker_minutes.json", a.worker);
  save("cloudflare/d1_minutes.json", a.d1);
  save("cloudflare/d1_query_time_minutes.json", a.d1Time);
  const queries = new Map();
  for (const q of [...a.byDuration, ...a.byRows])
    queries.set(q.dimensions.query, q);
  save(
    "cloudflare/d1_queries.json",
    [...queries.values()].sort(
      (x, y) => y.sum.queryDurationMs - x.sum.queryDurationMs,
    ),
  );
  save("cloudflare/r2_minutes.json", a.r2);
}

// PostHog events through HogQL, oldest first.
async function exportPostHog() {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key)
    throw new Error(
      "Set POSTHOG_PERSONAL_API_KEY (scope query:read), or use --skip posthog.",
    );
  const host = process.env.POSTHOG_HOST ?? "https://us.posthog.com";
  if (new URL(host).protocol !== "https:")
    throw new Error("POSTHOG_HOST must use HTTPS.");
  const project = process.env.POSTHOG_PROJECT_ID;
  if (!/^\d+$/.test(project ?? ""))
    throw new Error("Set POSTHOG_PROJECT_ID to your PostHog project ID.");
  const events = writer("posthog/events.jsonl");
  const iso = (t) => new Date(t).toISOString().replace("T", " ").slice(0, 23);
  const examClause = exams.length
    ? ` AND properties.exam_id IN (${exams.map((e) => `'${e.replace(/'/g, "''")}'`).join(",")})`
    : "";
  for (let offset = 0; ; offset += 10_000) {
    const response = await fetch(`${host}/api/projects/${project}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: `SELECT uuid, event, timestamp, distinct_id, properties FROM events WHERE timestamp >= toDateTime64('${iso(from)}', 3, 'UTC') AND timestamp < toDateTime64('${iso(to)}', 3, 'UTC')${examClause} ORDER BY timestamp, uuid LIMIT 10000 OFFSET ${offset}`,
        },
      }),
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(
        `PostHog: ${response.status} ${JSON.stringify(body).slice(0, 300)}`,
      );
    for (const [
      uuid,
      event,
      timestamp,
      distinct_id,
      properties,
    ] of body.results)
      events.write({
        uuid,
        event,
        timestamp,
        distinct_id,
        properties: json(properties),
      });
    process.stdout.write(`\r  events ${files["posthog/events.jsonl"]}`);
    if (body.results.length < 10_000) break;
  }
  console.log();
  await events.close();
}

const cfToken = process.env.CLOUDFLARE_API_TOKEN;
const sources = {
  d1: exportD1,
  cloudflare: exportCloudflare,
  posthog: exportPostHog,
};
const failures = {};
for (const [name, run] of Object.entries(sources)) {
  if (skip.has(name)) continue;
  console.log(`${name}…`);
  try {
    await run();
  } catch (error) {
    failures[name] = String(error.message ?? error);
    console.error(`  Failed: ${failures[name]}`);
  }
}
let commit = null;
try {
  commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: here })
    .toString()
    .trim();
} catch {}
save("manifest.json", {
  from: new Date(from).toISOString(),
  to: new Date(to).toISOString(),
  exams,
  exportedAt: new Date().toISOString(),
  commit,
  account,
  database,
  script,
  bucket,
  d1RowsRead: rowsRead,
  files,
  failures,
  note: "Contains student IDs, source code and IP addresses. Keep private; publish only aggregates.",
});
console.log(`Wrote ${out}`);
if (Object.keys(failures).length) process.exitCode = 1;
