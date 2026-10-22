import { describe, it, expect } from "vitest";
import {
  normalizeOutput,
  sha256Hex,
  innerDigest,
  boundChecksum,
} from "../src/checksum.js";

describe("normalizeOutput", () => {
  it("trims trailing spaces from lines and removes trailing blank lines in trim mode", () => {
    const raw = "hello   \r\nworld  \t  \n\n\n";
    const normalized = normalizeOutput(raw, "trim");
    expect(normalized).toBe("hello\nworld\n");
  });

  it("handles empty output correctly", () => {
    expect(normalizeOutput("", "trim")).toBe("");
    expect(normalizeOutput("\n\n   \n", "trim")).toBe("");
  });

  it("preserves exact output when mode is exact", () => {
    const raw = "hello   \r\nworld  \n\n";
    expect(normalizeOutput(raw, "exact")).toBe(raw);
  });
});

describe("sha256Hex", () => {
  it("hashes only the bytes in a view, including an empty view", async () => {
    const bytes = new TextEncoder().encode("prefix:hello\n:suffix");
    expect(await sha256Hex(bytes.subarray(7, 13))).toBe(
      "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03",
    );
    expect(await sha256Hex(bytes.subarray(7, 7))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("calculates known sha256 vectors", async () => {
    // sha256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const emptyHash = await sha256Hex("");
    expect(emptyHash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );

    // sha256("hello\n") = 5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03
    const helloHash = await sha256Hex("hello\n");
    expect(helloHash).toBe(
      "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03",
    );
  });
});

describe("boundChecksum", () => {
  it("produces deterministic bound checksums", async () => {
    const inner = await innerDigest("42\n");
    const sum1 = await boundChecksum({
      salt: "demo-salt-1234",
      studentId: "B11902001",
      problemId: "aplusb",
      index: 0,
      innerDigest: inner,
    });
    const sum2 = await boundChecksum({
      salt: "demo-salt-1234",
      studentId: "B11902001",
      problemId: "aplusb",
      index: 0,
      innerDigest: inner,
    });
    expect(sum1).toBe(sum2);
    expect(sum1).toMatch(/^[0-9a-f]{64}$/);

    // Different student gets different checksum
    const sumOtherStudent = await boundChecksum({
      salt: "demo-salt-1234",
      studentId: "B11902002",
      problemId: "aplusb",
      index: 0,
      innerDigest: inner,
    });
    expect(sum1).not.toBe(sumOtherStudent);

    // Different test index gets different checksum
    const sumOtherIndex = await boundChecksum({
      salt: "demo-salt-1234",
      studentId: "B11902001",
      problemId: "aplusb",
      index: 1,
      innerDigest: inner,
    });
    expect(sum1).not.toBe(sumOtherIndex);
  });
});
