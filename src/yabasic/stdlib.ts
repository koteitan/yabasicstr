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

DIM BUF(2048)
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

REM ===========================================================
REM SHA-256 (FIPS 180-4) implemented in BASIC.
REM Operates on the shared BUF byte buffer.
REM ===========================================================

DIM SHA_K(64)
DIM SHA_H(8)
DIM SHA_W(64)

LET SHA_K(0)  = 1116352408
LET SHA_K(1)  = 1899447441
LET SHA_K(2)  = 3049323471
LET SHA_K(3)  = 3921009573
LET SHA_K(4)  = 961987163
LET SHA_K(5)  = 1508970993
LET SHA_K(6)  = 2453635748
LET SHA_K(7)  = 2870763221
LET SHA_K(8)  = 3624381080
LET SHA_K(9)  = 310598401
LET SHA_K(10) = 607225278
LET SHA_K(11) = 1426881987
LET SHA_K(12) = 1925078388
LET SHA_K(13) = 2162078206
LET SHA_K(14) = 2614888103
LET SHA_K(15) = 3248222580
LET SHA_K(16) = 3835390401
LET SHA_K(17) = 4022224774
LET SHA_K(18) = 264347078
LET SHA_K(19) = 604807628
LET SHA_K(20) = 770255983
LET SHA_K(21) = 1249150122
LET SHA_K(22) = 1555081692
LET SHA_K(23) = 1996064986
LET SHA_K(24) = 2554220882
LET SHA_K(25) = 2821834349
LET SHA_K(26) = 2952996808
LET SHA_K(27) = 3210313671
LET SHA_K(28) = 3336571891
LET SHA_K(29) = 3584528711
LET SHA_K(30) = 113926993
LET SHA_K(31) = 338241895
LET SHA_K(32) = 666307205
LET SHA_K(33) = 773529912
LET SHA_K(34) = 1294757372
LET SHA_K(35) = 1396182291
LET SHA_K(36) = 1695183700
LET SHA_K(37) = 1986661051
LET SHA_K(38) = 2177026350
LET SHA_K(39) = 2456956037
LET SHA_K(40) = 2730485921
LET SHA_K(41) = 2820302411
LET SHA_K(42) = 3259730800
LET SHA_K(43) = 3345764771
LET SHA_K(44) = 3516065817
LET SHA_K(45) = 3600352804
LET SHA_K(46) = 4094571909
LET SHA_K(47) = 275423344
LET SHA_K(48) = 430227734
LET SHA_K(49) = 506948616
LET SHA_K(50) = 659060556
LET SHA_K(51) = 883997877
LET SHA_K(52) = 958139571
LET SHA_K(53) = 1322822218
LET SHA_K(54) = 1537002063
LET SHA_K(55) = 1747873779
LET SHA_K(56) = 1955562222
LET SHA_K(57) = 2024104815
LET SHA_K(58) = 2227730452
LET SHA_K(59) = 2361852424
LET SHA_K(60) = 2428436474
LET SHA_K(61) = 2756734187
LET SHA_K(62) = 3204031479
LET SHA_K(63) = 3329325298

SUB SHA256_RESET_H()
  LET SHA_H(0) = 1779033703
  LET SHA_H(1) = 3144134277
  LET SHA_H(2) = 1013904242
  LET SHA_H(3) = 2773480762
  LET SHA_H(4) = 1359893119
  LET SHA_H(5) = 2600822924
  LET SHA_H(6) = 528734635
  LET SHA_H(7) = 1541459225
  RETURN 0
END SUB

REM Process one 64-byte block of BUF starting at offset off.
SUB SHA256_PROCESS_BLOCK(off)
  LOCAL i, j, t1, t2, a, b, c, d, e, f, g, h, ch, mj, s0, s1, ww0, ww1
  FOR i = 0 TO 15
    LET j = off + i * 4
    LET SHA_W(i) = BITOR(BITOR(BITOR(SHL(BUF(j), 24), SHL(BUF(j+1), 16)), SHL(BUF(j+2), 8)), BUF(j+3))
  NEXT i
  FOR i = 16 TO 63
    LET ww0 = SHA_W(i - 15)
    LET ww1 = SHA_W(i - 2)
    LET s0 = BITXOR(BITXOR(ROTR(ww0, 7), ROTR(ww0, 18)), SHR(ww0, 3))
    LET s1 = BITXOR(BITXOR(ROTR(ww1, 17), ROTR(ww1, 19)), SHR(ww1, 10))
    LET SHA_W(i) = ADD32(ADD32(ADD32(SHA_W(i - 16), s0), SHA_W(i - 7)), s1)
  NEXT i
  LET a = SHA_H(0)
  LET b = SHA_H(1)
  LET c = SHA_H(2)
  LET d = SHA_H(3)
  LET e = SHA_H(4)
  LET f = SHA_H(5)
  LET g = SHA_H(6)
  LET h = SHA_H(7)
  FOR i = 0 TO 63
    LET s1 = BITXOR(BITXOR(ROTR(e, 6), ROTR(e, 11)), ROTR(e, 25))
    LET ch = BITXOR(BITAND(e, f), BITAND(BITNOT(e), g))
    LET t1 = ADD32(ADD32(ADD32(ADD32(h, s1), ch), SHA_K(i)), SHA_W(i))
    LET s0 = BITXOR(BITXOR(ROTR(a, 2), ROTR(a, 13)), ROTR(a, 22))
    LET mj = BITXOR(BITXOR(BITAND(a, b), BITAND(a, c)), BITAND(b, c))
    LET t2 = ADD32(s0, mj)
    LET h = g
    LET g = f
    LET f = e
    LET e = ADD32(d, t1)
    LET d = c
    LET c = b
    LET b = a
    LET a = ADD32(t1, t2)
  NEXT i
  LET SHA_H(0) = ADD32(SHA_H(0), a)
  LET SHA_H(1) = ADD32(SHA_H(1), b)
  LET SHA_H(2) = ADD32(SHA_H(2), c)
  LET SHA_H(3) = ADD32(SHA_H(3), d)
  LET SHA_H(4) = ADD32(SHA_H(4), e)
  LET SHA_H(5) = ADD32(SHA_H(5), f)
  LET SHA_H(6) = ADD32(SHA_H(6), g)
  LET SHA_H(7) = ADD32(SHA_H(7), h)
  RETURN 0
END SUB

REM Compute SHA-256 of BUF(0..n-1). Pads in place, then writes 32-byte hash to BUF(0..31).
REM Caller must ensure BUF has room for the padded message (n + 9 rounded up to multiple of 64).
SUB SHA256_OF_BUF(n)
  LOCAL pad_n, num_blocks, i, w
  LET pad_n = INT((n + 9 + 63) / 64) * 64
  LET BUF(n) = 128
  FOR i = n + 1 TO pad_n - 9
    LET BUF(i) = 0
  NEXT i
  FOR i = pad_n - 8 TO pad_n - 5
    LET BUF(i) = 0
  NEXT i
  LET w = n * 8
  LET BUF(pad_n - 4) = BITAND(SHR(w, 24), 255)
  LET BUF(pad_n - 3) = BITAND(SHR(w, 16), 255)
  LET BUF(pad_n - 2) = BITAND(SHR(w, 8), 255)
  LET BUF(pad_n - 1) = BITAND(w, 255)
  SHA256_RESET_H()
  LET num_blocks = pad_n / 64
  FOR i = 0 TO num_blocks - 1
    SHA256_PROCESS_BLOCK(i * 64)
  NEXT i
  FOR i = 0 TO 7
    LET w = SHA_H(i)
    LET BUF(i*4)   = BITAND(SHR(w, 24), 255)
    LET BUF(i*4+1) = BITAND(SHR(w, 16), 255)
    LET BUF(i*4+2) = BITAND(SHR(w, 8), 255)
    LET BUF(i*4+3) = BITAND(w, 255)
  NEXT i
  LET BUF_LEN = 32
  RETURN 32
END SUB

SUB SHA256_OF_BUF$(n)
  LET _ = SHA256_OF_BUF(n)
  RETURN HEX_OF_BUF$(32)
END SUB

REM SHA-256 of a string. The string is encoded as UTF-8 (BMP code units) before hashing,
REM so multibyte characters (Japanese etc.) produce the same digest as Node / browser
REM utf8.encode + SHA-256.
REM Surrogate pairs (code >= 0xD800) are passed through as-is per code unit, which is
REM the same behavior as TextEncoder for unpaired surrogates being replaced with U+FFFD —
REM we keep raw bytes for simplicity. Pair-combined astral chars are not handled here.
SUB SHA256$(s$)
  LOCAL i, n, code, pos
  LET n = LEN(s$)
  LET pos = 0
  FOR i = 0 TO n - 1
    LET code = ASC(MID$(s$, i+1, 1))
    IF code < 128 THEN
      LET BUF(pos) = code
      LET pos = pos + 1
    ELSE
      IF code < 2048 THEN
        LET BUF(pos) = 192 + INT(code / 64)
        LET BUF(pos + 1) = 128 + (code MOD 64)
        LET pos = pos + 2
      ELSE
        LET BUF(pos) = 224 + INT(code / 4096)
        LET BUF(pos + 1) = 128 + (INT(code / 64) MOD 64)
        LET BUF(pos + 2) = 128 + (code MOD 64)
        LET pos = pos + 3
      ENDIF
    ENDIF
  NEXT i
  LET BUF_LEN = pos
  RETURN SHA256_OF_BUF$(pos)
END SUB

REM ===========================================================
REM 256-bit big-integer arithmetic.
REM Numbers are represented as 16 little-endian limbs of 16 bits each.
REM Register file: BN(r*16 .. r*16+15) for register r in 0..31.
REM Wide products (512-bit) live in BN_WIDE(0..31).
REM
REM Reserved registers (loaded once at stdlib init):
REM   28 = BN_R_P  : secp256k1 prime p
REM   29 = BN_R_N  : secp256k1 group order n
REM Other registers are scratch / user-allocated.
REM ===========================================================

DIM BN(512)
DIM BN_WIDE(32)
DIM BN_TMP1(16)
DIM BN_TMP2(16)
DIM BN_SHIFTED(32)

LET BN_R_P = 28
LET BN_R_N = 29
LET BN_R_TMP_A = 30
LET BN_R_TMP_B = 31

REM Zero out a register.
SUB BN_ZERO(r)
  LOCAL i, base
  LET base = r * 16
  FOR i = 0 TO 15
    LET BN(base + i) = 0
  NEXT i
  RETURN 0
END SUB

REM Copy register rsrc to rdst.
SUB BN_COPY(rdst, rsrc)
  LOCAL i, b1, b2
  LET b1 = rdst * 16
  LET b2 = rsrc * 16
  FOR i = 0 TO 15
    LET BN(b1 + i) = BN(b2 + i)
  NEXT i
  RETURN 0
END SUB

REM Compare BN registers as unsigned 256-bit integers. Returns -1, 0, or 1.
SUB BN_CMP(ra, rb)
  LOCAL i, ba, bb, va, vb
  LET ba = ra * 16
  LET bb = rb * 16
  FOR i = 15 TO 0 STEP -1
    LET va = BN(ba + i)
    LET vb = BN(bb + i)
    IF va < vb THEN RETURN -1
    IF va > vb THEN RETURN 1
  NEXT i
  RETURN 0
END SUB

SUB BN_IS_ZERO(r)
  LOCAL i, base
  LET base = r * 16
  FOR i = 0 TO 15
    IF BN(base + i) <> 0 THEN RETURN 0
  NEXT i
  RETURN 1
END SUB

REM Load 64-char hex (BE) into register r.
SUB BN_LOAD_HEX(r, hex$)
  LOCAL i, base, hi, lo, byteIdx, limbIdx, byteVal
  LET base = r * 16
  REM Zero first
  FOR i = 0 TO 15
    LET BN(base + i) = 0
  NEXT i
  IF LEN(hex$) <> 64 THEN RETURN -1
  REM bytes go BE: byte 0 is most significant of the 32-byte BE encoding.
  REM byte b (0..31) lives at limb (31-b)/2; if (31-b) is even, it's the low byte of that limb.
  FOR byteIdx = 0 TO 31
    LET hi = HEX_NIBBLE(MID$(hex$, byteIdx*2 + 1, 1))
    LET lo = HEX_NIBBLE(MID$(hex$, byteIdx*2 + 2, 1))
    IF hi < 0 OR lo < 0 THEN RETURN -1
    LET byteVal = SHL(hi, 4) + lo
    LET limbIdx = INT((31 - byteIdx) / 2)
    IF ((31 - byteIdx) MOD 2) = 0 THEN
      LET BN(base + limbIdx) = BN(base + limbIdx) + byteVal
    ELSE
      LET BN(base + limbIdx) = BN(base + limbIdx) + byteVal * 256
    ENDIF
  NEXT byteIdx
  RETURN 0
END SUB

SUB BN_TO_HEX$(r)
  LOCAL i, base, limb, hi, lo, out$, byteIdx
  LET base = r * 16
  LET out$ = ""
  REM Walk limbs from high (15) to low (0); within each limb output high byte then low byte.
  FOR i = 15 TO 0 STEP -1
    LET limb = BN(base + i)
    LET hi = INT(limb / 256)
    LET lo = limb - hi * 256
    LET out$ = out$ + MID$(HEX_DIGITS$, INT(hi/16) + 1, 1) + MID$(HEX_DIGITS$, (hi MOD 16) + 1, 1)
    LET out$ = out$ + MID$(HEX_DIGITS$, INT(lo/16) + 1, 1) + MID$(HEX_DIGITS$, (lo MOD 16) + 1, 1)
  NEXT i
  RETURN out$
END SUB

REM Load BUF(off..off+31) BE into register r.
SUB BN_LOAD_BUF_BE(r, off)
  LOCAL i, base, byteIdx, limbIdx
  LET base = r * 16
  FOR i = 0 TO 15
    LET BN(base + i) = 0
  NEXT i
  FOR byteIdx = 0 TO 31
    LET limbIdx = INT((31 - byteIdx) / 2)
    IF ((31 - byteIdx) MOD 2) = 0 THEN
      LET BN(base + limbIdx) = BN(base + limbIdx) + BUF(off + byteIdx)
    ELSE
      LET BN(base + limbIdx) = BN(base + limbIdx) + BUF(off + byteIdx) * 256
    ENDIF
  NEXT byteIdx
  RETURN 0
END SUB

REM Store register r into BUF(off..off+31) BE.
SUB BN_STORE_BUF_BE(r, off)
  LOCAL i, base, limb, hi, lo
  LET base = r * 16
  FOR i = 0 TO 15
    LET limb = BN(base + i)
    LET hi = INT(limb / 256)
    LET lo = limb - hi * 256
    LET BUF(off + (31 - i*2 - 1)) = hi
    LET BUF(off + (31 - i*2)) = lo
  NEXT i
  RETURN 0
END SUB

REM Add: rdst = (ra + rb) mod 2^256. Returns final carry (0 or 1).
SUB BN_ADD(rdst, ra, rb)
  LOCAL i, t, carry, bd, ba, bb
  LET bd = rdst * 16
  LET ba = ra * 16
  LET bb = rb * 16
  LET carry = 0
  FOR i = 0 TO 15
    LET t = BN(ba + i) + BN(bb + i) + carry
    LET BN(bd + i) = BITAND(t, 65535)
    LET carry = INT(t / 65536)
  NEXT i
  RETURN carry
END SUB

REM Subtract: rdst = (ra - rb) mod 2^256. Returns final borrow (0 or 1).
SUB BN_SUB(rdst, ra, rb)
  LOCAL i, t, borrow, bd, ba, bb
  LET bd = rdst * 16
  LET ba = ra * 16
  LET bb = rb * 16
  LET borrow = 0
  FOR i = 0 TO 15
    LET t = BN(ba + i) - BN(bb + i) - borrow
    IF t < 0 THEN
      LET t = t + 65536
      LET borrow = 1
    ELSE
      LET borrow = 0
    ENDIF
    LET BN(bd + i) = t
  NEXT i
  RETURN borrow
END SUB

REM 512-bit product: BN_WIDE(0..31) = ra * rb. Schoolbook.
SUB BN_MUL_WIDE(ra, rb)
  LOCAL i, j, ba, bb, t, carry, ai
  LET ba = ra * 16
  LET bb = rb * 16
  FOR i = 0 TO 31
    LET BN_WIDE(i) = 0
  NEXT i
  FOR i = 0 TO 15
    LET ai = BN(ba + i)
    LET carry = 0
    FOR j = 0 TO 15
      LET t = BN_WIDE(i + j) + ai * BN(bb + j) + carry
      LET BN_WIDE(i + j) = BITAND(t, 65535)
      LET carry = INT(t / 65536)
    NEXT j
    LET BN_WIDE(i + 16) = carry
  NEXT i
  RETURN 0
END SUB

REM ----- Modular reductions -----

REM Reduce BN_WIDE (32 limbs) mod p. Result -> register rdst.
REM Uses the special form p = 2^256 - 2^32 - 977, so 2^256 = 2^32 + 977 (mod p).
SUB BN_MOD_P_FROM_WIDE(rdst)
  LOCAL i, t, carry, bd, hi_nonzero, iter, hi_top
  LET bd = rdst * 16
  REM Iterate up to 5 folds. After each, the high part shrinks rapidly.
  FOR iter = 0 TO 4
    REM Find highest nonzero limb above limb 15. If none, done with folding.
    LET hi_top = -1
    FOR i = 16 TO 31
      IF BN_WIDE(i) <> 0 THEN LET hi_top = i - 16
    NEXT i
    IF hi_top < 0 THEN LET iter = 4
    IF hi_top >= 0 THEN
      REM Snapshot high half into BN_TMP1 and zero the high half.
      FOR i = 0 TO hi_top
        LET BN_TMP1(i) = BN_WIDE(16 + i)
        LET BN_WIDE(16 + i) = 0
      NEXT i
      REM Add BN_TMP1 * 977 starting at limb 0. Each TMP1 limb * 977 fits in ~26 bits.
      LET carry = 0
      FOR i = 0 TO hi_top + 2
        LET t = BN_WIDE(i) + carry
        IF i <= hi_top THEN LET t = t + BN_TMP1(i) * 977
        LET BN_WIDE(i) = BITAND(t, 65535)
        LET carry = INT(t / 65536)
      NEXT i
      IF carry <> 0 THEN
        LET BN_WIDE(hi_top + 3) = BN_WIDE(hi_top + 3) + carry
      ENDIF
      REM Add BN_TMP1 << 32 (i.e. shifted by 2 limbs) into BN_WIDE.
      LET carry = 0
      FOR i = 0 TO hi_top + 2
        LET t = BN_WIDE(i + 2) + carry
        IF i <= hi_top THEN LET t = t + BN_TMP1(i)
        LET BN_WIDE(i + 2) = BITAND(t, 65535)
        LET carry = INT(t / 65536)
      NEXT i
      IF carry <> 0 THEN
        LET BN_WIDE(hi_top + 5) = BN_WIDE(hi_top + 5) + carry
      ENDIF
    ENDIF
  NEXT iter
  REM Copy low 16 limbs to rdst.
  FOR i = 0 TO 15
    LET BN(bd + i) = BN_WIDE(i)
  NEXT i
  REM Conditional subtract p while >= p (rare; at most a couple of times).
  WHILE BN_CMP(rdst, BN_R_P) >= 0
    LET _ = BN_SUB(rdst, rdst, BN_R_P)
  WEND
  RETURN 0
END SUB

REM Reduce BN_WIDE (32 limbs) mod n via binary long division.
REM Uses BN_SHIFTED as a 32-limb register holding n shifted left.
SUB BN_MOD_N_FROM_WIDE(rdst)
  LOCAL i, j, k, bn, t, borrow, cmp
  LET bn = BN_R_N * 16
  REM Init BN_SHIFTED = n << 256 (place n in high half)
  FOR i = 0 TO 15
    LET BN_SHIFTED(i) = 0
    LET BN_SHIFTED(i + 16) = BN(bn + i)
  NEXT i

  REM Iterate 257 times: if BN_WIDE >= BN_SHIFTED, subtract; then BN_SHIFTED >>= 1.
  FOR k = 0 TO 256
    REM Compare BN_WIDE vs BN_SHIFTED (32 limbs each, unsigned)
    LET cmp = 0
    FOR i = 31 TO 0 STEP -1
      IF cmp = 0 THEN
        IF BN_WIDE(i) > BN_SHIFTED(i) THEN LET cmp = 1
        IF BN_WIDE(i) < BN_SHIFTED(i) THEN LET cmp = -1
      ENDIF
    NEXT i
    IF cmp >= 0 THEN
      REM BN_WIDE -= BN_SHIFTED
      LET borrow = 0
      FOR i = 0 TO 31
        LET t = BN_WIDE(i) - BN_SHIFTED(i) - borrow
        IF t < 0 THEN
          LET t = t + 65536
          LET borrow = 1
        ELSE
          LET borrow = 0
        ENDIF
        LET BN_WIDE(i) = t
      NEXT i
    ENDIF
    REM BN_SHIFTED >>= 1
    LET t = 0
    FOR i = 31 TO 0 STEP -1
      LET j = BN_SHIFTED(i)
      LET BN_SHIFTED(i) = INT(j / 2) + t * 32768
      LET t = j MOD 2
    NEXT i
  NEXT k
  REM Copy low 16 limbs to rdst (high limbs are now 0)
  LET bn = rdst * 16
  FOR i = 0 TO 15
    LET BN(bn + i) = BN_WIDE(i)
  NEXT i
  RETURN 0
END SUB

SUB BN_ADD_MOD_P(rdst, ra, rb)
  LOCAL c
  LET c = BN_ADD(rdst, ra, rb)
  IF c <> 0 THEN
    LET _ = BN_SUB(rdst, rdst, BN_R_P)
  ELSE
    IF BN_CMP(rdst, BN_R_P) >= 0 THEN
      LET _ = BN_SUB(rdst, rdst, BN_R_P)
    ENDIF
  ENDIF
  RETURN 0
END SUB

SUB BN_SUB_MOD_P(rdst, ra, rb)
  LOCAL b
  LET b = BN_SUB(rdst, ra, rb)
  IF b <> 0 THEN
    LET _ = BN_ADD(rdst, rdst, BN_R_P)
  ENDIF
  RETURN 0
END SUB

SUB BN_MUL_MOD_P(rdst, ra, rb)
  BN_MUL_WIDE(ra, rb)
  BN_MOD_P_FROM_WIDE(rdst)
  RETURN 0
END SUB

SUB BN_ADD_MOD_N(rdst, ra, rb)
  LOCAL c
  LET c = BN_ADD(rdst, ra, rb)
  IF c <> 0 THEN
    LET _ = BN_SUB(rdst, rdst, BN_R_N)
  ELSE
    IF BN_CMP(rdst, BN_R_N) >= 0 THEN
      LET _ = BN_SUB(rdst, rdst, BN_R_N)
    ENDIF
  ENDIF
  RETURN 0
END SUB

SUB BN_SUB_MOD_N(rdst, ra, rb)
  LOCAL b
  LET b = BN_SUB(rdst, ra, rb)
  IF b <> 0 THEN
    LET _ = BN_ADD(rdst, rdst, BN_R_N)
  ENDIF
  RETURN 0
END SUB

SUB BN_MUL_MOD_N(rdst, ra, rb)
  BN_MUL_WIDE(ra, rb)
  BN_MOD_N_FROM_WIDE(rdst)
  RETURN 0
END SUB

REM Compute base^exp mod p using square-and-multiply, with exp held in register rexp.
REM rdst, rbase, rexp must be distinct from BN_R_TMP_A.
SUB BN_POW_MOD_P(rdst, rbase, rexp)
  LOCAL i, j, base_e, b
  LET base_e = rexp * 16
  REM result = 1
  BN_ZERO(rdst)
  LET BN(rdst*16) = 1
  REM tmp = base
  BN_COPY(BN_R_TMP_A, rbase)
  REM Walk bits of exp from low to high
  FOR i = 0 TO 15
    LET b = BN(base_e + i)
    FOR j = 0 TO 15
      IF (b MOD 2) = 1 THEN
        BN_MUL_MOD_P(rdst, rdst, BN_R_TMP_A)
      ENDIF
      LET b = INT(b / 2)
      REM Square tmp (skip after the very last bit to save a multiplication)
      IF i < 15 OR j < 15 THEN
        BN_MUL_MOD_P(BN_R_TMP_A, BN_R_TMP_A, BN_R_TMP_A)
      ENDIF
    NEXT j
  NEXT i
  RETURN 0
END SUB

REM Modular inverse mod p via Fermat: a^(p-2) mod p.
REM Uses BN_R_TMP_B to hold (p - 2). Caller must not pass BN_R_TMP_A or BN_R_TMP_B as arguments.
SUB BN_INV_MOD_P(rdst, ra)
  REM Compute p - 2 into BN_R_TMP_B
  BN_ZERO(BN_R_TMP_B)
  LET BN(BN_R_TMP_B*16) = 2
  LET _ = BN_SUB(BN_R_TMP_B, BN_R_P, BN_R_TMP_B)
  BN_POW_MOD_P(rdst, ra, BN_R_TMP_B)
  RETURN 0
END SUB

REM Initialize the prime / order constants once at stdlib load.
BN_LOAD_HEX(BN_R_P, "fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f")
BN_LOAD_HEX(BN_R_N, "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141")

REM ===========================================================
REM secp256k1 point arithmetic in Jacobian coordinates.
REM Point P = (X, Y, Z) at three consecutive registers, affine = (X/Z^2, Y/Z^3).
REM Z = 0 represents the point at infinity.
REM
REM Reserved scratch registers:
REM   16..21 : PT1..PT6 used by POINT_DOUBLE / POINT_ADD / POINT_TO_AFFINE
REM   22..24 : G in Jacobian (Z=1)
REM   25..27 : SM_R (running result point during SCALAR_MULT_G_AFFINE)
REM ===========================================================

LET BN_R_PT1 = 16
LET BN_R_PT2 = 17
LET BN_R_PT3 = 18
LET BN_R_PT4 = 19
LET BN_R_PT5 = 20
LET BN_R_PT6 = 21
LET SECP_GX = 22
LET SECP_GY = 23
LET SECP_GZ = 24
LET SM_RX = 25
LET SM_RY = 26
LET SM_RZ = 27

REM Doubles Jacobian point at rSrc (X,Y,Z = rSrc, rSrc+1, rSrc+2) into rDst.
REM Algorithm: standard formulas for y^2 = x^3 + 7.
SUB POINT_DOUBLE(rDst, rSrc)
  LOCAL rX1, rY1, rZ1, rXd, rYd, rZd
  LET rX1 = rSrc
  LET rY1 = rSrc + 1
  LET rZ1 = rSrc + 2
  LET rXd = rDst
  LET rYd = rDst + 1
  LET rZd = rDst + 2
  REM If Z1 == 0 (infinity), result is infinity.
  IF BN_IS_ZERO(rZ1) = 1 THEN
    BN_ZERO(rXd)
    BN_ZERO(rYd)
    BN_ZERO(rZd)
    RETURN 0
  ENDIF
  REM PT1 = A = X1^2
  BN_MUL_MOD_P(BN_R_PT1, rX1, rX1)
  REM PT2 = B = Y1^2
  BN_MUL_MOD_P(BN_R_PT2, rY1, rY1)
  REM PT3 = C = B^2
  BN_MUL_MOD_P(BN_R_PT3, BN_R_PT2, BN_R_PT2)
  REM PT4 = D = 2 * ((X1+B)^2 - A - C)
  BN_ADD_MOD_P(BN_R_PT4, rX1, BN_R_PT2)
  BN_MUL_MOD_P(BN_R_PT4, BN_R_PT4, BN_R_PT4)
  BN_SUB_MOD_P(BN_R_PT4, BN_R_PT4, BN_R_PT1)
  BN_SUB_MOD_P(BN_R_PT4, BN_R_PT4, BN_R_PT3)
  BN_ADD_MOD_P(BN_R_PT4, BN_R_PT4, BN_R_PT4)
  REM PT5 = E = 3*A
  BN_ADD_MOD_P(BN_R_PT5, BN_R_PT1, BN_R_PT1)
  BN_ADD_MOD_P(BN_R_PT5, BN_R_PT5, BN_R_PT1)
  REM Z3 first (uses Y1, Z1 still intact)
  BN_MUL_MOD_P(rZd, rY1, rZ1)
  BN_ADD_MOD_P(rZd, rZd, rZd)
  REM PT6 = F = E^2
  BN_MUL_MOD_P(BN_R_PT6, BN_R_PT5, BN_R_PT5)
  REM PT1 = 2D (reuse PT1 since A no longer needed)
  BN_ADD_MOD_P(BN_R_PT1, BN_R_PT4, BN_R_PT4)
  REM rXd_tmp = X3 = F - 2D -> stash in PT2 since rXd may equal rX1 (still might be needed by Y3 calc)
  BN_SUB_MOD_P(BN_R_PT2, BN_R_PT6, BN_R_PT1)
  REM Y3 = E*(D - X3) - 8*C
  BN_SUB_MOD_P(BN_R_PT6, BN_R_PT4, BN_R_PT2)
  BN_MUL_MOD_P(BN_R_PT6, BN_R_PT5, BN_R_PT6)
  BN_ADD_MOD_P(BN_R_PT3, BN_R_PT3, BN_R_PT3)
  BN_ADD_MOD_P(BN_R_PT3, BN_R_PT3, BN_R_PT3)
  BN_ADD_MOD_P(BN_R_PT3, BN_R_PT3, BN_R_PT3)
  BN_SUB_MOD_P(BN_R_PT6, BN_R_PT6, BN_R_PT3)
  REM Now write final X3, Y3
  BN_COPY(rXd, BN_R_PT2)
  BN_COPY(rYd, BN_R_PT6)
  RETURN 0
END SUB

REM Adds Jacobian points at rA and rB, into rDst.
SUB POINT_ADD(rDst, rA, rB)
  LOCAL rAX, rAY, rAZ, rBX, rBY, rBZ, rDX, rDY, rDZ
  LET rAX = rA
  LET rAY = rA + 1
  LET rAZ = rA + 2
  LET rBX = rB
  LET rBY = rB + 1
  LET rBZ = rB + 2
  LET rDX = rDst
  LET rDY = rDst + 1
  LET rDZ = rDst + 2
  REM Handle infinities
  IF BN_IS_ZERO(rAZ) = 1 THEN
    BN_COPY(rDX, rBX)
    BN_COPY(rDY, rBY)
    BN_COPY(rDZ, rBZ)
    RETURN 0
  ENDIF
  IF BN_IS_ZERO(rBZ) = 1 THEN
    BN_COPY(rDX, rAX)
    BN_COPY(rDY, rAY)
    BN_COPY(rDZ, rAZ)
    RETURN 0
  ENDIF
  REM PT1 = Z2^2
  BN_MUL_MOD_P(BN_R_PT1, rBZ, rBZ)
  REM PT2 = U1 = X1 * Z2^2
  BN_MUL_MOD_P(BN_R_PT2, rAX, BN_R_PT1)
  REM PT3 = Z1^2
  BN_MUL_MOD_P(BN_R_PT3, rAZ, rAZ)
  REM PT4 = U2 = X2 * Z1^2
  BN_MUL_MOD_P(BN_R_PT4, rBX, BN_R_PT3)
  REM PT5 = Z2^3 = Z2 * Z2^2
  BN_MUL_MOD_P(BN_R_PT5, rBZ, BN_R_PT1)
  REM PT6 = S1 = Y1 * Z2^3
  BN_MUL_MOD_P(BN_R_PT6, rAY, BN_R_PT5)
  REM PT5 = Z1^3 = Z1 * Z1^2 (reuse)
  BN_MUL_MOD_P(BN_R_PT5, rAZ, BN_R_PT3)
  REM PT3 = S2 = Y2 * Z1^3 (reuse PT3)
  BN_MUL_MOD_P(BN_R_PT3, rBY, BN_R_PT5)
  REM PT1 = H = U2 - U1 (reuse PT1)
  BN_SUB_MOD_P(BN_R_PT1, BN_R_PT4, BN_R_PT2)
  REM PT5 = R = S2 - S1 (reuse PT5)
  BN_SUB_MOD_P(BN_R_PT5, BN_R_PT3, BN_R_PT6)
  REM Special cases when H == 0
  IF BN_IS_ZERO(BN_R_PT1) = 1 THEN
    IF BN_IS_ZERO(BN_R_PT5) = 1 THEN
      POINT_DOUBLE(rDst, rA)
    ELSE
      BN_ZERO(rDX)
      BN_ZERO(rDY)
      BN_ZERO(rDZ)
    ENDIF
    RETURN 0
  ENDIF
  REM Compute Z3 = Z1*Z2*H first (uses Z1, Z2, H still intact)
  BN_MUL_MOD_P(BN_R_PT4, rAZ, rBZ)
  BN_MUL_MOD_P(rDZ, BN_R_PT4, BN_R_PT1)
  REM PT3 = HH = H^2 (reuse PT3 since S2 no longer needed)
  BN_MUL_MOD_P(BN_R_PT3, BN_R_PT1, BN_R_PT1)
  REM PT4 = HHH = H * HH (reuse PT4)
  BN_MUL_MOD_P(BN_R_PT4, BN_R_PT1, BN_R_PT3)
  REM PT2 = U1*HH (overwrite U1 since not needed after this)
  BN_MUL_MOD_P(BN_R_PT2, BN_R_PT2, BN_R_PT3)
  REM Compute X3 = R^2 - HHH - 2*(U1*HH) into rDX (write at end after Y3 dependencies handled)
  BN_MUL_MOD_P(BN_R_PT3, BN_R_PT5, BN_R_PT5)   ' R^2 -> PT3
  BN_SUB_MOD_P(BN_R_PT3, BN_R_PT3, BN_R_PT4)   ' - HHH
  BN_SUB_MOD_P(BN_R_PT3, BN_R_PT3, BN_R_PT2)   ' - U1*HH
  BN_SUB_MOD_P(BN_R_PT3, BN_R_PT3, BN_R_PT2)   ' - U1*HH again
  REM Y3 = R * (U1*HH - X3) - S1 * HHH
  BN_SUB_MOD_P(BN_R_PT2, BN_R_PT2, BN_R_PT3)   ' U1*HH - X3 (PT2 reuse)
  BN_MUL_MOD_P(BN_R_PT2, BN_R_PT5, BN_R_PT2)   ' R*(U1*HH-X3)
  BN_MUL_MOD_P(BN_R_PT4, BN_R_PT6, BN_R_PT4)   ' S1*HHH
  BN_SUB_MOD_P(BN_R_PT2, BN_R_PT2, BN_R_PT4)   ' Y3
  REM Final writes
  BN_COPY(rDX, BN_R_PT3)
  BN_COPY(rDY, BN_R_PT2)
  RETURN 0
END SUB

REM Convert Jacobian point at rJ (3 regs) to affine (rXout, rYout).
REM Point at infinity yields (0, 0).
SUB POINT_TO_AFFINE(rXout, rYout, rJ)
  LOCAL rJX, rJY, rJZ
  LET rJX = rJ
  LET rJY = rJ + 1
  LET rJZ = rJ + 2
  IF BN_IS_ZERO(rJZ) = 1 THEN
    BN_ZERO(rXout)
    BN_ZERO(rYout)
    RETURN 0
  ENDIF
  REM Z_inv -> PT1 (BN_INV_MOD_P uses BN_R_TMP_A/B internally, fine)
  BN_INV_MOD_P(BN_R_PT1, rJZ)
  REM PT2 = Z_inv^2
  BN_MUL_MOD_P(BN_R_PT2, BN_R_PT1, BN_R_PT1)
  REM PT3 = Z_inv^3
  BN_MUL_MOD_P(BN_R_PT3, BN_R_PT1, BN_R_PT2)
  REM x = X * Z_inv^2
  BN_MUL_MOD_P(rXout, rJX, BN_R_PT2)
  REM y = Y * Z_inv^3
  BN_MUL_MOD_P(rYout, rJY, BN_R_PT3)
  RETURN 0
END SUB

REM Compute scalar * G in affine coords. Uses 25..27 as running Jacobian point.
SUB SCALAR_MULT_G_AFFINE(rXout, rYout, rk)
  LOCAL i, j, b, bit, base
  REM Init R = infinity
  BN_ZERO(SM_RX)
  BN_ZERO(SM_RY)
  BN_ZERO(SM_RZ)
  LET base = rk * 16
  FOR i = 15 TO 0 STEP -1
    LET b = BN(base + i)
    FOR j = 15 TO 0 STEP -1
      POINT_DOUBLE(SM_RX, SM_RX)
      LET bit = BITAND(SHR(b, j), 1)
      IF bit = 1 THEN
        POINT_ADD(SM_RX, SM_RX, SECP_GX)
      ENDIF
    NEXT j
  NEXT i
  POINT_TO_AFFINE(rXout, rYout, SM_RX)
  RETURN 0
END SUB

REM Initialize G's Jacobian coords (Z = 1) once at stdlib load.
BN_LOAD_HEX(SECP_GX, "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798")
BN_LOAD_HEX(SECP_GY, "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
BN_ZERO(SECP_GZ)
LET BN(SECP_GZ * 16) = 1

REM ===========================================================
REM BIP-340 tagged hash and Schnorr sign.
REM ===========================================================

DIM TH_DATA(160)
DIM TH_HASH(32)

REM Compute SHA256(SHA256(tag) || SHA256(tag) || data) where data is TH_DATA(0..dataLen-1).
REM Result is left in BUF(0..31).
SUB TAGGED_HASH(tag$, dataLen)
  LOCAL i, taglen
  LET taglen = LEN(tag$)
  REM Step 1: SHA256(tag) -> TH_HASH
  FOR i = 0 TO taglen - 1
    LET BUF(i) = ASC(MID$(tag$, i+1, 1))
  NEXT i
  SHA256_OF_BUF(taglen)
  FOR i = 0 TO 31
    LET TH_HASH(i) = BUF(i)
  NEXT i
  REM Step 2: SHA256(tagHash || tagHash || data)
  FOR i = 0 TO 31
    LET BUF(i) = TH_HASH(i)
    LET BUF(32 + i) = TH_HASH(i)
  NEXT i
  FOR i = 0 TO dataLen - 1
    LET BUF(64 + i) = TH_DATA(i)
  NEXT i
  SHA256_OF_BUF(64 + dataLen)
  RETURN 0
END SUB

REM Schnorr sign per BIP-340.
REM   rD: register containing 256-bit private key d (1 <= d < n).
REM   rMsg: register containing the 32-byte message digest.
REM   rAux: register containing 32-byte auxiliary randomness.
REM   sigOff: BUF offset to write the 64-byte signature (R_x || s).
SUB SCHNORR_SIGN(rD, rMsg, rAux, sigOff)
  LOCAL i, dprime, P_X, P_Y, kn, R_X, R_Y, eReg, sReg
  LET dprime = 10
  LET P_X = 11
  LET P_Y = 12
  LET kn = 13
  LET R_X = 14
  LET R_Y = 15
  LET eReg = 7
  LET sReg = 8

  REM 1) P = d * G
  SCALAR_MULT_G_AFFINE(P_X, P_Y, rD)

  REM 2) dprime = (n - d) if P.y is odd, else d
  IF (BN(P_Y * 16) MOD 2) = 1 THEN
    LET _ = BN_SUB(dprime, BN_R_N, rD)
  ELSE
    BN_COPY(dprime, rD)
  ENDIF

  REM 3) t = bytes(dprime) XOR taggedHash("BIP0340/aux", aux)
  BN_STORE_BUF_BE(rAux, 0)
  FOR i = 0 TO 31
    LET TH_DATA(i) = BUF(i)
  NEXT i
  TAGGED_HASH("BIP0340/aux", 32)
  REM Bytes(dprime) -> BUF(32..63), then TH_DATA(i) = BUF(i) XOR BUF(32+i) for i in 0..31
  BN_STORE_BUF_BE(dprime, 32)
  FOR i = 0 TO 31
    LET TH_DATA(i) = BITXOR(BUF(i), BUF(32 + i))
  NEXT i

  REM 4) rand = taggedHash("BIP0340/nonce", t || P_x || m)
  BN_STORE_BUF_BE(P_X, 0)
  FOR i = 0 TO 31
    LET TH_DATA(32 + i) = BUF(i)
  NEXT i
  BN_STORE_BUF_BE(rMsg, 0)
  FOR i = 0 TO 31
    LET TH_DATA(64 + i) = BUF(i)
  NEXT i
  TAGGED_HASH("BIP0340/nonce", 96)

  REM 5) k' = int(rand) mod n
  BN_LOAD_BUF_BE(kn, 0)
  IF BN_CMP(kn, BN_R_N) >= 0 THEN
    LET _ = BN_SUB(kn, kn, BN_R_N)
  ENDIF

  REM 7) R = k' * G
  SCALAR_MULT_G_AFFINE(R_X, R_Y, kn)

  REM 8) k = (n - k') if R.y is odd, else k'
  IF (BN(R_Y * 16) MOD 2) = 1 THEN
    LET _ = BN_SUB(kn, BN_R_N, kn)
  ENDIF

  REM 9) e = int(taggedHash("BIP0340/challenge", R_x || P_x || m)) mod n
  BN_STORE_BUF_BE(R_X, 0)
  FOR i = 0 TO 31
    LET TH_DATA(i) = BUF(i)
  NEXT i
  BN_STORE_BUF_BE(P_X, 0)
  FOR i = 0 TO 31
    LET TH_DATA(32 + i) = BUF(i)
  NEXT i
  BN_STORE_BUF_BE(rMsg, 0)
  FOR i = 0 TO 31
    LET TH_DATA(64 + i) = BUF(i)
  NEXT i
  TAGGED_HASH("BIP0340/challenge", 96)
  BN_LOAD_BUF_BE(eReg, 0)
  IF BN_CMP(eReg, BN_R_N) >= 0 THEN
    LET _ = BN_SUB(eReg, eReg, BN_R_N)
  ENDIF

  REM 10) s = (k + e * dprime) mod n
  BN_MUL_MOD_N(sReg, eReg, dprime)
  BN_ADD_MOD_N(sReg, sReg, kn)

  REM Output R_x || s (32 + 32 bytes BE)
  BN_STORE_BUF_BE(R_X, sigOff)
  BN_STORE_BUF_BE(sReg, sigOff + 32)
  RETURN 0
END SUB

REM ===========================================================
REM nostr-level helpers: NOSTR_PUBKEY_HEX$, NOSTR_NSEC$, NOSTR_SIGN$.
REM Implemented entirely in BASIC on top of the primitives above.
REM ===========================================================

LET JSON_QUOTE$ = CHR$(34)
LET JSON_BSLASH$ = CHR$(92)

REM Escape a string for use as JSON string content (no surrounding quotes).
REM Handles ", \\, control chars (\\n, \\r, \\t, \\b, \\f, and \\u00XX for other ctrls).
SUB JSON_ESCAPE$(s$)
  LOCAL out$, i, n, c$, code, hi, lo
  LET out$ = ""
  LET n = LEN(s$)
  FOR i = 1 TO n
    LET c$ = MID$(s$, i, 1)
    LET code = ASC(c$)
    IF code = 34 THEN
      LET out$ = out$ + JSON_BSLASH$ + JSON_QUOTE$
    ELSE
      IF code = 92 THEN
        LET out$ = out$ + JSON_BSLASH$ + JSON_BSLASH$
      ELSE
        IF code = 10 THEN
          LET out$ = out$ + JSON_BSLASH$ + "n"
        ELSE
          IF code = 13 THEN
            LET out$ = out$ + JSON_BSLASH$ + "r"
          ELSE
            IF code = 9 THEN
              LET out$ = out$ + JSON_BSLASH$ + "t"
            ELSE
              IF code = 8 THEN
                LET out$ = out$ + JSON_BSLASH$ + "b"
              ELSE
                IF code = 12 THEN
                  LET out$ = out$ + JSON_BSLASH$ + "f"
                ELSE
                  IF code < 32 THEN
                    LET hi = INT(code / 16)
                    LET lo = code MOD 16
                    LET out$ = out$ + JSON_BSLASH$ + "u00" + MID$(HEX_DIGITS$, hi + 1, 1) + MID$(HEX_DIGITS$, lo + 1, 1)
                  ELSE
                    LET out$ = out$ + c$
                  ENDIF
                ENDIF
              ENDIF
            ENDIF
          ENDIF
        ENDIF
      ENDIF
    ENDIF
  NEXT i
  RETURN out$
END SUB

REM Compute the BIP-340 x-only public key hex (64 lower-case hex chars) from sk hex.
SUB NOSTR_PUBKEY_HEX$(skhex$)
  LOCAL d_reg, P_X, P_Y
  LET d_reg = 0
  LET P_X = 1
  LET P_Y = 2
  LET _ = BN_LOAD_HEX(d_reg, skhex$)
  SCALAR_MULT_G_AFFINE(P_X, P_Y, d_reg)
  RETURN BN_TO_HEX$(P_X)
END SUB

REM Generate a random 32-byte secret key and return it as a "nsec1..." bech32 string.
SUB NOSTR_NSEC$()
  LOCAL i
  FOR i = 0 TO 31
    LET BUF(i) = RAND_BYTE()
  NEXT i
  LET BUF_LEN = 32
  RETURN BECH32_ENCODE$("nsec")
END SUB

REM Build and sign a kind-1 nostr event.
REM Inputs: nsec$ (bech32), content$ (UTF-8 limited to ASCII for now), kind (numeric)
REM Output: signed event JSON string.
SUB NOSTR_SIGN_KIND$(nsec$, content$, kind)
  LOCAL skhex$, pubkey$, ts, canonical$, idhex$, sighex$, evt$, esc$, i, d_reg, msg_reg, aux_reg
  LET skhex$ = NSEC_DECODE$(nsec$)
  IF skhex$ = "" THEN RETURN ""
  LET pubkey$ = NOSTR_PUBKEY_HEX$(skhex$)
  LET ts = NOW_UNIX()
  LET esc$ = JSON_ESCAPE$(content$)
  REM Canonical: [0,"<pubkey>",<ts>,<kind>,[],"<content>"]
  LET canonical$ = "[0," + JSON_QUOTE$ + pubkey$ + JSON_QUOTE$ + "," + STR$(ts) + "," + STR$(kind) + ",[]," + JSON_QUOTE$ + esc$ + JSON_QUOTE$ + "]"
  LET idhex$ = SHA256$(canonical$)

  REM Load registers for signing
  LET d_reg = 5
  LET msg_reg = 6
  LET aux_reg = 9
  LET _ = BN_LOAD_HEX(d_reg, skhex$)
  LET _ = BN_LOAD_HEX(msg_reg, idhex$)
  REM 32 random bytes -> aux register
  FOR i = 0 TO 31
    LET BUF(i) = RAND_BYTE()
  NEXT i
  LET _ = BN_LOAD_BUF_BE(aux_reg, 0)
  SCHNORR_SIGN(d_reg, msg_reg, aux_reg, 0)
  LET sighex$ = HEX_OF_BUF$(64)

  REM Assemble final event JSON
  LET evt$ = "{" + JSON_QUOTE$ + "id" + JSON_QUOTE$ + ":" + JSON_QUOTE$ + idhex$ + JSON_QUOTE$
  LET evt$ = evt$ + "," + JSON_QUOTE$ + "pubkey" + JSON_QUOTE$ + ":" + JSON_QUOTE$ + pubkey$ + JSON_QUOTE$
  LET evt$ = evt$ + "," + JSON_QUOTE$ + "created_at" + JSON_QUOTE$ + ":" + STR$(ts)
  LET evt$ = evt$ + "," + JSON_QUOTE$ + "kind" + JSON_QUOTE$ + ":" + STR$(kind)
  LET evt$ = evt$ + "," + JSON_QUOTE$ + "tags" + JSON_QUOTE$ + ":[]"
  LET evt$ = evt$ + "," + JSON_QUOTE$ + "content" + JSON_QUOTE$ + ":" + JSON_QUOTE$ + esc$ + JSON_QUOTE$
  LET evt$ = evt$ + "," + JSON_QUOTE$ + "sig" + JSON_QUOTE$ + ":" + JSON_QUOTE$ + sighex$ + JSON_QUOTE$
  LET evt$ = evt$ + "}"
  RETURN evt$
END SUB

REM Two-arg form: defaults kind to 1 (text note).
SUB NOSTR_SIGN$(nsec$, content$)
  RETURN NOSTR_SIGN_KIND$(nsec$, content$, 1)
END SUB
`;
