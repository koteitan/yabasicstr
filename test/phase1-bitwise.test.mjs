import test from "node:test";
import assert from "node:assert/strict";
import { runBasic } from "./helpers.mjs";

test("BITAND / BITOR / BITXOR / BITNOT", async () => {
  const out = await runBasic(`
PRINT BITAND(12, 10)
PRINT BITOR(12, 10)
PRINT BITXOR(12, 10)
PRINT BITNOT(0)
`);
  assert.equal(out, "8\n14\n6\n4294967295\n");
});

test("SHL / SHR are 32-bit unsigned", async () => {
  const out = await runBasic(`
PRINT SHL(1, 31)
PRINT SHR(SHL(1, 31), 31)
PRINT SHR(4294967295, 1)
`);
  assert.equal(out, "2147483648\n1\n2147483647\n");
});

test("ROTR matches the SHA-256 reference", async () => {
  const out = await runBasic(`
PRINT ROTR(2863311530, 1)
PRINT ROTR(1, 1)
PRINT ROTL(2147483648, 1)
`);
  // 2863311530 = 0xAAAAAAAA -> ROTR 1 -> 0x55555555 = 1431655765
  // ROTR(1,1) = 0x80000000 = 2147483648
  // ROTL(0x80000000, 1) = 1
  assert.equal(out, "1431655765\n2147483648\n1\n");
});

test("ADD32 wraps at 2^32", async () => {
  const out = await runBasic(`
PRINT ADD32(4294967295, 1)
PRINT ADD32(2147483648, 2147483648)
PRINT ADD32(123456, 654321)
`);
  assert.equal(out, "0\n0\n777777\n");
});

test("RAND_BYTE returns an integer in 0..255", async () => {
  const out = await runBasic(`
DIM hist(256)
FOR i = 1 TO 200
  LET b = RAND_BYTE()
  hist(b) = hist(b) + 1
NEXT i
LET min = 999999
LET max = -1
FOR i = 0 TO 255
  IF hist(i) < min THEN LET min = hist(i)
  IF hist(i) > max THEN LET max = hist(i)
NEXT i
PRINT "min="; min; " max="; max
`);
  // We just check the output format and that loop completed; randomness uniformity is not asserted.
  assert.match(out, /^min=\d+ max=\d+\n$/);
});
