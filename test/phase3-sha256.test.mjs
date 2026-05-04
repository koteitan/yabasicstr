import test from "node:test";
import assert from "node:assert/strict";
import { runBasic } from "./helpers.mjs";
import { createHash } from "node:crypto";

const sha256hex = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("SHA256$ matches NIST test vectors (empty, abc)", async () => {
  const out = await runBasic(`
PRINT SHA256$("")
PRINT SHA256$("abc")
`);
  assert.equal(
    out,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n" +
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad\n"
  );
});

test("SHA256$ encodes UTF-8 (Japanese, accents) before hashing", async () => {
  const samples = ["やべえ", "こんにちは、世界", "café", "naïve façade"];
  for (const s of samples) {
    const expected = createHash("sha256").update(Buffer.from(s, "utf-8")).digest("hex");
    const out = await runBasic(`PRINT SHA256$("${s}")\n`);
    assert.equal(out.trim(), expected, `mismatch for ${JSON.stringify(s)}`);
  }
});

test("SHA256$ matches Node crypto for ASCII strings of varying length", async () => {
  const samples = [
    "",
    "a",
    "abc",
    "message digest",
    "abcdefghijklmnopqrstuvwxyz",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    "The quick brown fox jumps over the lazy dog",
    "x".repeat(55),  // last byte before 1-block boundary
    "x".repeat(56),  // forces 2 blocks (padding crosses boundary)
    "x".repeat(63),
    "x".repeat(64),
    "x".repeat(65),
    "y".repeat(127),
    "y".repeat(128),
    "y".repeat(255),
    "y".repeat(500),
  ];
  for (const s of samples) {
    const expected = sha256hex(Buffer.from(s, "utf-8"));
    // Embed string as literal — escape backslash and quote (none in our samples).
    const out = await runBasic(`PRINT SHA256$("${s}")\n`);
    assert.equal(out.trim(), expected, `mismatch for length=${s.length}`);
  }
});

test("SHA256_OF_BUF$ over arbitrary bytes", async () => {
  // Fill BUF with 100 distinct byte values, then hash.
  const code = `
LET n = 100
FOR i = 0 TO n - 1
  LET BUF(i) = (i * 37 + 5) MOD 256
NEXT i
LET BUF_LEN = n
PRINT SHA256_OF_BUF$(n)
`;
  const out = await runBasic(code);
  const expectedBytes = new Uint8Array(100);
  for (let i = 0; i < 100; i++) expectedBytes[i] = (i * 37 + 5) % 256;
  const expected = sha256hex(Buffer.from(expectedBytes));
  assert.equal(out.trim(), expected);
});

test("SHA256$ matches Node crypto on 10 random byte sequences", async () => {
  for (let trial = 0; trial < 10; trial++) {
    const len = Math.floor(Math.random() * 200);
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
    const expected = sha256hex(Buffer.from(bytes));
    // Push bytes via BUF rather than as a string literal (avoids quoting issues).
    const lines = [`LET BUF_LEN = ${len}`];
    for (let i = 0; i < len; i++) lines.push(`LET BUF(${i}) = ${bytes[i]}`);
    lines.push(`PRINT SHA256_OF_BUF$(${len})`);
    const out = await runBasic(lines.join("\n") + "\n");
    assert.equal(out.trim(), expected, `trial ${trial}, len=${len}`);
  }
});
