/**
 * Checksum and normalization protocol for Myriad.
 * Uses WebCrypto (crypto.subtle) so it works seamlessly in Browser, Node.js, and Cloudflare Workers.
 */

export type NormalizeMode = "trim" | "exact";

/**
 * Normalizes stdout text before hashing.
 * - 'trim': Strip trailing whitespace from each line, drop trailing empty lines, and normalize line endings to '\n'.
 * - 'exact': Keep output exactly as produced.
 */
export function normalizeOutput(
  text: string,
  mode: NormalizeMode = "trim",
): string {
  if (mode === "exact") return text;

  // Split lines on CR, LF, or CRLF
  const lines = text.split(/\r?\n/);
  // Trim trailing whitespace on each line
  const trimmedLines = lines.map((line) => line.trimEnd());

  // Drop trailing empty lines
  while (
    trimmedLines.length > 0 &&
    trimmedLines[trimmedLines.length - 1] === ""
  ) {
    trimmedLines.pop();
  }

  // Join lines with single \n and add a final \n if non-empty
  if (trimmedLines.length === 0) return "";
  return trimmedLines.join("\n") + "\n";
}

/**
 * Calculates SHA-256 hex digest using WebCrypto (crypto.subtle).
 */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Calculates inner digest for a test case output.
 */
export async function innerDigest(
  output: string,
  mode: NormalizeMode = "trim",
): Promise<string> {
  const normalized = normalizeOutput(output, mode);
  return sha256Hex(normalized);
}

export interface BoundChecksumParams {
  salt: string;
  studentId: string;
  problemId: string;
  index: number;
  innerDigest: string;
}

/**
 * Calculates the bound checksum:
 * hex(SHA256("lj-v1\0" + salt + "\0" + studentId + "\0" + problemId + "\0" + index + "\0" + innerDigest))
 *
 * This binds the testcase result to the exam salt, the student, and the specific test index,
 * preventing cross-student copy-pasting of submitted checksums.
 *
 * "lj-v1" is a frozen protocol tag from before the rename to Myriad. Browsers,
 * the Worker and offline verification must agree on it, so changing it would
 * invalidate every stored claim; a new tag needs a new protocol version.
 */
export async function boundChecksum(
  params: BoundChecksumParams,
): Promise<string> {
  const payload = [
    "lj-v1",
    params.salt,
    params.studentId,
    params.problemId,
    params.index.toString(),
    params.innerDigest,
  ].join("\0");
  return sha256Hex(payload);
}
