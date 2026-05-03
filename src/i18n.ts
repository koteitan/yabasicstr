import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  ja: {
    translation: {
      title: "yabasicstr — yabasic + nostr 署名",
      subtitle:
        "BASIC プログラムを書いて実行できます。NOSTR_SIGN$(nsec$, content$) で署名済み JSON を取得します。",
      code: "BASIC コード",
      stdin: "標準入力 (1 行 1 INPUT)",
      stdinPlaceholder: "INPUT で読み取られる行を 1 つずつ書いてください。",
      output: "出力",
      run: "実行",
      stop: "停止",
      clear: "出力をクリア",
      sample: "サンプルを読み込む",
      langLabel: "Language",
      running: "実行中…",
      error: "エラー",
      tipsHeader: "ヒント",
      tip1: "nsec はブラウザ内で処理され、Send 押下時のみリレーへ送信されます。",
      tip2: "kind を変えるには NOSTR_SIGN$(nsec$, content$, kind) と書きます。",
      tip3: "出力中の最後の JSON が Send 対象になります。",
      relay: "リレー URL",
      send: "Send to relay",
      sendNoEvent: "出力に署名済み JSON が見つかりません。先に Run してください。",
      sendInvalidUrl: "リレー URL は wss:// または ws:// で始めてください。",
      sendOpening: "接続中…",
      sendSent: "EVENT 送信済み。応答待ち…",
      sendOk: "リレー応答",
      sendError: "送信エラー",
      sendClosed: "接続クローズ",
    },
  },
  en: {
    translation: {
      title: "yabasicstr — yabasic + nostr signing",
      subtitle:
        "Write and run BASIC programs. NOSTR_SIGN$(nsec$, content$) returns a signed event JSON.",
      code: "BASIC code",
      stdin: "Stdin (one line per INPUT)",
      stdinPlaceholder: "Provide one line per INPUT statement.",
      output: "Output",
      run: "Run",
      stop: "Stop",
      clear: "Clear output",
      sample: "Load sample",
      langLabel: "Language",
      running: "Running…",
      error: "Error",
      tipsHeader: "Tips",
      tip1: "Your nsec is processed locally; only the signed event is transmitted on Send.",
      tip2: "Use NOSTR_SIGN$(nsec$, content$, kind) to set a different kind.",
      tip3: "The latest JSON object in the output is what gets sent.",
      relay: "Relay URL",
      send: "Send to relay",
      sendNoEvent: "No signed JSON found in output. Click Run first.",
      sendInvalidUrl: "Relay URL must start with wss:// or ws://.",
      sendOpening: "Connecting…",
      sendSent: "EVENT sent. Waiting for relay response…",
      sendOk: "Relay response",
      sendError: "Send error",
      sendClosed: "Connection closed",
    },
  },
};

const detected = (() => {
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  return nav.toLowerCase().startsWith("ja") ? "ja" : "en";
})();

void i18n.use(initReactI18next).init({
  resources,
  lng: detected,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
