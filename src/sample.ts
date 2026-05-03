export const sampleCode = `REM Default sample: generate a random nsec and sign "hello world" as kind:1.
REM Press Run -- no stdin required.
LET nsec$    = NOSTR_NSEC$()
LET content$ = "hello world"
LET kind     = 1

PRINT "nsec   : "; nsec$
PRINT "content: "; content$
PRINT "kind   : "; kind
PRINT
PRINT "--- signed event JSON ---"
LET signed$ = NOSTR_SIGN$(nsec$, content$, kind)
PRINT signed$
END
`;
