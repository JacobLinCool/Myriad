import { createServerEngine } from "@wasm-oj/server";
import type { Engine } from "@wasm-oj/core";
import type { BuildArtifact } from "@wasm-oj/contracts";
import { serverSource as clangSource } from "@wasm-oj/toolchain-clang";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createRunConfig,
  classifyTermination,
  type ProblemLimits,
} from "@myriad/shared";

let serverEnginePromise: Promise<Engine> | null = null;

/**
 * Searches for wasm-oj runtime binaries (wasm-oj-compiler and wasm-oj-runner).
 */
async function findRuntimeDirectory(): Promise<string> {
  const packageDirectory = path.dirname(
    path.dirname(fileURLToPath(import.meta.resolve("@wasm-oj/server"))),
  );
  const directory =
    process.env.MYRIAD_RUNTIME_DIRECTORY ??
    path.join(packageDirectory, "crates/runtime-core/target/release");
  await Promise.all(
    ["wasm-oj-runner", "wasm-oj-compiler"].map((file) =>
      fs.access(path.join(directory, file)),
    ),
  );
  return directory;
}

/**
 * Initializes and returns the singleton wasm-oj ServerEngine.
 */
export async function getServerEngine(): Promise<Engine> {
  if (serverEnginePromise) return serverEnginePromise;

  serverEnginePromise = (async () => {
    const runtimeDir = await findRuntimeDirectory();
    const cacheDir = path.resolve(".wasm-oj-cache");
    await fs.mkdir(cacheDir, { recursive: true });

    const engine = await createServerEngine({
      runtimeDirectory: runtimeDir,
      cacheDirectory: cacheDir,
      toolchains: [clangSource()],
    });
    return engine;
  })();

  return serverEnginePromise;
}

export interface WasmOjExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  termination: "exited" | "tle" | "mle" | "re" | "ole";
  code: number;
}

/**
 * Compiles C source code using @wasm-oj/server engine.
 */
export async function compileCode(code: string): Promise<{
  success: boolean;
  artifact?: BuildArtifact;
  diagnostics: string;
}> {
  const engine = await getServerEngine();

  const build = await engine.compile({
    language: "c",
    target: "wasip1",
    optimization: "release",
    entry: "main.c",
    files: { "main.c": code },
  });

  const diagnostics = (build.diagnostics ?? [])
    .map(
      (d) =>
        `${d.severity.toUpperCase()}: ${d.message} at ${d.file}:${d.line}:${d.column}`,
    )
    .join("\n");

  return {
    success: build.success && !!build.artifact,
    artifact: build.artifact,
    diagnostics: diagnostics || build.stderr || "",
  };
}

/**
 * Runs a compiled @wasm-oj artifact with deterministic limits.
 */
export async function runArtifact(
  artifact: BuildArtifact,
  stdin: string,
  limits: ProblemLimits,
): Promise<WasmOjExecutionResult> {
  const engine = await getServerEngine();
  const config = createRunConfig(limits, stdin);
  const result = await engine.run(artifact, config);
  const term = classifyTermination(result.termination, result.code);

  return {
    success: term === "ok",
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    termination: term === "ok" ? "exited" : term,
    code: result.code,
  };
}
