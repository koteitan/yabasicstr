// Regression tests for the v0.1.x feature surface — ensure interpreter extensions
// did not break the language or the JS-side nostr builtins.
import test from "node:test";
import assert from "node:assert/strict";
import { runBasic } from "./helpers.mjs";
import { nostrBuiltins } from "../build/yabasic/index.js";
import { generateSecretKey, finalizeEvent, getPublicKey, verifyEvent } from "nostr-tools/pure";
import { nsecEncode } from "nostr-tools/nip19";

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

test("NOSTR_SIGN$ produces a verifiable event with matching pubkey", async () => {
  const sk = generateSecretKey();
  const nsec = nsecEncode(sk);
  const expectedPub = getPublicKey(sk);
  const out = await runBasic(
    `INPUT "n> ", n$\nINPUT "m> ", m$\nPRINT NOSTR_SIGN$(n$, m$)\n`,
    { stdin: [nsec, "hello world"], builtins: nostrBuiltins }
  );
  const evt = JSON.parse(out.slice(out.indexOf("{")));
  assert.equal(evt.kind, 1);
  assert.equal(evt.content, "hello world");
  assert.equal(evt.pubkey, expectedPub);
  assert.ok(verifyEvent(evt), "schnorr verifyEvent failed");
});

test("NOSTR_SIGN$ kind argument and re-finalized id parity", async () => {
  const sk = generateSecretKey();
  const nsec = nsecEncode(sk);
  const out = await runBasic(
    `PRINT NOSTR_SIGN$("${nsec}", "long form", 30023)\n`,
    { builtins: nostrBuiltins }
  );
  const evt = JSON.parse(out.slice(out.indexOf("{")));
  assert.equal(evt.kind, 30023);
  assert.ok(verifyEvent(evt));
  const reEvt = finalizeEvent(
    { kind: evt.kind, created_at: evt.created_at, tags: evt.tags, content: evt.content },
    sk
  );
  assert.equal(reEvt.id, evt.id);
});

test("NOSTR_NSEC$ returns a parseable nsec", async () => {
  const out = await runBasic(`PRINT NOSTR_NSEC$()\n`, { builtins: nostrBuiltins });
  assert.match(out.trim(), /^nsec1[023456789acdefghjklmnpqrstuvwxyz]+$/);
});
