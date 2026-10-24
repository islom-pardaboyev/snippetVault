import workerSrc from "./sandbox/worker.js?raw";
import frameTpl from "./sandbox/frame.html?raw";

/**
 * Runs snippet code in the browser.
 *
 *   page ─postMessage→ <iframe sandbox="allow-scripts"> (opaque origin: no access to the app,
 *                       its cookies, IndexedDB or your vault) ─→ Web Worker (runs the code)
 *
 * Killing the iframe kills the worker, so infinite loops are stopped by a timeout.
 */
const RUNNABLE = ["JavaScript", "TypeScript", "Python"] as const;
export const isRunnable = (lang: string) => (RUNNABLE as readonly string[]).includes(lang);

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
const LIMIT_JS_MS = 10_000;
const LIMIT_PY_MS = 40_000;
const MAX_LINES = 1000;

export interface OutLine { level: "log" | "warn" | "error" | "result" | "info"; text: string; }
export interface RunHandlers {
  onLine(l: OutLine): void;
  onStatus(s: string): void;
  onClear(): void;
  onDone(info: { ms: number; stopped: boolean }): void;
}

// The worker source is inlined into the frame; a replacer *function* is used so that `$&`, `$'`
// and similar sequences inside the source can't be interpreted as replacement patterns.
const frameHtml = frameTpl.replace("__WORKER_SRC__", () => JSON.stringify(workerSrc).replace(/<\//g, "<\\/"));
let pyFrame: HTMLIFrameElement | null = null;

function createFrame(): HTMLIFrameElement {
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-scripts"); // NOT allow-same-origin: that is what isolates it
  f.setAttribute("aria-hidden", "true");
  f.tabIndex = -1;
  f.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
  f.srcdoc = frameHtml;
  document.body.appendChild(f);
  return f;
}

export function runSnippet(language: string, code: string, h: RunHandlers): { stop(): void } {
  const kind = language === "Python" ? "py" : "js";
  const limit = kind === "py" ? LIMIT_PY_MS : LIMIT_JS_MS;
  const started = performance.now();
  let frame: HTMLIFrameElement | undefined;
  let lines = 0;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    window.removeEventListener("message", onMessage);
    if (timer) clearTimeout(timer);
  };
  const finish = (stopped: boolean) => {
    if (finished) return;
    finished = true;
    cleanup();
    if (kind === "js" || stopped) {
      frame?.remove();
      if (kind === "py") pyFrame = null;
    }
    h.onDone({ ms: Math.round(performance.now() - started), stopped });
  };

  const post = (payload: object) => frame?.contentWindow?.postMessage({ type: "run", kind, ...payload }, "*");

  function onMessage(e: MessageEvent) {
    if (!frame || e.source !== frame.contentWindow) return;
    const m = e.data as { t?: string; level?: OutLine["level"]; text?: string };
    if (m.t === "ready") { start(); }
    else if (m.t === "log") {
      if (lines++ < MAX_LINES) h.onLine({ level: m.level ?? "log", text: String(m.text ?? "").slice(0, 20_000) });
      else if (lines === MAX_LINES + 1) h.onLine({ level: "warn", text: `… output truncated after ${MAX_LINES} lines` });
    } else if (m.t === "status") h.onStatus(String(m.text ?? ""));
    else if (m.t === "clear") h.onClear();
    else if (m.t === "done") finish(false);
  }

  let prepared: string | null = null;
  function start() {
    timer = setTimeout(() => {
      h.onLine({ level: "error", text: `Stopped: still running after ${limit / 1000}s (infinite loop, or a timer/interval that never ends).` });
      finish(true);
    }, limit);
    post({ code: prepared, pyUrl: PYODIDE });
  }

  (async () => {
    try {
      prepared = code;
      if (language === "TypeScript") {
        const { transform } = await import("sucrase");
        prepared = transform(code, { transforms: ["typescript"], disableESTransforms: true }).code;
      }
    } catch (err) {
      h.onLine({ level: "error", text: "TypeScript error: " + ((err as Error).message ?? String(err)) });
      finished = true;
      h.onDone({ ms: Math.round(performance.now() - started), stopped: false });
      return;
    }
    // Stop may have been pressed while the TypeScript transform was loading. If so the run is
    // already finished and cleaned up — don't attach a listener or spin up a frame that nothing
    // will ever stop.
    if (finished) return;
    window.addEventListener("message", onMessage);
    if (kind === "py") {
      const fresh = !pyFrame;
      if (!pyFrame) pyFrame = createFrame();
      frame = pyFrame;
      if (!fresh) start(); // runtime already loaded in this frame
    } else {
      frame = createFrame();
    }
  })();

  return { stop() { h.onLine({ level: "info", text: "Stopped." }); finish(true); } };
}
