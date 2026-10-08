import { z } from "zod";
import {
  DeviceIdSchema,
  ProblemPublicSchema,
  TestClaimSchema,
  TOOLCHAIN,
  TestVerdictSchema,
} from "./schema.js";
import { sha256Hex } from "./checksum.js";

export const SlugSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
export const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const ExamSettingsSchema = z
  .object({
    id: SlugSchema,
    title: z.string().min(1).max(200),
    startsAt: z.number().int().positive(),
    endsAt: z.number().int().positive(),
    rules: z.string().max(20000).default(""),
    policy: z.enum(["best", "last"]).default("best"),
    salt: z.string().min(16).max(256),
  })
  .strict()
  .refine((e) => e.endsAt > e.startsAt, "endsAt must be after startsAt");
export type ExamSettings = z.infer<typeof ExamSettingsSchema>;
export const BundleContentSchema = z
  .object({
    format: z.literal("myriad-bundle-v3"),
    toolchain: z.literal(`${TOOLCHAIN.id}@${TOOLCHAIN.version}`),
    exam: ExamSettingsSchema,
    problems: z
      .array(
        ProblemPublicSchema.extend({
          id: SlugSchema,
          version: DigestSchema,
          testCount: z.number().int().min(1).max(1000),
          groups: z
            .array(
              z.object({
                name: z.string().min(1),
                tests: z.array(z.number().int().nonnegative()).min(1),
              }),
            )
            .min(1),
        }),
      )
      .min(1)
      .max(100),
    inputs: z.array(
      z.object({
        problemId: SlugSchema,
        index: z.number().int().nonnegative(),
        content: z.string(),
        sha256: DigestSchema,
        expectedDigest: DigestSchema,
      }),
    ),
    /**
     * Reference solutions, kept so an exported package can be rebuilt. They stay
     * in the teacher's stored upload and are never part of what students receive.
     */
    solutions: z
      .array(
        z
          .object({ problemId: SlugSchema, source: z.string().max(200000) })
          .strict(),
      )
      .optional(),
    validation: z
      .object({
        completedAt: z.number().int().positive(),
        passed: z.literal(true),
        tests: z.number().int().positive(),
      })
      .strict(),
  })
  .strict()
  .superRefine((b, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (new Set(b.problems.map((p) => p.id)).size !== b.problems.length)
      issue("Duplicate problem ID");
    const keys = new Set<string>();
    for (const input of b.inputs) {
      const p = b.problems.find((p) => p.id === input.problemId);
      const key = `${input.problemId}:${input.index}`;
      if (!p || input.index >= p.testCount || keys.has(key))
        issue("Invalid or duplicate input index");
      keys.add(key);
    }
    const count = b.problems.reduce((n, p) => n + p.testCount, 0);
    if (b.inputs.length !== count || b.validation.tests !== count)
      issue("Incomplete validated inputs");
    for (const p of b.problems) {
      const covered = new Set<number>();
      for (const group of p.groups)
        for (const i of group.tests) {
          if (i >= p.testCount) issue("Group index out of range");
          covered.add(i);
        }
      if (covered.size !== p.testCount) issue("Groups must cover every test");
    }
  });
export const ExamBundleSchema = z
  .object({ revision: DigestSchema, content: BundleContentSchema })
  .strict();
export type ExamBundle = z.infer<typeof ExamBundleSchema>;
export type BundleContent = z.infer<typeof BundleContentSchema>;
/** Everything a teacher needs to recreate the exam directory elsewhere. */
export interface ExamExport {
  format: "myriad-export-v1";
  examId: string;
  /** The exam settings currently on the site, which may differ from the upload. */
  settings: Pick<
    BundleContent["exam"],
    "title" | "startsAt" | "endsAt" | "rules" | "policy"
  >;
  /** The revision students currently receive. */
  current: string;
  /** Every stored upload, so earlier submissions can still be verified. */
  bundles: ExamBundle[];
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
/**
 * A problem's version covers only what decides a verdict: the toolchain, limits,
 * output normalization, test grouping and every test's input and expected output.
 * Statements, titles and samples can change without changing the version.
 */
export function problemVersion(
  problem: {
    limits: z.infer<typeof ProblemPublicSchema>["limits"];
    normalize: "trim" | "exact";
    groups: { tests: number[] }[];
    testCount: number;
  },
  tests: { index: number; sha256: string; expectedDigest: string }[],
): Promise<string> {
  return sha256Hex(
    canonicalJson({
      toolchain: `${TOOLCHAIN.id}@${TOOLCHAIN.version}`,
      limits: problem.limits,
      normalize: problem.normalize,
      groups: problem.groups.map((g) => g.tests),
      testCount: problem.testCount,
      tests: [...tests]
        .sort((a, b) => a.index - b.index)
        .map(({ sha256, expectedDigest }) => ({ sha256, expectedDigest })),
    }),
  );
}
export async function validateBundle(value: unknown): Promise<ExamBundle> {
  const bundle = ExamBundleSchema.parse(value);
  if ((await sha256Hex(canonicalJson(bundle.content))) !== bundle.revision)
    throw new Error("Bundle digest mismatch");
  for (const input of bundle.content.inputs)
    if ((await sha256Hex(input.content)) !== input.sha256)
      throw new Error("Input digest mismatch");
  for (const problem of bundle.content.problems)
    if (
      (await problemVersion(
        problem,
        bundle.content.inputs.filter((i) => i.problemId === problem.id),
      )) !== problem.version
    )
      throw new Error(`Problem version mismatch: ${problem.id}`);
  return bundle;
}
export const AttemptRequestSchema = z
  .object({
    operationId: z.string().uuid(),
    problemVersion: DigestSchema,
    problemId: SlugSchema,
    studentId: z.string().trim().min(1).max(64),
    identityKind: z.enum(["guest", "nycu"]),
    deviceId: DeviceIdSchema,
    code: z.string().min(1).max(65536),
  })
  .strict();
export type AttemptRequest = z.infer<typeof AttemptRequestSchema>;
export const ClaimMessageSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("auth"), token: z.string().min(32).max(256) })
    .strict(),
  z.object({ type: z.literal("claim"), claim: TestClaimSchema }).strict(),
  z.object({ type: z.literal("finish") }).strict(),
  z.object({ type: z.literal("abort") }).strict(),
]);
export interface PublicExam {
  id: string;
  title: string;
  startsAt: number;
  endsAt: number;
  rules: string;
  policy: "best" | "last";
  revision: string;
  serverTime: number;
  status: "upcoming" | "active" | "ended";
  problems: (z.infer<typeof ProblemPublicSchema> & { version: string })[];
  /** Present when the exam's teacher is previewing it outside its schedule. */
  preview?: true;
}
export interface AttemptSummary {
  id: string;
  examId: string;
  /** The upload the attempt was judged against. */
  revision: string;
  problemId: string;
  /** The problem version that judged it; null for attempts before versions existed. */
  problemVersion: string | null;
  studentId: string;
  identityKind: "guest" | "nycu";
  participantId: string;
  status: "running" | "complete" | "failed" | "expired";
  createdAt: number;
  verdicts: z.infer<typeof TestVerdictSchema>[];
  groupsPassed: number;
  groupsTotal: number;
  score: number;
}
export interface ExportSubmission extends AttemptSummary {
  sequence: number;
  code: string;
  codeSha256: string;
  deviceId: string;
  claims: z.infer<typeof TestClaimSchema>[];
}
export const VerificationReportSchema = z
  .object({
    examId: SlugSchema,
    revision: DigestSchema,
    policy: z.enum(["best", "last"]),
    snapshot: z.number().int().nonnegative(),
    completedAt: z.number().int().positive(),
    submissions: z.array(
      z
        .object({
          id: z.string().uuid(),
          codeSha256: DigestSchema,
          problemVersion: DigestSchema.nullable(),
          verdicts: z.array(TestVerdictSchema),
          classification: z.enum(["CONFIRMED", "DISPUTED", "UNDER-CLAIMED"]),
        })
        .strict(),
    ),
  })
  .strict();
export type VerificationReport = z.infer<typeof VerificationReportSchema>;
