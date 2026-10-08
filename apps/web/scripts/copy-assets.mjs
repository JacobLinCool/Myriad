import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distAssets = path.join(root, "dist", "assets");

// Locate @wasm-oj/browser dist/assets
const browserPkgEntry = import.meta.resolve("@wasm-oj/browser");
const browserDistDir = path.dirname(new URL(browserPkgEntry).pathname);
const sourceAssets = path.join(browserDistDir, "assets");

try {
  await fs.mkdir(distAssets, { recursive: true });
  await fs.cp(sourceAssets, distAssets, { recursive: true });
  console.log(`✓ Copied @wasm-oj/browser assets to ${distAssets}`);
} catch (err) {
  throw new Error("Could not copy browser assets", { cause: err });
}
