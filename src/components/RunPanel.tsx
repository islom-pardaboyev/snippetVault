import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { isRunnable, runSnippet, type OutLine } from "../lib/runner";

/** Run button + console output for JavaScript, TypeScript and Python snippets. */
export function RunPanel({ code, language, compact = false }: { code: string; language: string; compact?: boolean }) {
  const [lines, setLines] = useState<OutLine[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [info, setInfo] = useState<{ ms: number; stopped: boolean } | null>(null);
  const handle = useRef<{ stop(): void } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef({ code, language });
  latest.current = { code, language };

  const run = useCallback(() => {
    const { code: c, language: l } = latest.current;
    if (!isRunnable(l) || handle.current) return;
    setLines([]); setInfo(null); setStatus("Running…"); setRunning(true);
    handle.current = runSnippet(l, c, {
      onLine: (ln) => setLines((p) => [...p, ln]),
      onStatus: setStatus,
      onClear: () => setLines([]),
      onDone: (i) => { handle.current = null; setRunning(false); setStatus(""); setInfo(i); },
    });
  }, []);

  const stop = () => handle.current?.stop();

  useEffect(() => () => handle.current?.stop(), []);
  useEffect(() => {
    const on = () => run();
    window.addEventListener("sv:run", on);
    return () => window.removeEventListener("sv:run", on);
  }, [run]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [lines.length]);

  if (!isRunnable(language)) return null;

  const color = (l: OutLine["level"]) =>
    l === "error" ? "text-danger" : l === "warn" ? "text-[var(--t-type)]" : l === "result" ? "text-accent" : l === "info" ? "text-faint" : "text-ink";

  return (
    <section className="overflow-hidden rounded-card border border-line-strong bg-bg" aria-label="Run output">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <button className={`btn ${running ? "" : "btn-primary"} !h-8`} onClick={running ? stop : run}>
          <Icon name={running ? "stop" : "play"} size={14} fill /> {running ? "Stop" : "Run"}
        </button>
        <span className="text-[12.5px] text-muted">
          {running ? status : info ? (info.stopped ? "Stopped" : `Finished in ${info.ms} ms`) : `Runs in your browser · ${language}`}
        </span>
        {!compact && !running && <kbd className="ml-1 hidden rounded-md border border-b-2 border-line-strong bg-surface-3 px-1.5 font-mono text-[11px] text-muted sm:inline">R</kbd>}
        {lines.length > 0 && !running && (
          <button className="btn btn-ghost !h-8 !px-2 ml-auto text-[12.5px]" onClick={() => { setLines([]); setInfo(null); }}>Clear</button>
        )}
      </div>
      <div ref={box} className="max-h-[320px] min-h-[64px] overflow-auto p-3 font-mono text-[13px] leading-[1.65]">
        {lines.length === 0 ? (
          <span className="text-faint">
            {running ? "Running… waiting for timers / network requests to finish."
              : info && !info.stopped ? "Finished with no output. Use console.log(...) (or print(...) in Python) to see values."
              : "Output appears here. console.log / print() go to this panel."}
          </span>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={`whitespace-pre-wrap break-words ${color(l.level)}`}>
              {l.level === "result" && <span className="mr-1.5 opacity-70">←</span>}{l.text}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
