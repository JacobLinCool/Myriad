import { beforeEach, afterEach, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const engine = vi.hoisted(() => ({
  compileCode: vi.fn(),
  runArtifact: vi.fn(),
}));
vi.mock("../src/engine.js", () => engine);
import {
  initialize,
  build,
  readBundle,
  deploy,
  pull,
  verify,
  exportExam,
} from "../src/workflow";
let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "myriad-workflow-"));
  engine.compileCode.mockResolvedValue({
    success: true,
    artifact: {},
    diagnostics: "",
  });
  engine.runArtifact.mockResolvedValue({
    success: true,
    stdout: "3\n",
    termination: "exited",
    code: 0,
  });
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("builds self-contained content and deploys the verified snapshot after sources change", async () => {
  await initialize(dir);
  await build(dir);
  const bundle = await readBundle(dir);
  expect(bundle.content.inputs[0].content).toBe("1 2\n");
  await fs.writeFile(path.join(dir, "problems/aplusb/tests/01.in"), "changed");
  vi.stubEnv("MYRIAD_TEACHER_TOKEN", "secret");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}"))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ url: "/exams/test" })),
    );
  vi.stubGlobal("fetch", fetcher);
  await deploy(dir, { remote: "https://judge.test" });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(bundle);
});
it("does not publish a validation bundle when references fail", async () => {
  await initialize(dir);
  await build(dir);
  const previous = await readBundle(dir);
  engine.runArtifact.mockResolvedValue({ success: false, termination: "tle" });
  await expect(build(dir)).rejects.toThrow("Reference");
  await expect(readBundle(dir)).rejects.toThrow();
  expect(
    JSON.parse(
      await fs.readFile(
        path.join(dir, ".myriad/bundles", `${previous.revision}.json`),
        "utf8",
      ),
    ),
  ).toEqual(previous);
});
it("supports an empty pull and local verification report without running any program", async () => {
  await initialize(dir);
  await build(dir);
  const bundle = await readBundle(dir);
  engine.compileCode.mockClear();
  vi.stubEnv("MYRIAD_TEACHER_TOKEN", "secret");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          revision: bundle.revision,
          snapshot: 0,
          submissions: [],
          hasMore: false,
          nextCursor: 0,
        }),
      ),
    ),
  );
  await pull(dir, { remote: "https://judge.test" });
  await verify(dir);
  expect(engine.compileCode).not.toHaveBeenCalled();
  const report = JSON.parse(
    await fs.readFile(path.join(dir, "report/full.json"), "utf8"),
  );
  expect(report.submissions).toEqual([]);
});
it("rejects mutated bundles before any remote publication", async () => {
  await initialize(dir);
  await build(dir);
  const bundle = await readBundle(dir);
  bundle.content.inputs[0].content = "tampered";
  await fs.writeFile(path.join(dir, ".myriad/bundle.json"), JSON.stringify(bundle));
  await expect(readBundle(dir)).rejects.toThrow("digest");
});
it("versions problems by judged content and verifies each submission with its own upload", async () => {
  await initialize(dir);
  await build(dir);
  const first = await readBundle(dir);
  const statement = path.join(dir, "problems/aplusb/statement.md");
  await fs.writeFile(statement, "# A + B\n修正錯字。\n");
  await build(dir);
  const typo = await readBundle(dir);
  expect(typo.revision).not.toBe(first.revision);
  expect(typo.content.problems[0].version).toBe(
    first.content.problems[0].version,
  );
  await fs.writeFile(path.join(dir, "problems/aplusb/tests/01.in"), "2 1\n");
  await build(dir);
  const second = await readBundle(dir);
  expect(second.content.problems[0].version).not.toBe(
    first.content.problems[0].version,
  );
  const code = "int main(void){return 0;}";
  const { sha256Hex } = await import("@myriad/shared");
  const submission = (id: string, bundle: typeof first, sequence: number) => ({
    id,
    sequence,
    examId: bundle.content.exam.id,
    revision: bundle.revision,
    problemId: "aplusb",
    problemVersion: bundle.content.problems[0].version,
    studentId: "s",
    identityKind: "guest",
    participantId: "guest:s",
    status: "complete",
    createdAt: Date.now(),
    verdicts: [{ index: 0, status: "AC" }],
    groupsPassed: 1,
    groupsTotal: 1,
    score: 1,
    code,
    codeSha256: "",
    deviceId: crypto.randomUUID(),
    claims: [{ index: 0, status: "re" }],
  });
  const submissions = [
    submission("00000000-0000-4000-8000-000000000001", first, 1),
    submission("00000000-0000-4000-8000-000000000002", second, 2),
  ];
  for (const s of submissions) s.codeSha256 = await sha256Hex(code);
  vi.stubEnv("MYRIAD_TEACHER_TOKEN", "secret");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          revision: second.revision,
          policy: "last",
          snapshot: 2,
          submissions,
          hasMore: false,
          nextCursor: 2,
        }),
      ),
    ),
  );
  const pulled = await pull(dir, { remote: "https://judge.test" });
  expect(pulled.missingBundles).toEqual([]);
  engine.runArtifact.mockClear();
  await verify(dir);
  expect(engine.runArtifact.mock.calls.map((call) => call[1])).toEqual([
    "1 2\n",
    "2 1\n",
  ]);
  const report = JSON.parse(
    await fs.readFile(path.join(dir, "report/full.json"), "utf8"),
  );
  expect(report.policy).toBe("last");
  expect(report.submissions.map((s: any) => s.problemVersion)).toEqual([
    first.content.problems[0].version,
    second.content.problems[0].version,
  ]);
  await fs.rm(path.join(dir, ".myriad/bundles", `${first.revision}.json`));
  await expect(verify(dir)).rejects.toThrow(first.revision);
});
it("exports an editable directory that rebuilds to the same problem versions with site settings", async () => {
  await initialize(dir);
  await build(dir);
  const uploaded = await readBundle(dir);
  expect(uploaded.content.solutions?.[0].source).toContain("scanf");
  const settings = {
    title: "網站上改過的標題",
    startsAt: uploaded.content.exam.startsAt,
    endsAt: uploaded.content.exam.endsAt + 3600000,
    rules: uploaded.content.exam.rules,
    policy: "last" as const,
  };
  const file = path.join(dir, "export.json");
  await fs.writeFile(
    file,
    JSON.stringify({
      format: "myriad-export-v1",
      examId: uploaded.content.exam.id,
      settings,
      current: uploaded.revision,
      bundles: [uploaded],
    }),
  );
  const target = path.join(dir, "exported");
  const result = await exportExam(target, { file });
  expect(result.missingSolutions).toEqual([]);
  expect(result.settingsFromSite.sort()).toEqual(["endsAt", "policy", "title"]);
  const exam = JSON.parse(
    await fs.readFile(path.join(target, "exam.json"), "utf8"),
  );
  expect(exam).toMatchObject(settings);
  expect(exam.salt).toBe(uploaded.content.exam.salt);
  await expect(exportExam(target, { file })).rejects.toThrow("--force");
  await build(target);
  const rebuilt = await readBundle(target);
  expect(rebuilt.content.problems.map((p) => p.version)).toEqual(
    uploaded.content.problems.map((p) => p.version),
  );
  expect(
    JSON.parse(
      await fs.readFile(
        path.join(target, ".myriad/bundles", `${uploaded.revision}.json`),
        "utf8",
      ),
    ),
  ).toEqual(uploaded);
});
