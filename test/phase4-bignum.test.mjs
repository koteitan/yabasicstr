import test from "node:test";
import assert from "node:assert/strict";
import { runBasic } from "./helpers.mjs";

const P = (1n << 256n) - (1n << 32n) - 977n;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

const hex = (b, len = 64) => b.toString(16).padStart(len, "0");
const rand256 = () => {
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 32n) | BigInt(Math.floor(Math.random() * 0x100000000));
  return v;
};

test("BN_LOAD_HEX / BN_TO_HEX$ round trip", async () => {
  const samples = [
    "0000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000001",
    "fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe",
    hex(P),
    hex(N),
    hex(P - 1n),
    hex(N - 1n),
  ];
  const code = samples
    .map((h, i) => `BN_LOAD_HEX(${i}, "${h}")\nPRINT BN_TO_HEX$(${i})`)
    .join("\n");
  const out = await runBasic(code + "\n");
  const lines = out.trim().split("\n");
  for (let i = 0; i < samples.length; i++) {
    assert.equal(lines[i], samples[i]);
  }
});

test("BN_LOAD_BUF_BE / BN_STORE_BUF_BE round trip", async () => {
  const v = rand256();
  const h = hex(v);
  const code = `
BN_LOAD_HEX(0, "${h}")
BN_STORE_BUF_BE(0, 0)
PRINT HEX_OF_BUF$(32)
LET _ = BN_LOAD_BUF_BE(1, 0)
PRINT BN_TO_HEX$(1)
`;
  const out = await runBasic(code);
  const [bufHex, bnHex] = out.trim().split("\n");
  assert.equal(bufHex, h);
  assert.equal(bnHex, h);
});

test("BN_IS_ZERO and BN_CMP", async () => {
  const out = await runBasic(`
BN_LOAD_HEX(0, "0000000000000000000000000000000000000000000000000000000000000000")
BN_LOAD_HEX(1, "0000000000000000000000000000000000000000000000000000000000000001")
BN_LOAD_HEX(2, "fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe")
PRINT BN_IS_ZERO(0); ","; BN_IS_ZERO(1); ","; BN_IS_ZERO(2)
PRINT BN_CMP(0, 1)
PRINT BN_CMP(1, 0)
PRINT BN_CMP(0, 0)
PRINT BN_CMP(1, 2)
PRINT BN_CMP(2, 1)
`);
  assert.equal(
    out,
    "1,0,0\n-1\n1\n0\n-1\n1\n"
  );
});

test("BN_ADD with carry-out", async () => {
  for (let trial = 0; trial < 5; trial++) {
    const a = rand256();
    const b = rand256();
    const sum = a + b;
    const wrapped = sum % (1n << 256n);
    const carry = sum >> 256n;
    const out = await runBasic(`
BN_LOAD_HEX(0, "${hex(a)}")
BN_LOAD_HEX(1, "${hex(b)}")
LET c = BN_ADD(2, 0, 1)
PRINT c; ":"; BN_TO_HEX$(2)
`);
    const [carryStr, hexRes] = out.trim().split(":");
    assert.equal(BigInt(carryStr), carry, `trial ${trial} carry`);
    assert.equal(hexRes, hex(wrapped), `trial ${trial} sum`);
  }
});

test("BN_SUB with borrow-out", async () => {
  for (let trial = 0; trial < 5; trial++) {
    const a = rand256();
    const b = rand256();
    const wrapped = (a - b + (1n << 256n)) % (1n << 256n);
    const borrow = a < b ? 1n : 0n;
    const out = await runBasic(`
BN_LOAD_HEX(0, "${hex(a)}")
BN_LOAD_HEX(1, "${hex(b)}")
LET c = BN_SUB(2, 0, 1)
PRINT c; ":"; BN_TO_HEX$(2)
`);
    const [borrowStr, hexRes] = out.trim().split(":");
    assert.equal(BigInt(borrowStr), borrow, `trial ${trial} borrow`);
    assert.equal(hexRes, hex(wrapped), `trial ${trial} diff`);
  }
});

test("BN_MUL_WIDE matches BigInt full product", async () => {
  for (let trial = 0; trial < 3; trial++) {
    const a = rand256();
    const b = rand256();
    const product = a * b; // up to 512 bits
    const code = `
BN_LOAD_HEX(0, "${hex(a)}")
BN_LOAD_HEX(1, "${hex(b)}")
BN_MUL_WIDE(0, 1)
REM Print 32 limbs of BN_WIDE in low-to-high order
LET out$ = ""
FOR i = 0 TO 31
  LET h = INT(BN_WIDE(i) / 256)
  LET l = BN_WIDE(i) - h * 256
  LET out$ = out$ + MID$(HEX_DIGITS$, INT(h/16) + 1, 1) + MID$(HEX_DIGITS$, h MOD 16 + 1, 1) + MID$(HEX_DIGITS$, INT(l/16) + 1, 1) + MID$(HEX_DIGITS$, l MOD 16 + 1, 1)
NEXT i
PRINT out$
`;
    const out = await runBasic(code);
    const allLimbsHex = out.trim();
    // Reconstruct BigInt from hex (LE limb order, each limb is 4 hex chars BE-byte)
    let reconstructed = 0n;
    for (let i = 0; i < 32; i++) {
      const limbHex = allLimbsHex.slice(i * 4, i * 4 + 4);
      const limbVal = BigInt("0x" + limbHex);
      reconstructed |= limbVal << BigInt(i * 16);
    }
    assert.equal(reconstructed, product, `trial ${trial}`);
  }
});

test("BN_MOD_P_FROM_WIDE matches BigInt mod p", async () => {
  for (let trial = 0; trial < 5; trial++) {
    const a = rand256();
    const b = rand256();
    const expected = (a * b) % P;
    const out = await runBasic(`
BN_LOAD_HEX(0, "${hex(a)}")
BN_LOAD_HEX(1, "${hex(b)}")
BN_MUL_MOD_P(2, 0, 1)
PRINT BN_TO_HEX$(2)
`);
    assert.equal(out.trim(), hex(expected), `trial ${trial}`);
  }
});

test("BN_MOD_N_FROM_WIDE matches BigInt mod n", async () => {
  for (let trial = 0; trial < 3; trial++) {
    const a = rand256();
    const b = rand256();
    const expected = (a * b) % N;
    const out = await runBasic(`
BN_LOAD_HEX(0, "${hex(a)}")
BN_LOAD_HEX(1, "${hex(b)}")
BN_MUL_MOD_N(2, 0, 1)
PRINT BN_TO_HEX$(2)
`);
    assert.equal(out.trim(), hex(expected), `trial ${trial}`);
  }
});

test("BN_ADD_MOD_P / BN_SUB_MOD_P", async () => {
  const a = rand256() % P;
  const b = rand256() % P;
  const sum = (a + b) % P;
  const diff = (a - b + P) % P;
  const out = await runBasic(`
BN_LOAD_HEX(0, "${hex(a)}")
BN_LOAD_HEX(1, "${hex(b)}")
BN_ADD_MOD_P(2, 0, 1)
PRINT BN_TO_HEX$(2)
BN_SUB_MOD_P(3, 0, 1)
PRINT BN_TO_HEX$(3)
`);
  const [sumHex, diffHex] = out.trim().split("\n");
  assert.equal(sumHex, hex(sum));
  assert.equal(diffHex, hex(diff));
});

test("BN_INV_MOD_P: a * inv(a) = 1 mod p", async () => {
  for (let trial = 0; trial < 2; trial++) {
    const a = (rand256() % (P - 2n)) + 1n;
    const out = await runBasic(`
BN_LOAD_HEX(0, "${hex(a)}")
BN_INV_MOD_P(1, 0)
BN_MUL_MOD_P(2, 0, 1)
PRINT BN_TO_HEX$(2)
`);
    assert.equal(out.trim(), hex(1n), `trial ${trial}: a * inv(a) should be 1`);
  }
});
