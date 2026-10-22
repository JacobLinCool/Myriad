import { z } from "zod";
import { DeviceIdSchema } from "./schema.js";
import { IdentityKindSchema, validateStudentIdentity } from "./identity.js";

const duration = z.number().finite().nonnegative().max(86_400_000);
export const TelemetryEventSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    operationId: z.string().uuid(),
    deviceId: DeviceIdSchema,
    examId: z.string().min(1).max(128),
    identityKind: IdentityKindSchema,
    studentId: z.string().min(1).max(255).nullable(),
    problemId: z.string().min(1).max(128).nullable(),
    attemptId: z.string().min(1).max(128).optional(),
    mode: z.enum(["startup", "local", "submission"]),
    kind: z.enum([
      "engine_init",
      "resource_download",
      "input_download",
      "compile",
      "run",
      "submission",
    ]),
    outcome: z.enum(["ok", "error", "unknown"]),
    startedAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    durationMs: duration,
    testIndex: z.number().int().nonnegative().optional(),
    engineDurationMs: duration.optional(),
    executionDurationMs: duration.optional(),
    cacheHit: z.boolean().optional(),
    bytes: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    transferBytes: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    cache: z.enum(["memory", "prefetch", "network", "unknown"]).optional(),
    resource: z.enum(["toolchain", "asset"]).optional(),
    termination: z.string().max(64).optional(),
    exitCode: z.number().int().optional(),
  })
  .strict()
  .superRefine(validateStudentIdentity);
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
export const TelemetryBatchSchema = z
  .object({ events: z.array(TelemetryEventSchema).min(1).max(25) })
  .strict();
