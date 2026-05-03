/**
 * yabasicstr stdlib — auto-prepended to every program.
 *
 * Implements bech32 + hex helpers entirely in BASIC, on top of the language
 * primitives (DIM/SUB/LOCAL/BITAND/SHL/SHR/etc.) provided by the interpreter.
 *
 * Globals exposed to user programs:
 *   - BUF(256), BUF_LEN          : shared byte buffer (8-bit values)
 *   - BECH32_HRP$                : last decoded HRP
 *
 * Subroutines:
 *   - HEX_OF_BUF$(n)             : hex of BUF(0..n-1)
 *   - UNHEX_TO_BUF(s$)           : parse hex string into BUF, returns byte count or -1
 *   - BECH32_ENCODE$(hrp$)       : encode BUF(0..BUF_LEN-1)
 *   - BECH32_DECODE(s$)          : 1=ok / 0=fail; sets BECH32_HRP$, BUF, BUF_LEN
 *   - NSEC_ENCODE$(skhex$)       : 32-byte hex sk -> "nsec1..."
 *   - NSEC_DECODE$(nsec$)        : "nsec1..." -> 64-char hex sk (or "")
 *   - NPUB_ENCODE$(pubhex$)      : 32-byte hex xonly pub -> "npub1..."
 *   - NPUB_DECODE$(npub$)        : "npub1..." -> 64-char hex pub (or "")
 */
export const stdlib = `
LET BECH32_CHARSET$ = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
LET HEX_DIGITS$ = "0123456789abcdef"

DIM BUF(256)
LET BUF_LEN = 0
DIM BECH32_VALS(160)
DIM BECH32_PM(200)
LET BECH32_HRP$ = ""

SUB BECH32_CHAR_INDEX(c$)
  LOCAL j
  FOR j = 0 TO 31
    IF MID$(BECH32_CHARSET$, j+1, 1) = c$ THEN RETURN j
  NEXT j
  RETURN -1
END SUB

SUB BECH32_POLYMOD_BUF(n)
  LOCAL chk, i, b
  LET chk = 1
  FOR i = 0 TO n - 1
    LET b = SHR(chk, 25)
    LET chk = BITXOR(SHL(BITAND(chk, 33554431), 5), BECH32_PM(i))
    IF BITAND(b, 1) <> 0 THEN LET chk = BITXOR(chk, 996825010)
    IF BITAND(b, 2) <> 0 THEN LET chk = BITXOR(chk, 642813549)
    IF BITAND(b, 4) <> 0 THEN LET chk = BITXOR(chk, 513874426)
    IF BITAND(b, 8) <> 0 THEN LET chk = BITXOR(chk, 1027748829)
    IF BITAND(b, 16) <> 0 THEN LET chk = BITXOR(chk, 705979059)
  NEXT i
  RETURN chk
END SUB

SUB BECH32_HRP_EXPAND(hrp$)
  LOCAL h, i, c
  LET h = LEN(hrp$)
  FOR i = 0 TO h - 1
    LET c = ASC(MID$(hrp$, i+1, 1))
    LET BECH32_PM(i) = SHR(c, 5)
    LET BECH32_PM(h + 1 + i) = BITAND(c, 31)
  NEXT i
  LET BECH32_PM(h) = 0
  RETURN 2 * h + 1
END SUB

REM Convert BUF(0..n-1) (8-bit) into BECH32_VALS (5-bit, padded). Returns out length.
SUB BECH32_8TO5(n)
  LOCAL acc, bits, out, i
  LET acc = 0
  LET bits = 0
  LET out = 0
  FOR i = 0 TO n - 1
    LET acc = BITAND(BITOR(SHL(acc, 8), BUF(i)), 4095)
    LET bits = bits + 8
    WHILE bits >= 5
      LET bits = bits - 5
      LET BECH32_VALS(out) = BITAND(SHR(acc, bits), 31)
      LET out = out + 1
    WEND
  NEXT i
  IF bits > 0 THEN
    LET BECH32_VALS(out) = BITAND(SHL(acc, 5 - bits), 31)
    LET out = out + 1
  ENDIF
  RETURN out
END SUB

REM Convert BECH32_VALS(0..n-1) (5-bit) into BUF (8-bit). Returns out length, or -1 on bad pad.
SUB BECH32_5TO8(n)
  LOCAL acc, bits, out, i
  LET acc = 0
  LET bits = 0
  LET out = 0
  FOR i = 0 TO n - 1
    LET acc = BITAND(BITOR(SHL(acc, 5), BECH32_VALS(i)), 4095)
    LET bits = bits + 5
    WHILE bits >= 8
      LET bits = bits - 8
      LET BUF(out) = BITAND(SHR(acc, bits), 255)
      LET out = out + 1
    WEND
  NEXT i
  IF bits >= 5 THEN RETURN -1
  IF bits > 0 THEN
    IF BITAND(SHL(acc, 8 - bits), 255) <> 0 THEN RETURN -1
  ENDIF
  RETURN out
END SUB

SUB BECH32_ENCODE$(hrp$)
  LOCAL nv, pmoff, pm, chk, i, out$
  LET nv = BECH32_8TO5(BUF_LEN)
  LET pmoff = BECH32_HRP_EXPAND(hrp$)
  FOR i = 0 TO nv - 1
    LET BECH32_PM(pmoff + i) = BECH32_VALS(i)
  NEXT i
  FOR i = 0 TO 5
    LET BECH32_PM(pmoff + nv + i) = 0
  NEXT i
  LET pm = BECH32_POLYMOD_BUF(pmoff + nv + 6)
  LET chk = BITXOR(pm, 1)
  FOR i = 0 TO 5
    LET BECH32_VALS(nv + i) = BITAND(SHR(chk, 5 * (5 - i)), 31)
  NEXT i
  LET out$ = hrp$ + "1"
  FOR i = 0 TO nv + 6 - 1
    LET out$ = out$ + MID$(BECH32_CHARSET$, BECH32_VALS(i) + 1, 1)
  NEXT i
  RETURN out$
END SUB

SUB BECH32_FIND_SEP(s$)
  LOCAL i
  FOR i = LEN(s$) - 1 TO 0 STEP -1
    IF MID$(s$, i+1, 1) = "1" THEN RETURN i
  NEXT i
  RETURN -1
END SUB

SUB BECH32_DECODE(s$)
  LOCAL slen, ls$, sep, hrp$, dlen, i, ch$, v, pmoff, pm, vlen, blen
  LET slen = LEN(s$)
  IF slen < 8 THEN RETURN 0
  LET ls$ = LOWER$(s$)
  LET sep = BECH32_FIND_SEP(ls$)
  IF sep < 1 THEN RETURN 0
  IF sep + 7 > slen THEN RETURN 0
  LET hrp$ = LEFT$(ls$, sep)
  LET dlen = slen - sep - 1
  FOR i = 0 TO dlen - 1
    LET ch$ = MID$(ls$, sep + 2 + i, 1)
    LET v = BECH32_CHAR_INDEX(ch$)
    IF v < 0 THEN RETURN 0
    LET BECH32_VALS(i) = v
  NEXT i
  LET pmoff = BECH32_HRP_EXPAND(hrp$)
  FOR i = 0 TO dlen - 1
    LET BECH32_PM(pmoff + i) = BECH32_VALS(i)
  NEXT i
  LET pm = BECH32_POLYMOD_BUF(pmoff + dlen)
  IF pm <> 1 THEN RETURN 0
  LET vlen = dlen - 6
  LET blen = BECH32_5TO8(vlen)
  IF blen < 0 THEN RETURN 0
  LET BECH32_HRP$ = hrp$
  LET BUF_LEN = blen
  RETURN 1
END SUB

SUB HEX_OF_BUF$(n)
  LOCAL out$, i, v
  LET out$ = ""
  FOR i = 0 TO n - 1
    LET v = BUF(i)
    LET out$ = out$ + MID$(HEX_DIGITS$, SHR(v, 4) + 1, 1) + MID$(HEX_DIGITS$, BITAND(v, 15) + 1, 1)
  NEXT i
  RETURN out$
END SUB

SUB HEX_NIBBLE(c$)
  IF c$ >= "0" AND c$ <= "9" THEN RETURN ASC(c$) - 48
  IF c$ >= "a" AND c$ <= "f" THEN RETURN ASC(c$) - 87
  IF c$ >= "A" AND c$ <= "F" THEN RETURN ASC(c$) - 55
  RETURN -1
END SUB

SUB UNHEX_TO_BUF(s$)
  LOCAL n, out, i, hi, lo
  LET n = LEN(s$)
  IF (n MOD 2) <> 0 THEN RETURN -1
  LET out = 0
  FOR i = 0 TO n - 1 STEP 2
    LET hi = HEX_NIBBLE(MID$(s$, i+1, 1))
    LET lo = HEX_NIBBLE(MID$(s$, i+2, 1))
    IF hi < 0 OR lo < 0 THEN RETURN -1
    LET BUF(out) = SHL(hi, 4) + lo
    LET out = out + 1
  NEXT i
  LET BUF_LEN = out
  RETURN out
END SUB

SUB NSEC_ENCODE$(skhex$)
  LOCAL n
  LET n = UNHEX_TO_BUF(skhex$)
  IF n <> 32 THEN RETURN ""
  RETURN BECH32_ENCODE$("nsec")
END SUB

SUB NSEC_DECODE$(nsec$)
  IF BECH32_DECODE(nsec$) = 0 THEN RETURN ""
  IF BECH32_HRP$ <> "nsec" THEN RETURN ""
  IF BUF_LEN <> 32 THEN RETURN ""
  RETURN HEX_OF_BUF$(32)
END SUB

SUB NPUB_ENCODE$(pubhex$)
  LOCAL n
  LET n = UNHEX_TO_BUF(pubhex$)
  IF n <> 32 THEN RETURN ""
  RETURN BECH32_ENCODE$("npub")
END SUB

SUB NPUB_DECODE$(npub$)
  IF BECH32_DECODE(npub$) = 0 THEN RETURN ""
  IF BECH32_HRP$ <> "npub" THEN RETURN ""
  IF BUF_LEN <> 32 THEN RETURN ""
  RETURN HEX_OF_BUF$(32)
END SUB
`;
