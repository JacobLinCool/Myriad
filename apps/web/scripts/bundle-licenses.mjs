import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const noticeName =
  /(?:^|[._ -])(?:licen[sc]es?|notices?|copying|copyright|third[-_ ]party(?:[-_ ]notices?)?|ofl)(?:$|[._ -])/i;
const sourceExtension = /\.(?:[cm]?[jt]sx?|svelte|css|map)$/i;

/** Find the package owning a real module, including packages with private exports. */
async function owningPackage(moduleId) {
  if (moduleId.startsWith("\0")) return;
  const filename = moduleId.split("?")[0];
  if (!path.isAbsolute(filename)) return;
  let directory = path.dirname(filename);
  while (directory !== path.dirname(directory)) {
    try {
      const manifest = JSON.parse(
        await fs.readFile(path.join(directory, "package.json"), "utf8"),
      );
      if (manifest.name && manifest.version) return { directory, manifest };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    directory = path.dirname(directory);
  }
  throw new Error(
    `Cannot identify the package owning bundled module ${moduleId}`,
  );
}

/** Keep complete upstream notice directories and nested font/component licenses. */
async function noticeFiles(directory, prefix = "", insideNotices = false) {
  const files = [];
  for (const entry of await fs.readdir(path.join(directory, prefix), {
    withFileTypes: true,
  })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...(await noticeFiles(
          directory,
          relative,
          insideNotices || noticeName.test(entry.name),
        )),
      );
    } else if (
      entry.isFile() &&
      (insideNotices ||
        (noticeName.test(entry.name) && !sourceExtension.test(entry.name)))
    ) {
      files.push(relative);
    }
  }
  return files.sort();
}

/**
 * Copy notices for modules actually rendered into browser chunks.
 * @returns {import("vite").Plugin}
 */
export function bundleLicenses() {
  return {
    name: "myriad-bundle-licenses",
    apply: "build",
    async generateBundle(_options, bundle) {
      const packageRoots = new Map();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const [id, module] of Object.entries(output.modules)) {
          if (module.renderedLength === 0) continue;
          const owner = await owningPackage(id);
          if (owner) packageRoots.set(owner.directory, owner.manifest);
        }
      }

      const packages = new Map();
      const emitted = new Map();
      const emit = (filename, content) => {
        const existing = emitted.get(filename);
        if (existing && !existing.equals(content))
          throw new Error(`Conflicting upstream notices for ${filename}`);
        if (existing) return;
        emitted.set(filename, content);
        this.emitFile({ type: "asset", fileName: filename, source: content });
      };

      for (const [directory, manifest] of packageRoots) {
        // First-party workspace code is covered by this repository's LICENSE.
        if (!directory.split(path.sep).includes("node_modules")) continue;
        const id = `${manifest.name}@${manifest.version}`;
        const destination = `licenses/npm/${id}`;
        const files = await noticeFiles(directory);
        const licenseTextMissing = !files.some((file) =>
          /(?:^|[._ -])(?:licen[sc]e|copying|ofl)(?:$|[._ -])/i.test(
            path.basename(file),
          ),
        );
        if (licenseTextMissing) {
          // Preserve upstream evidence; never manufacture a license from its SPDX ID.
          files.push("package.json");
          const readmes = (await fs.readdir(directory)).filter((name) =>
            /^readme(?:$|\.)/i.test(name),
          );
          files.push(...readmes);
          this.warn(
            `${id} does not ship full license text; see licenses/npm/index.json`,
          );
        }
        const copied = [];
        for (const file of files.sort()) {
          const output = `${destination}/${file.split(path.sep).join("/")}`;
          emit(output, await fs.readFile(path.join(directory, file)));
          copied.push(output.slice("licenses/npm/".length));
        }
        if (manifest.name === "katex") {
          if (manifest.version !== "0.19.0")
            throw new Error(
              `Review KaTeX font notices for ${manifest.version} before distributing its fonts.`,
            );
          const fontNotices = fileURLToPath(
            new URL("./licenses/katex-0.19.0/", import.meta.url),
          );
          for (const file of ["FONT-NOTICES.txt", "OFL.txt", "SOURCE.md"]) {
            const output = `${destination}/fonts/${file}`;
            emit(output, await fs.readFile(path.join(fontNotices, file)));
            copied.push(output.slice("licenses/npm/".length));
          }
        }
        packages.set(id, {
          name: manifest.name,
          version: manifest.version,
          declaredLicense: manifest.license ?? null,
          licenseTextMissing,
          files: [
            ...new Set([...(packages.get(id)?.files ?? []), ...copied]),
          ].sort(),
        });
      }
      emit(
        "licenses/npm/index.json",
        Buffer.from(
          `${JSON.stringify(
            {
              packages: [...packages.values()].sort((a, b) =>
                `${a.name}@${a.version}`.localeCompare(
                  `${b.name}@${b.version}`,
                ),
              ),
            },
            null,
            2,
          )}\n`,
        ),
      );
      emit(
        "licenses/LICENSE",
        await fs.readFile(path.join(repositoryRoot, "LICENSE")),
      );
    },
  };
}
