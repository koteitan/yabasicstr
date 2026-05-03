import test from "node:test";
import assert from "node:assert/strict";
import { runBasic } from "./helpers.mjs";

const hex = (b, len = 64) => b.toString(16).padStart(len, "0");

const G_X = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const G_Y = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

// secp256k1 affine doubling: 2G expected coordinates (well-known).
const TWO_G_X = 0xc6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5n;
const TWO_G_Y = 0x1ae168fea63dc339a3c58419466ceaeef7f632653266d0e1236431a950cfe52an;

test("Phase 5: 1*G yields G in affine coords", { timeout: 60000 }, async () => {
  const out = await runBasic(`
BN_LOAD_HEX(0, "0000000000000000000000000000000000000000000000000000000000000001")
SCALAR_MULT_G_AFFINE(1, 2, 0)
PRINT BN_TO_HEX$(1)
PRINT BN_TO_HEX$(2)
`);
  const [x, y] = out.trim().split("\n");
  assert.equal(x, hex(G_X));
  assert.equal(y, hex(G_Y));
});

test("Phase 5: 2*G matches known doubling", { timeout: 90000 }, async () => {
  const out = await runBasic(`
BN_LOAD_HEX(0, "0000000000000000000000000000000000000000000000000000000000000002")
SCALAR_MULT_G_AFFINE(1, 2, 0)
PRINT BN_TO_HEX$(1)
PRINT BN_TO_HEX$(2)
`);
  const [x, y] = out.trim().split("\n");
  assert.equal(x, hex(TWO_G_X));
  assert.equal(y, hex(TWO_G_Y));
});

test("Phase 5: random scalar matches @noble/curves", { timeout: 600000 }, async () => {
  const { secp256k1 } = await import("@noble/curves/secp256k1.js");
  // Use a small but non-trivial scalar to keep runtime reasonable.
  const skBytes = new Uint8Array(32);
  // Random 32-byte secret
  crypto.getRandomValues(skBytes);
  // Ensure k != 0
  if (skBytes.every((b) => b === 0)) skBytes[31] = 1;
  const skHex = Array.from(skBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const skBig = BigInt("0x" + skHex);
  const point = secp256k1.Point.BASE.multiply(skBig).toAffine();
  const expectedX = hex(point.x);
  const expectedY = hex(point.y);
  const out = await runBasic(`
BN_LOAD_HEX(0, "${skHex}")
SCALAR_MULT_G_AFFINE(1, 2, 0)
PRINT BN_TO_HEX$(1)
PRINT BN_TO_HEX$(2)
`);
  const [x, y] = out.trim().split("\n");
  assert.equal(x, expectedX, `x for sk=${skHex}`);
  assert.equal(y, expectedY, `y for sk=${skHex}`);
});
