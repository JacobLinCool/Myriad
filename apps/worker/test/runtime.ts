import { Miniflare, type Json, type MiniflareFetcherBinding } from "miniflare";

/** An isolated Worker with the same D1 and R2 bindings as the application. */
export function createTestRuntime(options: {
  script: string;
  bindings?: Record<string, Json>;
  outboundService?: MiniflareFetcherBinding["handler"];
}) {
  return new Miniflare({
    telemetry: { enabled: false },
    workers: [
      {
        config: {
          name: "myriad-test",
          compatibilityDate: "2024-10-01",
          manifest: {
            mainModule: "worker.js",
            modules: {
              "worker.js": { type: "esm", contents: options.script },
            },
          },
          env: {
            DB: { type: "d1", id: "test-db" },
            BUCKET: { type: "r2", name: "test-bucket" },
            ...Object.fromEntries(
              Object.entries(options.bindings ?? {}).map(([name, value]) => [
                name,
                { type: "json" as const, value },
              ]),
            ),
          },
        },
        dev: options.outboundService
          ? {
              outboundService: {
                type: "fetcher",
                handler: options.outboundService,
              },
            }
          : undefined,
      },
    ],
  });
}
