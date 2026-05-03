import test from "node:test";
import assert from "node:assert/strict";
import { runBasic } from "./helpers.mjs";

const hex = (b, len = 64) => b.toString(16).padStart(len, "0");

test("Phase 6: TAGGED_HASH matches noble for known input", { timeout: 60000 }, async () => {
  const { schnorr } = await import("@noble/curves/secp256k1.js");
  // schnorr exposes tagged hash via internal? Use noble's tagSchnorr utility if available.
  // Fall back to manual: SHA256(SHA256(tag)|SHA256(tag)|data)
  const { sha256 } = await import("@noble/hashes/sha2.js");
  const { utf8ToBytes, concatBytes } = await import("@noble/hashes/utils.js");
  const tag = "BIP0340/aux";
  const data = new Uint8Array(32); // 32 zero bytes
  const tagHash = sha256(utf8ToBytes(tag));
  const expected = sha256(concatBytes(tagHash, tagHash, data));
  const expectedHex = Array.from(expected).map(b => b.toString(16).padStart(2, "0")).join("");

  const code = `
FOR i = 0 TO 31
  LET TH_DATA(i) = 0
NEXT i
TAGGED_HASH("BIP0340/aux", 32)
PRINT HEX_OF_BUF$(32)
`;
  const out = await runBasic(code);
  assert.equal(out.trim(), expectedHex);
  // Verify schnorr is reachable for the next test
  assert.equal(typeof schnorr.sign, "function");
});

test("Phase 6: SCHNORR_SIGN matches @noble for fixed sk/msg/aux", { timeout: 600000 }, async () => {
  const { schnorr } = await import("@noble/curves/secp256k1.js");

  // Use small/simple fixed inputs.
  const skBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) skBytes[i] = i + 1;       // sk = 0x0102...20
  const msgBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) msgBytes[i] = (i * 7) & 0xff;
  const auxBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) auxBytes[i] = i;

  const skHex = Array.from(skBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  const msgHex = Array.from(msgBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  const auxHex = Array.from(auxBytes).map(b => b.toString(16).padStart(2, "0")).join("");

  const expected = schnorr.sign(msgBytes, skBytes, auxBytes);
  const expectedHex = Array.from(expected).map(b => b.toString(16).padStart(2, "0")).join("");

  const code = `
BN_LOAD_HEX(0, "${skHex}")
BN_LOAD_HEX(1, "${msgHex}")
BN_LOAD_HEX(2, "${auxHex}")
SCHNORR_SIGN(0, 1, 2, 0)
PRINT HEX_OF_BUF$(64)
`;
  const out = await runBasic(code);
  assert.equal(out.trim(), expectedHex, "BASIC schnorr sig must match @noble/curves");
});
