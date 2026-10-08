import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

/** The local Worker listens on the origin configured for NYCU login. */
function workerOrigin() {
  try {
    const origin = readFileSync(
      new URL("../worker/.dev.vars", import.meta.url),
      "utf8",
    ).match(/^APP_ORIGIN=(.+)$/m)?.[1];
    if (origin) return new URL(origin.trim()).origin;
  } catch {
    // Fall back to Wrangler's default port.
  }
  return "http://localhost:8787";
}
const worker = workerOrigin();

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  server: {
    port: 5173,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
    proxy: {
      "/api": {
        target: worker,
        changeOrigin: true,
        ws: true,
      },
      "/toolchains": {
        target: worker,
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  },
});
