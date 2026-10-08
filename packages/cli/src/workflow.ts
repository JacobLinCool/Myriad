import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { descriptor } from "@wasm-oj/toolchain-clang";
import {
  ExamSettingsSchema,
  ProblemPublicSchema,
  BundleContentSchema,
  canonicalJson,
  sha256Hex,
  innerDigest,
  boundChecksum,
  computeGroupVerdicts,
  problemVersion,
  validateBundle,
  VerificationReportSchema,
  TOOLCHAIN,
  type BundleContent,
  type ExamBundle,
  type ExamExport,
  type ExportSubmission,
  type TestVerdict,
} from "@myriad/shared";
import { compileCode, runArtifact } from "./engine.js";
export interface RemoteOptions {
  remote: string;
  tokenFile?: string;
}
export async function request(
  options: RemoteOptions,
  route: string,
  method = "GET",
  body?: unknown,
  admin = false,
): Promise<any> {
  const credential = options.tokenFile
    ? (await fs.readFile(options.tokenFile, "utf8")).trim()
    : process.env[admin ? "MYRIAD_ADMIN_TOKEN" : "MYRIAD_TEACHER_TOKEN"];
  if (!credential)
    throw new Error(
      `Set ${admin ? "MYRIAD_ADMIN_TOKEN" : "MYRIAD_TEACHER_TOKEN"} or provide --token-file`,
    );
  const res = await fetch(new URL(route, options.remote), {
    method,
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}
export async function readBundle(dir: string) {
  return validateBundle(
    JSON.parse(await fs.readFile(path.join(dir, ".myriad/bundle.json"), "utf8")),
  );
}
async function save(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2));
  await fs.rename(temp, file);
}
export async function initialize(dir: string) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "exam.json"),
    JSON.stringify(
      {
        id: path.basename(path.resolve(dir)),
        title: "程式設計考試",
        startsAt: Date.now() + 86400000,
        endsAt: Date.now() + 90000000,
        rules: "請獨立完成作答。",
        policy: "best",
        salt: crypto.randomUUID(),
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  const p = path.join(dir, "problems/aplusb");
  await fs.mkdir(path.join(p, "tests"), { recursive: true });
  await save(path.join(p, "problem.json"), {
    title: "A + B",
    order: 0,
    normalize: "trim",
    limits: {
      instructionBudget: 50000000,
      logicalTimeLimitMs: 2000,
      memoryMb: 128,
      outputLimitBytes: 10485760,
    },
    groups: [{ name: "全部測試", tests: ["01.in"] }],
    sampleCases: [{ input: "1 2\n", output: "3\n" }],
  });
  await fs.writeFile(
    path.join(p, "statement.md"),
    "# A + B\n讀入兩個整數，輸出它們的和。\n",
  );
  await fs.writeFile(
    path.join(p, "solution.c"),
    '#include <stdio.h>\nint main(void){ long long a,b; if(scanf("%lld %lld",&a,&b)==2) printf("%lld\\n",a+b); return 0; }\n',
  );
  await fs.writeFile(path.join(p, "tests/01.in"), "1 2\n");
  return { directory: path.resolve(dir) };
}
export async function build(dir: string) {
  const current = path.join(dir, ".myriad/bundle.json");
  try {
    const previous = await readBundle(dir);
    await save(
      path.join(dir, ".myriad/bundles", `${previous.revision}.json`),
      previous,
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  await fs.rm(current, { force: true });
  const exam = ExamSettingsSchema.parse(
    JSON.parse(await fs.readFile(path.join(dir, "exam.json"), "utf8")),
  );
  const content: BundleContent = {
    format: "myriad-bundle-v3",
    toolchain: `${TOOLCHAIN.id}@${TOOLCHAIN.version}`,
    exam,
    problems: [],
    inputs: [],
    solutions: [],
    validation: { passed: true, completedAt: Date.now(), tests: 1 },
  };
  const entries = (
    await fs.readdir(path.join(dir, "problems"), { withFileTypes: true })
  )
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const root = path.join(dir, "problems", entry.name);
    const meta = JSON.parse(
      await fs.readFile(path.join(root, "problem.json"), "utf8"),
    );
    const rawGroups = z
      .array(
        z.object({
          name: z.string().min(1),
          tests: z
            .array(
              z
                .string()
                .regex(/^[a-zA-Z0-9_.-]+$/)
                .refine((v) => v !== "." && v !== ".."),
            )
            .min(1),
        }),
      )
      .min(1)
      .parse(meta.groups);
    const files = [...new Set(rawGroups.flatMap((g) => g.tests))];
    const problem = ProblemPublicSchema.parse({
      ...meta,
      id: entry.name,
      statementMd: await fs.readFile(path.join(root, "statement.md"), "utf8"),
      testCount: files.length,
      groups: rawGroups.map((g) => ({
        name: g.name,
        tests: g.tests.map((f) => files.indexOf(f)),
      })),
    });
    const source = await fs.readFile(path.join(root, "solution.c"), "utf8");
    // Kept in the upload so an exported package can be rebuilt elsewhere.
    content.solutions!.push({ problemId: entry.name, source });
    const compiled = await compileCode(source);
    if (!compiled.success || !compiled.artifact)
      throw new Error(`Reference ${entry.name}: ${compiled.diagnostics}`);
    for (const [index, file] of files.entries()) {
      const input = await fs.readFile(path.join(root, "tests", file), "utf8");
      const run = await runArtifact(compiled.artifact, input, problem.limits);
      if (!run.success)
        throw new Error(`Reference ${entry.name}/${file}: ${run.termination}`);
      content.inputs.push({
        problemId: entry.name,
        index,
        content: input,
        sha256: await sha256Hex(input),
        expectedDigest: await innerDigest(run.stdout, problem.normalize),
      });
    }
    for (const sample of problem.sampleCases) {
      const run = await runArtifact(
        compiled.artifact,
        sample.input,
        problem.limits,
      );
      if (
        !run.success ||
        (await innerDigest(run.stdout, problem.normalize)) !==
          (await innerDigest(sample.output, problem.normalize))
      )
        throw new Error(`Reference sample mismatch: ${problem.id}`);
    }
    content.problems.push({
      ...problem,
      version: await problemVersion(
        problem,
        content.inputs.filter((i) => i.problemId === entry.name),
      ),
    });
  }
  content.problems.sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
  content.validation = {
    passed: true,
    completedAt: Date.now(),
    tests: content.inputs.length,
  };
  const parsed = BundleContentSchema.parse(content),
    bundle = {
      revision: await sha256Hex(canonicalJson(parsed)),
      content: parsed,
    };
  await save(path.join(dir, ".myriad/bundles", `${bundle.revision}.json`), bundle);
  await save(path.join(dir, ".myriad/bundle.json"), bundle);
  return {
    revision: bundle.revision,
    problems: content.problems.length,
    tests: content.inputs.length,
  };
}
const METADATA = ["title", "startsAt", "endsAt", "rules", "policy"] as const;
type Metadata = Pick<BundleContent["exam"], (typeof METADATA)[number]>;
/**
 * Uploads the bundle and makes it current, at any time. The local exam.json
 * replaces the exam settings on the site, so settings edited on the site are
 * reported back instead of being silently undone.
 */
export async function deploy(dir: string, options: RemoteOptions) {
  const b = await readBundle(dir),
    base = `/api/teacher/exams/${b.content.exam.id}/revisions`;
  await request(options, base, "POST", b);
  const result: {
    examId: string;
    revision: string;
    url: string;
    previous: {
      metadata: Metadata;
      problems: { id: string; version: string | null }[];
    } | null;
  } = await request(options, `${base}/${b.revision}/publish`, "POST");
  const url = new URL(result.url, options.remote);
  // Opening this while signed in to the teacher workspace previews the exam as a student.
  const previewUrl = new URL(url);
  previewUrl.searchParams.set("preview", "1");
  const before = new Map(
    (result.previous?.problems ?? []).map((p) => [p.id, p.version]),
  );
  return {
    examId: result.examId,
    revision: result.revision,
    url: url.href,
    previewUrl: previewUrl.href,
    problems: b.content.problems.map((p) => ({
      id: p.id,
      version: p.version,
      change: !before.has(p.id)
        ? "added"
        : before.get(p.id) === p.version
          ? "unchanged"
          : "changed",
    })),
    removedProblems: [...before.keys()].filter(
      (id) => !b.content.problems.some((p) => p.id === id),
    ),
    overwroteSiteSettings: result.previous
      ? METADATA.filter(
          (key) => result.previous!.metadata[key] !== b.content.exam[key],
        ).map((key) => ({
          field: key,
          site: result.previous!.metadata[key],
          local: b.content.exam[key],
        }))
      : [],
  };
}
/**
 * Recreates an editable exam directory from the site: exam.json with the site's
 * current settings, each problem's files and tests, and every stored upload in
 * .myriad/bundles so earlier submissions can still be verified. Rebuilding the
 * result reproduces the same problem versions.
 */
export async function exportExam(
  dir: string,
  options: Partial<RemoteOptions> & {
    exam?: string;
    file?: string;
    force?: boolean;
  },
) {
  let data: ExamExport;
  if (options.file) data = JSON.parse(await fs.readFile(options.file, "utf8"));
  else if (options.remote && options.exam)
    data = await request(
      options as RemoteOptions,
      `/api/teacher/exams/${encodeURIComponent(options.exam)}/export`,
    );
  else throw new Error("Provide --file, or --exam with --remote");
  if (data.format !== "myriad-export-v1") throw new Error("Unknown export format");
  const bundles = await Promise.all(data.bundles.map((b) => validateBundle(b)));
  const current = bundles.find((b) => b.revision === data.current);
  if (!current) throw new Error("Export does not contain the current upload");
  const existing = await fs.readdir(dir).catch(() => [] as string[]);
  if (
    !options.force &&
    (existing.includes("exam.json") || existing.includes("problems"))
  )
    throw new Error(
      "Directory already contains an exam; use --force to replace exam.json and problems/",
    );
  await fs.mkdir(dir, { recursive: true });
  const exam = { ...current.content.exam, ...data.settings };
  await fs.writeFile(
    path.join(dir, "exam.json"),
    JSON.stringify(ExamSettingsSchema.parse(exam), null, 2) + "\n",
  );
  await fs.rm(path.join(dir, "problems"), { recursive: true, force: true });
  const missingSolutions: string[] = [];
  for (const p of current.content.problems) {
    const root = path.join(dir, "problems", p.id),
      width = Math.max(2, String(p.testCount).length),
      name = (index: number) => `${String(index + 1).padStart(width, "0")}.in`;
    await fs.mkdir(path.join(root, "tests"), { recursive: true });
    for (const input of current.content.inputs.filter(
      (i) => i.problemId === p.id,
    ))
      await fs.writeFile(
        path.join(root, "tests", name(input.index)),
        input.content,
      );
    await fs.writeFile(
      path.join(root, "problem.json"),
      JSON.stringify(
        {
          title: p.title,
          order: p.order,
          normalize: p.normalize,
          limits: p.limits,
          groups: p.groups.map((g) => ({
            name: g.name,
            tests: g.tests.map(name),
          })),
          sampleCases: p.sampleCases,
        },
        null,
        2,
      ) + "\n",
    );
    await fs.writeFile(path.join(root, "statement.md"), p.statementMd);
    const solution = current.content.solutions?.find(
      (s) => s.problemId === p.id,
    );
    if (solution)
      await fs.writeFile(path.join(root, "solution.c"), solution.source);
    else missingSolutions.push(p.id);
  }
  for (const bundle of bundles)
    await save(
      path.join(dir, ".myriad/bundles", `${bundle.revision}.json`),
      bundle,
    );
  await save(path.join(dir, ".myriad/bundle.json"), current);
  return {
    directory: path.resolve(dir),
    examId: data.examId,
    current: current.revision,
    revisions: bundles.length,
    problems: current.content.problems.map((p) => ({
      id: p.id,
      tests: p.testCount,
      version: p.version,
    })),
    // Older uploads carry no solutions; add solution.c before rebuilding.
    missingSolutions,
    settingsFromSite: METADATA.filter(
      (key) => data.settings[key] !== current.content.exam[key],
    ),
  };
}
/** Bundles kept by `build`, by revision, for judging submissions made against them. */
async function bundlesByRevision(dir: string) {
  const bundles = new Map<string, ExamBundle>();
  const root = path.join(dir, ".myriad/bundles");
  for (const file of await fs.readdir(root).catch(() => [] as string[])) {
    if (!file.endsWith(".json")) continue;
    const bundle = await validateBundle(
      JSON.parse(await fs.readFile(path.join(root, file), "utf8")),
    );
    bundles.set(bundle.revision, bundle);
  }
  const current = await readBundle(dir).catch(() => null);
  if (current) bundles.set(current.revision, current);
  return bundles;
}
export async function pull(dir: string, options: RemoteOptions) {
  const b = await readBundle(dir);
  let after = 0,
    snapshot: number | undefined,
    policy: "best" | "last" | undefined,
    revision: string | undefined;
  const submissions: ExportSubmission[] = [];
  for (;;) {
    const data = await request(
      options,
      `/api/teacher/exams/${b.content.exam.id}/submissions?after=${after}${snapshot === undefined ? "" : `&snapshot=${snapshot}`}`,
    );
    snapshot = data.snapshot;
    policy = data.policy;
    revision = data.revision;
    submissions.push(...data.submissions);
    if (!data.hasMore) break;
    if (data.nextCursor <= after)
      throw new Error("Non-advancing submission cursor");
    after = data.nextCursor;
  }
  await save(path.join(dir, ".myriad/submissions.json"), {
    examId: b.content.exam.id,
    revision,
    policy,
    snapshot,
    submissions,
  });
  const revisions = [...new Set(submissions.map((s) => s.revision))];
  const local = await bundlesByRevision(dir);
  return {
    snapshot,
    count: submissions.length,
    revisions,
    missingBundles: revisions.filter((r) => !local.has(r)),
  };
}
async function judge(bundle: ExamBundle, problemId: string, code: string) {
  const p = bundle.content.problems.find((p) => p.id === problemId);
  if (!p) throw new Error("Unknown problem");
  const compiled = await compileCode(code),
    verdicts: TestVerdict[] = [],
    actualChecksums = new Map<number, string>();
  for (let index = 0; index < p.testCount; index++) {
    const input = bundle.content.inputs.find(
      (i) => i.problemId === p.id && i.index === index,
    )!;
    let status: TestVerdict["status"] = "RE";
    if (compiled.success && compiled.artifact) {
      const r = await runArtifact(compiled.artifact, input.content, p.limits);
      if (r.success) {
        const digest = await innerDigest(r.stdout, p.normalize);
        actualChecksums.set(index, digest);
        status = digest === input.expectedDigest ? "AC" : "WA";
      } else
        status = (
          {
            tle: "TLE",
            mle: "MLE",
            ole: "OLE",
            re: "RE",
            exited: "RE",
          } as const
        )[r.termination];
    }
    verdicts.push({ index, status });
  }
  return {
    verdicts,
    actualChecksums,
    diagnostics: compiled.diagnostics,
    ...computeGroupVerdicts(p.groups, verdicts),
  };
}
export async function testSolution(dir: string, pid: string, file: string) {
  const b = await readBundle(dir);
  const { actualChecksums: _, ...result } = await judge(
    b,
    pid,
    await fs.readFile(file, "utf8"),
  );
  return result;
}
/** Re-judges every pulled submission with the exact upload it was judged against. */
export async function verify(dir: string) {
  const b = await readBundle(dir),
    snapshot = JSON.parse(
      await fs.readFile(path.join(dir, ".myriad/submissions.json"), "utf8"),
    );
  if (snapshot.examId !== b.content.exam.id)
    throw new Error("Snapshot belongs to another exam");
  const bundles = await bundlesByRevision(dir);
  const missing = [
    ...new Set(
      (snapshot.submissions as ExportSubmission[])
        .map((s) => s.revision)
        .filter((r) => !bundles.has(r)),
    ),
  ];
  if (missing.length)
    throw new Error(
      `Missing local bundles for revisions ${missing.join(", ")}; keep .myriad/bundles from every deploy`,
    );
  const submissions = [];
  for (const s of snapshot.submissions as ExportSubmission[]) {
    const used = bundles.get(s.revision)!;
    if ((await sha256Hex(s.code)) !== s.codeSha256)
      throw new Error("Submission digest mismatch");
    const problem = used.content.problems.find((p) => p.id === s.problemId);
    if (s.problemVersion && problem?.version !== s.problemVersion)
      throw new Error(`Problem version mismatch for submission ${s.id}`);
    const result = await judge(used, s.problemId, s.code);
    let disputed = false;
    for (const claim of s.claims) {
      if (claim.status === "ok") {
        const digest = result.actualChecksums.get(claim.index);
        if (
          !digest ||
          (await boundChecksum({
            salt: used.content.exam.salt,
            studentId: s.studentId,
            problemId: s.problemId,
            index: claim.index,
            innerDigest: digest,
          })) !== claim.checksum.toLowerCase()
        )
          disputed = true;
      }
    }
    const classification =
      disputed || result.score < s.score
        ? "DISPUTED"
        : result.score > s.score
          ? "UNDER-CLAIMED"
          : "CONFIRMED";
    submissions.push({
      id: s.id,
      codeSha256: s.codeSha256,
      problemVersion: s.problemVersion,
      verdicts: result.verdicts,
      classification,
    });
  }
  const report = VerificationReportSchema.parse({
    examId: b.content.exam.id,
    revision: snapshot.revision ?? b.revision,
    policy: snapshot.policy ?? b.content.exam.policy,
    snapshot: snapshot.snapshot,
    completedAt: Date.now(),
    submissions,
  });
  await save(path.join(dir, "report/full.json"), report);
  return {
    file: path.resolve(dir, "report/full.json"),
    count: submissions.length,
    disputed: submissions.filter((s) => s.classification === "DISPUTED").length,
  };
}
export async function uploadResults(dir: string, options: RemoteOptions) {
  const report = VerificationReportSchema.parse(
    JSON.parse(await fs.readFile(path.join(dir, "report/full.json"), "utf8")),
  );
  return request(
    options,
    `/api/teacher/exams/${report.examId}/results`,
    "POST",
    report,
  );
}
export async function pushToolchain(options: RemoteOptions) {
  const base = path.dirname(
    path.dirname(
      fileURLToPath(import.meta.resolve("@wasm-oj/toolchain-clang")),
    ),
  );
  const credential = options.tokenFile
    ? (await fs.readFile(options.tokenFile, "utf8")).trim()
    : process.env.MYRIAD_TEACHER_TOKEN;
  if (!credential) throw new Error("Teacher token required");
  for (const asset of descriptor.assets) {
    const filename = path.basename(asset.path),
      data = await fs.readFile(path.join(base, "assets", filename));
    const res = await fetch(
      new URL(`/api/teacher/toolchains/${filename}`, options.remote),
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": filename.endsWith(".json")
            ? "application/json"
            : "application/octet-stream",
        },
        body: data,
      },
    );
    if (!res.ok)
      throw new Error(`Asset upload failed ${res.status}: ${await res.text()}`);
  }
  return { uploaded: descriptor.assets.length };
}
