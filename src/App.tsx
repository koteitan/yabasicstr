import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { run, RuntimeError, nostrBuiltins, LexError, ParseError } from "./yabasic";
import { sampleCode } from "./sample";

export default function App() {
  const { t, i18n } = useTranslation();
  const [code, setCode] = useState<string>(sampleCode);
  const [stdin, setStdin] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

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
