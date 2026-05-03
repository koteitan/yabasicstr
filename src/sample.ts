export const sampleCode = `REM Default sample: generate a random nsec and sign "hello world" as kind:1.
REM All cryptography (bech32, SHA-256, secp256k1, BIP-340 Schnorr) is implemented in BASIC.
REM First run takes ~60-120s in the tree-walking interpreter.

LET nsec$    = NOSTR_NSEC$()
LET content$ = "hello world"

PRINT "nsec   : "; nsec$
PRINT "content: "; content$
PRINT
PRINT "--- signed event JSON ---"
LET signed$ = NOSTR_SIGN$(nsec$, content$)
PRINT signed$
END
`;
