import test from "node:test";
import assert from "node:assert/strict";
import { runBasic } from "./helpers.mjs";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nsecEncode, npubEncode, decode } from "nostr-tools/nip19";

const bytesToHex = (b) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

test("HEX_OF_BUF$ + UNHEX_TO_BUF round trip", async () => {
  const out = await runBasic(`
LET n = UNHEX_TO_BUF("deadbeefcafe0011")
PRINT n
PRINT HEX_OF_BUF$(n)
PRINT UNHEX_TO_BUF("zz")
PRINT UNHEX_TO_BUF("abc")
`);
  assert.equal(out, "8\ndeadbeefcafe0011\n-1\n-1\n");
});

test("UNHEX_TO_BUF accepts uppercase hex", async () => {
  const out = await runBasic(`
LET n = UNHEX_TO_BUF("DEADBEEF")
PRINT HEX_OF_BUF$(n)
`);
  assert.equal(out, "deadbeef\n");
});

test("NSEC_ENCODE$ matches nostr-tools nsecEncode for fixed sk", async () => {
  const sk = new Uint8Array(32);
  for (let i = 0; i < 32; i++) sk[i] = i + 1;
  const expected = nsecEncode(sk);
  const skhex = bytesToHex(sk);
  const out = await runBasic(`PRINT NSEC_ENCODE$("${skhex}")\n`);
  assert.equal(out.trim(), expected);
});

test("NSEC_DECODE$ matches nostr-tools nip19.decode for fixed nsec", async () => {
  const sk = new Uint8Array(32);
  for (let i = 0; i < 32; i++) sk[i] = (i * 7 + 3) & 0xff;
  const nsec = nsecEncode(sk);
  const expectedHex = bytesToHex(sk);
  const out = await runBasic(`PRINT NSEC_DECODE$("${nsec}")\n`);
  assert.equal(out.trim(), expectedHex);
});

test("NSEC encode/decode round-trip on 20 random keys", async () => {
  const keys = Array.from({ length: 20 }, () => generateSecretKey());
  const lines = keys
    .map((sk) => `PRINT NSEC_ENCODE$("${bytesToHex(sk)}")`)
    .join("\n");
  const out = await runBasic(lines + "\n");
  const lines2 = out.trim().split("\n");
  assert.equal(lines2.length, keys.length);
  for (let i = 0; i < keys.length; i++) {
    assert.equal(lines2[i], nsecEncode(keys[i]));
    const dec = decode(lines2[i]);
    assert.equal(dec.type, "nsec");
    assert.equal(bytesToHex(dec.data), bytesToHex(keys[i]));
  }
});

test("NPUB_ENCODE$/NPUB_DECODE$ for fixed pubkey", async () => {
  const sk = generateSecretKey();
  const pub = getPublicKey(sk); // hex string
  const expected = npubEncode(pub);
  const out = await runBasic(`
LET enc$ = NPUB_ENCODE$("${pub}")
PRINT enc$
PRINT NPUB_DECODE$(enc$)
`);
  const [encLine, decLine] = out.trim().split("\n");
  assert.equal(encLine, expected);
  assert.equal(decLine, pub);
});

test("BECH32_DECODE returns 0 for malformed input", async () => {
  const out = await runBasic(`
PRINT BECH32_DECODE("not a bech32 string")
PRINT BECH32_DECODE("nsec1abc")
`);
  // First line: missing separator '1' after a valid hrp segment yields 0;
  // second line: too short for a valid checksum -> 0.
  assert.equal(out, "0\n0\n");
});

test("BECH32_DECODE rejects bad checksum (single-bit flip)", async () => {
  const sk = generateSecretKey();
  const nsec = nsecEncode(sk);
  // Flip the last character of nsec to a different valid charset char.
  const charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const lastIdx = nsec.length - 1;
  const lastCh = nsec[lastIdx];
  const next = charset[(charset.indexOf(lastCh) + 1) % 32];
  const corrupted = nsec.slice(0, -1) + next;
  const out = await runBasic(`PRINT BECH32_DECODE("${corrupted}")\n`);
  assert.equal(out, "0\n");
});

test("NSEC_DECODE$ rejects npub (wrong hrp)", async () => {
  const sk = generateSecretKey();
  const pub = getPublicKey(sk);
  const npub = npubEncode(pub);
  const out = await runBasic(`PRINT "[" + NSEC_DECODE$("${npub}") + "]"\n`);
  assert.equal(out, "[]\n");
});

test("BECH32_DECODE accepts mixed case input by lowercasing", async () => {
  const sk = generateSecretKey();
  const nsec = nsecEncode(sk);
  const expectedHex = bytesToHex(sk);
  // Uppercase the body (after the separator).
  const sep = nsec.lastIndexOf("1");
  const upper = nsec.slice(0, sep + 1) + nsec.slice(sep + 1).toUpperCase();
  const out = await runBasic(`PRINT NSEC_DECODE$("${upper}")\n`);
  assert.equal(out.trim(), expectedHex);
});
