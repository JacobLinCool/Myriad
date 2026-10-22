import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distAssets = path.join(root, "dist", "assets");

// Locate @wasm-oj/browser dist/assets
const browserPkgEntry = import.meta.resolve("@wasm-oj/browser");
const browserDistDir = path.dirname(fileURLToPath(browserPkgEntry));
const sourceAssets = path.join(browserDistDir, "assets");

try {
  await fs.mkdir(distAssets, { recursive: true });
  await fs.cp(sourceAssets, distAssets, { recursive: true });
  // The runtime and compiler binaries have their own upstream notices.
  for (const name of ["browser", "toolchain-clang"]) {
    const packageRoot = path.dirname(
      fileURLToPath(import.meta.resolve(`@wasm-oj/${name}/package.json`)),
    );
    const destination = path.join(root, "dist", "licenses", "wasm-oj", name);
    await fs.mkdir(destination, { recursive: true });
    for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md", "licenses"]) {
      await fs.cp(path.join(packageRoot, file), path.join(destination, file), {
        recursive: true,
      });
    }
  }
  console.log(`✓ Copied @wasm-oj/browser assets to ${distAssets}`);
} catch (err) {
  throw new Error("Could not copy browser assets", { cause: err });
}
