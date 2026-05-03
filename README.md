# yabasicstr

Yabasic 風の小さな BASIC インタプリタを TypeScript で実装し、その上で **nostr 署名フローを丸ごと BASIC で書いた** 実験プロジェクトです。

- Vite + React + TypeScript インタプリタ
- BASIC インタプリタ (`src/yabasic/`): DIM 配列, SUB / RETURN / LOCAL, ビット演算, RAND_BYTE
- BASIC stdlib (`src/yabasic/stdlib.ts`): bech32, SHA-256, 256bit big-int (mod p / mod n / Fermat 逆元), secp256k1 点演算 + スカラ倍, BIP-340 schnorr 署名, NSEC エンコード/デコード, JSON エスケープ, NOSTR_NSEC$ / NOSTR_SIGN$
- ブラウザ内で nsec を扱い、relay へは生 WebSocket で送出 (nostr ライブラリは依存に含めず)
- `react-i18next` で日本語 / 英語切替

## 使い方

```bash
npm install
npm run dev      # 開発サーバ起動 (port 5173)
npm run build    # tsc + vite build
npm test         # BASIC 実装と参照実装の一致テスト (~5 分)
```

ブラウザで開き、左ペインに BASIC コードを書いて Run を押すと右ペインに出力が表示されます。署名は tree-walking インタプリタ上で 256bit 演算を行うため、1 件あたり 60〜120 秒程度かかります。

`INPUT` がある場合は左下の「標準入力」テキストエリアに 1 行ずつ入力値を入れてください。

## 主要な BASIC SUB / 組込関数

これらは全て `src/yabasic/stdlib.ts` の BASIC コードで実装されています (TypeScript 側にあるのは `BITAND/SHL/SHR/ROTR/ADD32/RAND_BYTE/NOW_UNIX` などの低レベルプリミティブのみ)。

- `NOSTR_NSEC$()` — 32 バイトのランダム秘密鍵を生成し bech32 (`nsec1...`) で返す
- `NOSTR_SIGN$(nsec$, content$)` — kind:1 の署名済みイベント JSON を返す
- `NOSTR_SIGN_KIND$(nsec$, content$, kind)` — 任意 kind 版
- `NOSTR_PUBKEY_HEX$(skhex$)` — sk hex から x-only pubkey hex
- `NSEC_ENCODE$/NSEC_DECODE$/NPUB_ENCODE$/NPUB_DECODE$` — bech32 ↔ hex
- `SHA256$(s$)` / `SHA256_OF_BUF$(n)` — SHA-256
- `BECH32_ENCODE$/BECH32_DECODE` — 汎用 bech32
- `BN_*` — 256bit big-int (load/store, add/sub/mul mod p|n, Fermat inv)
- `POINT_DOUBLE/POINT_ADD/POINT_TO_AFFINE/SCALAR_MULT_G_AFFINE` — secp256k1
- `TAGGED_HASH/SCHNORR_SIGN` — BIP-340

例:

```basic
LET nsec$    = NOSTR_NSEC$()
LET content$ = "hello world"
LET signed$  = NOSTR_SIGN$(nsec$, content$)
PRINT signed$
```

返り値は次のような JSON です:

```json
{
  "kind": 1,
  "created_at": 1714700000,
  "tags": [],
  "content": "hello",
  "pubkey": "...",
  "id": "...",
  "sig": "..."
}
```

### その他の組込

`LEN`, `MID$`, `LEFT$`, `RIGHT$`, `STR$`, `VAL`, `CHR$`, `ASC`, `UPPER$`, `LOWER$`, `TRIM$`, `INT`, `ABS`, `SQRT`, `SIN`, `COS`, `TAN`, `EXP`, `LOG`, `RND`

## サポートする BASIC 構文

- `LET` (省略可) による代入。文字列変数は末尾 `$`
- `PRINT` (区切り `,` `;`)
- `INPUT [prompt$,] var`
- `IF cond THEN ... [ELSE ...] [ENDIF]` (1 行形式・複数行形式の両方)
- `FOR var = a TO b [STEP s] ... NEXT [var]`
- `WHILE cond ... WEND`
- `REPEAT ... UNTIL cond`
- `END` / `STOP`
- 算術 `+ - * / ^ MOD`、比較 `= <> < > <= >=`、論理 `AND OR NOT`
- 文字列の `+` 連結
- コメント: `REM`, `//`, `'`, `#`

## セキュリティ上の注意

`nsec` を入力する場合、必ず信頼できる環境 (オフライン / 自端末) で実行してください。本ツールはローカルで署名処理を行いネットワークへ送信しませんが、`nsec` は強力な秘密情報です。
