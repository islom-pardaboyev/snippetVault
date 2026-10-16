import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Accent, ThemeMode } from "../lib/types";
import { Icon } from "../components/Icon";
import { applyBranding } from "../lib/branding";
import { inkFor, isHex } from "../lib/color";

export const ACCENT_HEX: Record<Exclude<Accent, "custom">, string> = {
  lime: "#c8f542", sky: "#8ecbff", blue: "#4f8cff", violet: "#a597ff", pink: "#ff7ab8",
  coral: "#ff8a65", red: "#ff6b6b", amber: "#ffc83d", green: "#4ade80", cyan: "#4fe0dc",
};

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
interface ThemeCtx {
  theme: ThemeMode; accent: Accent; accentHex: string; customColor: string;
  setTheme(t: ThemeMode): void; setAccent(a: Accent): void; setCustomColor(hex: string): void;
  isLight: boolean; toggle(): void;
}
const ThemeContext = createContext<ThemeCtx | null>(null);

function read<T extends string>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback; } catch { return fallback; }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => read("sv:theme", "dark"));
  const [accent, setAccentState] = useState<Accent>(() => read("sv:accent", "lime"));
  const [customColor, setCustomState] = useState<string>(() => { const c = read("sv:accent-custom", "#8ecbff"); return isHex(c) ? c : "#8ecbff"; });
  const accentHex = accent === "custom" ? customColor : (ACCENT_HEX[accent as keyof typeof ACCENT_HEX] ?? ACCENT_HEX.lime);
  /* Cross-fade real switches (not the first paint): hold `.theme-anim` on <html> briefly so
     colours transition instead of snapping — see the matching rule in index.css. */
  const firstApply = useRef(true);
  const animTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(animTimer.current), []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = accent;
    const light = theme === "light" || (theme === "system" && matchMedia("(prefers-color-scheme: light)").matches);
    const ink = inkFor(accentHex);
    const rs = document.documentElement.style;
    rs.setProperty("--accent", accentHex);
    rs.setProperty("--accent-ink", ink);
    applyBranding(accentHex, ink, light ? "#f4f1ea" : "#0a0b0d");
    try {
      localStorage.setItem("sv:theme", theme); localStorage.setItem("sv:accent", accent);
      localStorage.setItem("sv:accent-custom", customColor); localStorage.setItem("sv:accent-hex", accentHex);
    } catch { /* private mode */ }
    if (firstApply.current) firstApply.current = false;
    else {
      document.documentElement.classList.add("theme-anim");
      window.clearTimeout(animTimer.current);
      animTimer.current = window.setTimeout(() => document.documentElement.classList.remove("theme-anim"), 380);
    }
  }, [theme, accent, accentHex, customColor]);
  const setCustomColor = useCallback((hex: string) => { if (isHex(hex)) { setCustomState(hex); setAccentState("custom"); } }, []);
  const isLight = theme === "light" || (theme === "system" && typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches);
  const toggle = useCallback(() => setThemeState(isLight ? "dark" : "light"), [isLight]);
  const value = useMemo<ThemeCtx>(() => ({ theme, accent, accentHex, customColor, setTheme: setThemeState, setAccent: setAccentState, setCustomColor, isLight, toggle }), [theme, accent, accentHex, customColor, setCustomColor, isLight, toggle]);
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
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const toast = useCallback<ToastCtx["toast"]>((msg, opts = {}) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-2), { id, msg, kind: opts.kind, action: opts.action }]);
    setTimeout(() => dismiss(id), opts.ms ?? (opts.action ? 6000 : 2200));
  }, [dismiss]);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite"
        className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 z-[100] flex flex-col items-center gap-2 max-w-[calc(100vw-32px)]">
        {items.map((t) => (
          <div key={t.id}
            className={`anim-rise flex items-center gap-2.5 pl-3.5 pr-2 py-2 rounded-xl text-sm font-semibold shadow-2xl ${t.kind === "err" ? "bg-danger text-[#1a0b0b]" : "bg-ink text-bg"}`}>
            {t.kind === "err" && <Icon name="alert" size={16} className="shrink-0" />}
            <span>{t.msg}</span>
            {t.action && (
              <button className="rounded-lg px-2.5 py-1 font-bold bg-black/15"
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

/* ---------- PWA install ---------- */
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

export const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
export const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

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
