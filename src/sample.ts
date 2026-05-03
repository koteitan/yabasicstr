export const sampleCode = `REM yabasicstr sample: sign a kind:1 nostr event from BASIC.
REM Provide nsec and content via INPUT (or hard-code below).
INPUT "nsec> ", nsec$
INPUT "content> ", content$

PRINT "--- signed event JSON ---"
LET signed$ = NOSTR_SIGN$(nsec$, content$)
PRINT signed$
PRINT
PRINT "length: "; LEN(signed$)
END
`;
