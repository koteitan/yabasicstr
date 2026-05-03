import test from "node:test";
import assert from "node:assert/strict";
import { runBasic } from "./helpers.mjs";

test("DIM numeric array: declare, assign, read", async () => {
  const out = await runBasic(`
DIM a(4)
a(0) = 11
a(1) = 22
a(2) = a(0) + a(1)
PRINT a(0); ","; a(1); ","; a(2)
`);
  assert.equal(out, "11,22,33\n");
});

test("DIM string array: declare, assign, read", async () => {
  const out = await runBasic(`
DIM s$(3)
s$(0) = "alpha"
s$(2) = s$(0) + "-end"
PRINT s$(0); "/"; s$(1); "/"; s$(2)
`);
  assert.equal(out, "alpha//alpha-end\n");
});

test("array out-of-range raises runtime error", async () => {
  await assert.rejects(
    runBasic(`DIM a(3)\nPRINT a(5)\n`),
    /array index out of range/
  );
});

test("SUB with no args returning a constant", async () => {
  const out = await runBasic(`
SUB answer()
  RETURN 42
END SUB
PRINT answer()
`);
  assert.equal(out, "42\n");
});

test("SUB with numeric params", async () => {
  const out = await runBasic(`
SUB add(x, y)
  RETURN x + y
END SUB
PRINT add(3, 4); " "; add(10, -5)
`);
  assert.equal(out, "7 5\n");
});

test("SUB with string params and string return", async () => {
  const out = await runBasic(`
SUB greet$(name$)
  RETURN "hi, " + name$
END SUB
PRINT greet$("alice")
`);
  assert.equal(out, "hi, alice\n");
});

test("SUB locals do not leak; globals visible from within SUB", async () => {
  const out = await runBasic(`
LET g = 100
SUB bump(x)
  LET g = g + x
  RETURN g
END SUB
PRINT bump(1)
PRINT bump(2)
PRINT g
`);
  assert.equal(out, "101\n103\n103\n");
});

test("SUB parameter shadows global of same name", async () => {
  const out = await runBasic(`
LET x = 999
SUB doubleIt(x)
  RETURN x * 2
END SUB
PRINT doubleIt(7)
PRINT x
`);
  assert.equal(out, "14\n999\n");
});

test("RETURN exits the SUB early", async () => {
  const out = await runBasic(`
SUB sgn(n)
  IF n > 0 THEN RETURN 1
  IF n < 0 THEN RETURN -1
  RETURN 0
END SUB
PRINT sgn(7); ","; sgn(0); ","; sgn(-3)
`);
  assert.equal(out, "1,0,-1\n");
});

test("SUB can be called before its definition (forward reference)", async () => {
  const out = await runBasic(`
PRINT square(6)
SUB square(x)
  RETURN x * x
END SUB
`);
  assert.equal(out, "36\n");
});

test("array operations inside SUB modify global array", async () => {
  const out = await runBasic(`
DIM h(4)
SUB setit(i, v)
  h(i) = v
  RETURN 0
END SUB
LET _ = setit(0, 5)
LET _ = setit(1, 9)
PRINT h(0); ","; h(1)
`);
  assert.equal(out, "5,9\n");
});
