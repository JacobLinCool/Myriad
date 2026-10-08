/**
 * Deterministic build and run configuration for WASM-OJ forge C toolchain.
 */

import type { ProblemLimits } from "./schema.js";

export const DEFAULT_LIMITS: ProblemLimits = Object.freeze({
  instructionBudget: 50_000_000,
  logicalTimeLimitMs: 2_000,
  memoryMb: 128,
  outputLimitBytes: 10 * 1024 * 1024,
});

export const C_BUILD_CONFIG = Object.freeze({
  language: "c" as const,
  target: "wasip1" as const,
  optimization: "release" as const,
  entry: "main.c",
});

export interface DeterminismConfig {
  randomSeed: number;
  realtimeEpochMs: number;
  clockStepNs: number;
}

export interface ResourcePolicy {
  instructionBudget: number;
  logicalTimeLimitMs: number;
  memoryLimitBytes: number;
  outputLimitBytes: number;
  filesystemWriteLimitBytes: number;
  filesystemEntryLimit: number;
  wallTimeLimitMs: number;
}

export interface RunConfig {
  args: string[];
  stdin: string;
  env: Record<string, string>;
  determinism: DeterminismConfig;
  resources: ResourcePolicy;
}

/**
 * Creates deterministic RunConfig for forge runner given problem limits and stdin.
 */
export function createRunConfig(
  limits: Partial<ProblemLimits> | undefined,
  stdin: string,
): RunConfig {
  const mergedLimits: ProblemLimits = {
    instructionBudget:
      limits?.instructionBudget ?? DEFAULT_LIMITS.instructionBudget,
    logicalTimeLimitMs:
      limits?.logicalTimeLimitMs ?? DEFAULT_LIMITS.logicalTimeLimitMs,
    memoryMb: limits?.memoryMb ?? DEFAULT_LIMITS.memoryMb,
    outputLimitBytes:
      limits?.outputLimitBytes ?? DEFAULT_LIMITS.outputLimitBytes,
  };

  return {
    args: [],
    stdin,
    env: {},
    determinism: {
      randomSeed: 0,
      realtimeEpochMs: 0,
      clockStepNs: 1_000,
    },
    resources: {
      instructionBudget: mergedLimits.instructionBudget,
      logicalTimeLimitMs: mergedLimits.logicalTimeLimitMs,
      memoryLimitBytes: mergedLimits.memoryMb * 1024 * 1024,
      outputLimitBytes: mergedLimits.outputLimitBytes,
      filesystemWriteLimitBytes: 65536,
      filesystemEntryLimit: 64,
      wallTimeLimitMs: 60_000, // Host safety limit only
    },
  };
}

export type ExecutionTerminationStatus = "ok" | "tle" | "mle" | "re" | "ole";

/**
 * Classifies process termination into standard status.
 */
export function classifyTermination(
  termination: string,
  exitCode: number,
): ExecutionTerminationStatus {
  if (
    termination === "instruction-limit" ||
    termination === "logical-time-limit"
  ) {
    return "tle";
  }
  if (termination === "memory-limit") {
    return "mle";
  }
  if (termination === "output-limit") {
    return "ole";
  }
  if (termination === "trap") {
    return "re";
  }
  if (termination === "exited") {
    return exitCode === 0 ? "ok" : "re";
  }
  return "re";
}
