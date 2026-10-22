# Third-party software

Myriad's source is distributed under the [MIT License](LICENSE). Dependencies
retain their own licenses, copyright notices and attribution requirements. The
exact package versions and integrity hashes are recorded in `pnpm-lock.yaml`.

## Compiler and execution runtime

Myriad uses `@wasm-oj/browser`, `@wasm-oj/server` and
`@wasm-oj/toolchain-clang`. The compiler and execution assets include components
with terms beyond the JavaScript packages' MIT license, including LLVM/Clang,
WASI libc and the runtime's Rust dependency graph.

The installed WASM-OJ packages include `THIRD_PARTY_NOTICES.md`, a `licenses/`
directory and component inventories identifying the upstream source revisions.
The web build copies the browser and Clang packages' complete notice files to:

- `/licenses/wasm-oj/browser/THIRD_PARTY_NOTICES.md`
- `/licenses/wasm-oj/browser/licenses/`
- `/licenses/wasm-oj/toolchain-clang/THIRD_PARTY_NOTICES.md`
- `/licenses/wasm-oj/toolchain-clang/licenses/`

Keep these files with deployments that distribute the matching runtime and
compiler assets. Native runtime builds use the installed server package's
source and Cargo lockfile; its own notices accompany that package.

## Application dependencies

The frontend uses Svelte, CodeMirror, Lucide, KaTeX (including its fonts), Marked,
DOMPurify, PostHog and canvas-confetti. The API uses Hono and Zod. Each installed
package retains its applicable license and notices. During the web build, the
Vite plugin inspects modules actually rendered into browser chunks and copies
their complete upstream license and notice files to `/licenses/npm/`, with
separate directories for each package version. `/licenses/npm/index.json`
records the package versions, declared licenses and copied files. Preserve
this directory alongside the deployed assets.

The inventory follows bundled code, including transitive dependencies; it
does not treat compiler-only dependencies as browser distributions. If a
bundled package omits full license text, the build preserves its original
README and package metadata, emits a warning, and records
`licenseTextMissing: true` in the index. Review such entries against upstream
before distributing; the build does not invent missing license text.

KaTeX fonts use SIL Open Font License 1.1 in addition to the package's MIT
license. The build includes their original embedded copyright and Reserved
Font Name notices, the complete OFL text, and verified source information at
`/licenses/npm/katex@0.19.0/fonts/`. These reviewed files are kept under
`apps/web/scripts/licenses/`; builds need no network access to copy them.

Run `pnpm licenses list` after installation to inspect the broader dependency
inventory, including build tools. The application source license is also
copied to `/licenses/LICENSE`.

The social preview source uses the Geist font from Google Fonts; the running
application uses system fonts. The font's upstream license is SIL Open Font
License 1.1 ([upstream license](https://github.com/google/fonts/blob/main/ofl/geist/OFL.txt)). The Myriad marks in `apps/web/brand/` and `apps/web/public/` are part
of this repository.
