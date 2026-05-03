# yabasicstr

Yabasic 風の小さな BASIC インタプリタを TypeScript で実装し、ブラウザ上で nostr イベント署名 (`NOSTR_SIGN$`) を組込関数として呼べるようにした実験プロジェクトです。

- Vite + React + TypeScript
- BASIC インタプリタ (yabasic 風サブセット) を `src/yabasic/` に内蔵
- 署名は [nostr-tools](https://github.com/nbd-wtf/nostr-tools) を使用しブラウザ内で完結 (ネットワーク送信なし)
- `react-i18next` で 日本語 / 英語 切替

## 使い方

```bash
npm install
npm run dev      # 開発サーバ起動 (port 5173)
npm run build    # tsc + vite build
```

ブラウザで開き、左ペインに BASIC コードを書いて Run を押すと右ペインに出力が表示されます。

`INPUT` がある場合は左下の「標準入力」テキストエリアに 1 行ずつ入力値を入れてください。

## 組込関数

### `NOSTR_SIGN$(nsec$, content$ [, kind])`

`nsec1...` 形式の秘密鍵と本文文字列から、署名済みの nostr イベント JSON 文字列を返します。`kind` 省略時は 1 (text note)。

例:

```basic
INPUT "nsec> ", nsec$
INPUT "content> ", content$
LET signed$ = NOSTR_SIGN$(nsec$, content$)
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
