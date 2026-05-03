import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { run, RuntimeError, nostrBuiltins, LexError, ParseError } from "./yabasic";
import { sampleCode } from "./sample";

const DEFAULT_RELAY = "wss://relay.damus.io";

/** Extract the last top-level JSON object literal from a text blob. */
function extractLastJsonObject(text: string): unknown | null {
  let depth = 0;
  let start = -1;
  let end = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
    } else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start !== -1) end = i;
    }
  }
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [code, setCode] = useState<string>(sampleCode);
  const [stdin, setStdin] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const [relay, setRelay] = useState<string>(DEFAULT_RELAY);
  const [sendLog, setSendLog] = useState<string>("");
  const [sending, setSending] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    setOutput("");
    cancelRef.current = { cancelled: false };
    const myCancel = cancelRef.current;

    let buf = "";
    const flush = () => {
      if (buf.length > 0) {
        const chunk = buf;
        buf = "";
        setOutput((cur) => cur + chunk);
      }
    };

    const inputLines = stdin.split("\n");
    let inputIdx = 0;

    try {
      await run(code, {
        io: {
          print: (s) => {
            buf += s;
            // Flush eagerly on newlines for responsiveness
            if (s.includes("\n")) flush();
          },
          input: async () => {
            flush();
            if (myCancel.cancelled) throw new RuntimeError("cancelled");
            if (inputIdx >= inputLines.length) {
              throw new RuntimeError(
                "INPUT requested but no more stdin lines provided"
              );
            }
            return inputLines[inputIdx++];
          },
        },
        builtins: nostrBuiltins,
      });
      flush();
    } catch (e) {
      flush();
      if (e instanceof LexError || e instanceof ParseError) {
        setError(`${t("error")}: ${e.message}`);
      } else if (e instanceof RuntimeError) {
        setError(`${t("error")}: ${e.message}`);
      } else if (e instanceof Error) {
        setError(`${t("error")}: ${e.message}`);
      } else {
        setError(`${t("error")}: ${String(e)}`);
      }
    } finally {
      setRunning(false);
    }
  }, [code, stdin, t]);

  const handleStop = useCallback(() => {
    cancelRef.current.cancelled = true;
  }, []);

  const handleClear = () => setOutput("");

  const handleSample = () => {
    setCode(sampleCode);
    setStdin("");
  };

  const appendSendLog = useCallback((line: string) => {
    setSendLog((cur) => (cur ? `${cur}\n${line}` : line));
  }, []);

  const handleSend = useCallback(() => {
    setSendLog("");
    const url = relay.trim();
    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      appendSendLog(t("sendInvalidUrl"));
      return;
    }
    const evt = extractLastJsonObject(output);
    if (!evt || typeof evt !== "object") {
      appendSendLog(t("sendNoEvent"));
      return;
    }
    // Close any prior connection
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    appendSendLog(`[${url}] ${t("sendOpening")}`);
    setSending(true);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      appendSendLog(`${t("sendError")}: ${(e as Error).message}`);
      setSending(false);
      return;
    }
    wsRef.current = ws;
    const closeTimer = window.setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    }, 8000);

    ws.onopen = () => {
      const msg = JSON.stringify(["EVENT", evt]);
      ws.send(msg);
      appendSendLog(`> ${msg}`);
      appendSendLog(t("sendSent"));
    };
    ws.onmessage = (ev) => {
      const data = typeof ev.data === "string" ? ev.data : "[binary]";
      appendSendLog(`< ${data}`);
      // If it's an OK frame for our event, close.
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed[0] === "OK") {
          window.clearTimeout(closeTimer);
          ws.close();
        }
      } catch {
        /* keep listening */
      }
    };
    ws.onerror = () => {
      appendSendLog(`${t("sendError")}: WebSocket error`);
    };
    ws.onclose = (ev) => {
      window.clearTimeout(closeTimer);
      appendSendLog(`${t("sendClosed")} (code=${ev.code})`);
      setSending(false);
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [relay, output, t, appendSendLog]);

  const langOptions = useMemo(() => ["ja", "en"] as const, []);

  return (
    <div className="container">
      <header>
        <h1>{t("title")}</h1>
        <p className="subtitle">{t("subtitle")}</p>
        <div className="lang">
          <label>
            {t("langLabel")}{" "}
            <select
              value={i18n.language.startsWith("ja") ? "ja" : "en"}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
            >
              {langOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section className="grid">
        <div>
          <label className="block-label">{t("code")}</label>
          <textarea
            className="editor"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={18}
          />
          <label className="block-label">{t("stdin")}</label>
          <textarea
            className="stdin"
            spellCheck={false}
            value={stdin}
            placeholder={t("stdinPlaceholder")}
            onChange={(e) => setStdin(e.target.value)}
            rows={4}
          />
          <div className="actions">
            <button onClick={handleRun} disabled={running}>
              {running ? t("running") : t("run")}
            </button>
            <button onClick={handleStop} disabled={!running}>
              {t("stop")}
            </button>
            <button onClick={handleClear}>{t("clear")}</button>
            <button onClick={handleSample}>{t("sample")}</button>
          </div>
        </div>

        <div>
          <label className="block-label">{t("output")}</label>
          <pre className="output">{output}</pre>
          {error && <pre className="error">{error}</pre>}

          <label className="block-label">{t("relay")}</label>
          <div className="relay-row">
            <input
              className="relay-input"
              type="text"
              spellCheck={false}
              value={relay}
              onChange={(e) => setRelay(e.target.value)}
              placeholder="wss://relay.example.com"
            />
            <button onClick={handleSend} disabled={sending}>
              {sending ? t("sendOpening") : t("send")}
            </button>
          </div>
          {sendLog && <pre className="send-log">{sendLog}</pre>}
        </div>
      </section>

      <footer>
        <h3>{t("tipsHeader")}</h3>
        <ul>
          <li>{t("tip1")}</li>
          <li>{t("tip2")}</li>
          <li>{t("tip3")}</li>
        </ul>
      </footer>
    </div>
  );
}
