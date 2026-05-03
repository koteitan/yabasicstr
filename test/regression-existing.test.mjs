// Regression tests for v0.1.x language features (no nostr-specific assertions —
// those moved into phase7-nostr.test.mjs once NOSTR_NSEC$ / NOSTR_SIGN$ became
// pure BASIC SUBs).
import test from "node:test";
import assert from "node:assert/strict";
import { runBasic } from "./helpers.mjs";

test("PRINT, arithmetic, string concat", async () => {
  const out = await runBasic(`PRINT 1+2*3\nPRINT "hello"\n`);
  assert.equal(out, "7\nhello\n");
});

test("IF/ELSE block, FOR/NEXT, WHILE/WEND, MID$/LEN", async () => {
  const out = await runBasic(`
IF 3 > 2 THEN
  PRINT "yes"
ELSE
  PRINT "no"
ENDIF
FOR i = 1 TO 3
  PRINT i
NEXT i
LET n = 0
WHILE n < 2
  LET n = n + 1
  PRINT n
WEND
PRINT MID$("hello", 2, 3); " "; LEN("hello")
`);
  assert.equal(out, "yes\n1\n2\n3\n1\n2\nell 5\n");
});

test("INPUT prompt prints to output", async () => {
  const out = await runBasic(
    `INPUT "name> ", n$\nPRINT "hi, "; n$\n`,
    { stdin: ["alice"] }
  );
  assert.equal(out, "name> hi, alice\n");
});
