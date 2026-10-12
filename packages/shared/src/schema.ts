import { z } from "zod";

export const DeviceIdSchema = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());

/** Frozen checksum protocol tag; see boundChecksum. Not a product name. */
export const PROTOCOL = "lj-v1";
export const TOOLCHAIN = {
  id: "clang",
  version: "22.0.0-git20542-10",
};

export const ProblemLimitsSchema = z.object({
  instructionBudget: z.number().int().positive().default(50_000_000),
  logicalTimeLimitMs: z.number().int().positive().default(2_000),
  memoryMb: z.number().int().positive().default(128),
  outputLimitBytes: z
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
});
export type ProblemLimits = z.infer<typeof ProblemLimitsSchema>;

export const TestGroupSchema = z.object({
  name: z.string().min(1),
  tests: z.array(z.number().int().nonnegative()),
});
export type TestGroup = z.infer<typeof TestGroupSchema>;

export const ProblemPublicSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  statementMd: z.string(),
  template: z.string().max(200000).optional(),
  testCount: z.number().int().nonnegative(),
  groups: z.array(TestGroupSchema),
  limits: ProblemLimitsSchema,
  normalize: z.enum(["trim", "exact"]).default("trim"),
  /** Digest of everything that decides a verdict; set by the teacher's build. */
  version: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  sampleCases: z
    .array(
      z.object({
        input: z.string(),
        output: z.string(),
        explanation: z.string().optional(),
      }),
    )
    .default([]),
});
export type ProblemPublic = z.infer<typeof ProblemPublicSchema>;

/** Teacher-authored definition; semantic instructions never enter student responses. */
export const ProblemDefinitionSchema = ProblemPublicSchema.extend({
  semanticCheck: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => [...value].length <= 2000,
      "Semantic instruction must not exceed 2000 characters",
    )
    .optional(),
});

export const ExecutionMeasurementsSchema = z
  .object({
    inputBytes: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    instructionCost: z
      .number()
      .finite()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    memoryBytes: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    // Profiles include multiple toolchain digests and a runtime digest.
    costProfile: z.string().min(1).max(1024),
    costModel: z.string().min(1).max(128),
  })
  .strict();

export const TestClaimSchema = z.discriminatedUnion("status", [
  z.object({
    metrics: ExecutionMeasurementsSchema.optional(),
    index: z.number().int().nonnegative(),
    status: z.literal("ok"),
    checksum: z.string().regex(/^[0-9a-f]{64}$/i),
  }),
  z.object({
    metrics: ExecutionMeasurementsSchema.optional(),
    index: z.number().int().nonnegative(),
    status: z.enum(["tle", "mle", "re", "ole"]),
  }),
]);
export type TestClaim = z.infer<typeof TestClaimSchema>;

export const TestVerdictStatusSchema = z.enum([
  "AC",
  "WA",
  "TLE",
  "MLE",
  "RE",
  "OLE",
]);
export type TestVerdictStatus = z.infer<typeof TestVerdictStatusSchema>;

export const TestVerdictSchema = z.object({
  metrics: ExecutionMeasurementsSchema.optional(),
  index: z.number().int().nonnegative(),
  status: TestVerdictStatusSchema,
});
export type TestVerdict = z.infer<typeof TestVerdictSchema>;

export const GroupVerdictSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  testIndices: z.array(z.number().int().nonnegative()),
});
export type GroupVerdict = z.infer<typeof GroupVerdictSchema>;
