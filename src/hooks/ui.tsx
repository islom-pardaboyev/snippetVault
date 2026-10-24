import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ThemeMode } from "../lib/types";
import { Icon } from "../components/Icon";

/* ---------- online status ---------- */
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

/* ---------- theme ---------- */
const THEME_KEY = "sv:theme";
const LIGHT_BG = "#f5f5f4";
const DARK_BG = "#0c0c0d";

interface ThemeCtx { theme: ThemeMode; setTheme(t: ThemeMode): void; isLight: boolean; toggle(): void; }
const ThemeContext = createContext<ThemeCtx | null>(null);

const systemLight = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches;

function readTheme(): ThemeMode {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" || t === "system" ? t : "dark";
  } catch { return "dark"; }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readTheme);
  const [systemIsLight, setSystemIsLight] = useState(systemLight);
  const isLight = theme === "light" || (theme === "system" && systemIsLight);

  /* Follow the OS only while the theme is "system". */
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystemIsLight(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /* Cross-fade real switches (not the first paint): hold `.theme-anim` on <html> briefly. */
  const firstApply = useRef(true);
  const animTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(animTimer.current), []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isLight ? LIGHT_BG : DARK_BG);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
    if (firstApply.current) firstApply.current = false;
    else {
      root.classList.add("theme-anim");
      window.clearTimeout(animTimer.current);
      animTimer.current = window.setTimeout(() => root.classList.remove("theme-anim"), 380);
    }
  }, [theme, isLight]);

  const setTheme = useCallback((t: ThemeMode) => setThemeState(t), []);
  const toggle = useCallback(() => setThemeState(isLight ? "dark" : "light"), [isLight]);
  const value = useMemo<ThemeCtx>(() => ({ theme, setTheme, isLight, toggle }), [theme, setTheme, isLight, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const c = useContext(ThemeContext);
  if (!c) throw new Error("ThemeProvider missing");
  return c;
}

/* ---------- toasts ---------- */
interface ToastItem { id: number; msg: string; kind?: "err"; action?: { label: string; run(): void } }
interface ToastCtx { toast(msg: string, opts?: { kind?: "err"; action?: ToastItem["action"]; ms?: number }): void; }
const ToastContext = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Set<number>());

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const toast = useCallback<ToastCtx["toast"]>((msg, opts = {}) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-2), { id, msg, kind: opts.kind, action: opts.action }]);
    const timer = window.setTimeout(() => { timers.current.delete(timer); dismiss(id); }, opts.ms ?? (opts.action ? 6000 : 2200));
    timers.current.add(timer);
  }, [dismiss]);

  // Clear every pending auto-dismiss when the provider unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach((t) => window.clearTimeout(t)); pending.clear(); };
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite"
        className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 z-[100] flex flex-col items-center gap-2 max-w-[calc(100vw-32px)]">
        {items.map((t) => (
          <div key={t.id}
            className={`anim-rise flex items-center gap-2.5 pl-3.5 pr-2 py-2 rounded-xl text-sm font-medium shadow-2xl ${t.kind === "err" ? "bg-danger text-white" : "bg-ink text-bg"}`}>
            {t.kind === "err" && <Icon name="alert" size={16} className="shrink-0" />}
            <span>{t.msg}</span>
            {t.action && (
              <button className="rounded-lg px-2.5 py-1 font-semibold bg-black/15"
                onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  const c = useContext(ToastContext);
  if (!c) throw new Error("ToastProvider missing");
  return c.toast;
}

/* ---------- PWA install (desktop and browser menus) ---------- */
interface BIPEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }>; }
// Captured at module load so the event isn't missed by components that mount later.
let deferred: BIPEvent | null = null;
let installedFlag = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; emit(); });
  window.addEventListener("appinstalled", () => { deferred = null; installedFlag = true; emit(); });
}
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/** True when the page is the installed app rather than a browser tab. */
const isStandalone = () =>
  matchMedia("(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)").matches ||
  (typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true);

export function useInstall() {
  const evt = useSyncExternalStore(subscribe, () => deferred, () => null);
  const installed = useSyncExternalStore(subscribe, () => installedFlag || isStandalone(), () => false);
  const install = useCallback(async () => {
    if (!deferred) return;
    const e = deferred;
    await e.prompt();
    await e.userChoice;
    deferred = null;
    emit();
  }, []);
  return { canInstall: !!evt && !installed, installed, install, ios: isIOS() && !installed };
}
