import test from "node:test";
import assert from "node:assert/strict";
import { runBasic } from "./helpers.mjs";

test("Phase 7: NOSTR_NSEC$ returns a parseable nsec", { timeout: 60000 }, async () => {
  const out = await runBasic(`PRINT NOSTR_NSEC$()\n`);
  assert.match(out.trim(), /^nsec1[023456789acdefghjklmnpqrstuvwxyz]+$/);
});

test("Phase 7: NOSTR_SIGN$ produces a valid kind-1 event", { timeout: 600000 }, async () => {
  const { schnorr } = await import("@noble/curves/secp256k1.js");
  const { decode } = await import("nostr-tools/nip19");
  const { getPublicKey } = await import("nostr-tools/pure");

  const out = await runBasic(`
LET nsec$ = NOSTR_NSEC$()
PRINT nsec$
PRINT NOSTR_SIGN$(nsec$, "hello from BASIC")
`);
  const lines = out.trim().split("\n");
  const nsec = lines[0];
  const json = lines.slice(1).join("\n");
  const evt = JSON.parse(json);

  assert.equal(evt.kind, 1);
  assert.equal(evt.content, "hello from BASIC");
  assert.equal(typeof evt.id, "string");
  assert.equal(evt.id.length, 64);
  assert.equal(typeof evt.pubkey, "string");
  assert.equal(evt.pubkey.length, 64);
  assert.equal(typeof evt.sig, "string");
  assert.equal(evt.sig.length, 128);
  assert.deepEqual(evt.tags, []);

  // Pubkey must match the derived BIP-340 pubkey for the embedded nsec
  const decoded = decode(nsec);
  assert.equal(decoded.type, "nsec");
  const expectedPub = getPublicKey(decoded.data);
  assert.equal(evt.pubkey, expectedPub);

  // Recompute the canonical id and check schnorr sig
  const canonical = JSON.stringify([
    0,
    evt.pubkey,
    evt.created_at,
    evt.kind,
    evt.tags,
    evt.content,
  ]);
  const { sha256 } = await import("@noble/hashes/sha2.js");
  const id = Array.from(sha256(new TextEncoder().encode(canonical)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  assert.equal(evt.id, id, "BASIC-computed id must match SHA-256 of canonical");
  const hexToBytes = (h) => {
    const arr = new Uint8Array(h.length / 2);
    for (let k = 0; k < arr.length; k++) arr[k] = parseInt(h.slice(k * 2, k * 2 + 2), 16);
    return arr;
  };
  assert.ok(
    schnorr.verify(hexToBytes(evt.sig), hexToBytes(evt.id), hexToBytes(evt.pubkey)),
    "BASIC-computed schnorr signature must verify"
  );
});

test("Phase 7: NOSTR_SIGN_KIND$ supports custom kinds", { timeout: 600000 }, async () => {
  const { schnorr } = await import("@noble/curves/secp256k1.js");

  const out = await runBasic(`
LET nsec$ = NOSTR_NSEC$()
PRINT NOSTR_SIGN_KIND$(nsec$, "long-form note", 30023)
`);
  const evt = JSON.parse(out.trim());
  assert.equal(evt.kind, 30023);
  assert.equal(evt.content, "long-form note");
  const hexToBytes = (h) => {
    const arr = new Uint8Array(h.length / 2);
    for (let k = 0; k < arr.length; k++) arr[k] = parseInt(h.slice(k * 2, k * 2 + 2), 16);
    return arr;
  };
  assert.ok(schnorr.verify(hexToBytes(evt.sig), hexToBytes(evt.id), hexToBytes(evt.pubkey)));
});
