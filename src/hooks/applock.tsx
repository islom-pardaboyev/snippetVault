import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  clearSessionAt, loadAppLock, makeAppLock, readSessionAt, rehashCode, saveAppLock,
  shouldStartLocked, verifyCode, writeSessionAt, DEFAULT_AUTOLOCK_MS, type AppLockConfig,
} from "../lib/applock";

interface AppLockCtx {
  /** True once the user has turned the app lock on (this device only). */
  enabled: boolean;
  /** True while the code is required (cold start / after the timeout). */
  locked: boolean;
  autoLockMs: number;
  /** Turn the lock on with a new code. */
  enable(code: string): Promise<void>;
  /** Turn the lock off — requires the current code. Throws on a wrong code. */
  disable(code: string): Promise<void>;
  /** Replace the code — requires the current code. Throws on a wrong code. */
  changeCode(current: string, next: string): Promise<void>;
  /** Update the auto-lock timeout (ms, or -1 for never). */
  setAutoLock(ms: number): void;
  /** Verify a code; on success the app unlocks and stays unlocked for the timeout window. */
  unlock(code: string): Promise<boolean>;
  /** Lock immediately. */
  lockNow(): void;
}

const Ctx = createContext<AppLockCtx | null>(null);

/** Kept outside so the very first render already knows whether to show the lock screen. */
const initialConfig = loadAppLock();

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppLockConfig | null>(initialConfig);
  const [locked, setLocked] = useState(() => (initialConfig ? shouldStartLocked(initialConfig) : false));
  const lastActivity = useRef(Date.now());

  const lockNow = useCallback(() => {
    clearSessionAt();
    setLocked(true);
  }, []);

  /* While unlocked, keep the session marker fresh, lock again when the app returns from the
     background after the chosen window, and lock after the same period of inactivity in the
     foreground. "Immediately" (0) and "Never" (-1) skip the idle check so they can't fire while
     the user is actively typing. */
  useEffect(() => {
    if (!config || locked) return;
    lastActivity.current = Date.now();
    writeSessionAt(lastActivity.current);
    let lastWrite = lastActivity.current;
    const onActivity = () => {
      lastActivity.current = Date.now();
      if (lastActivity.current - lastWrite > 15_000) { lastWrite = lastActivity.current; writeSessionAt(lastWrite); }
    };
    const onVisibility = () => {
      if (document.hidden) { writeSessionAt(Date.now()); return; }
      if (config.autoLockMs < 0) return;
      const at = readSessionAt() ?? 0;
      if (Date.now() - at >= config.autoLockMs) lockNow();
    };
    const idle = setInterval(() => {
      if (config.autoLockMs > 0 && Date.now() - lastActivity.current >= config.autoLockMs) lockNow();
    }, 10_000);
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("touchstart", onActivity);
    window.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(idle);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("visibilitychange", onVisibility);
    };
  }, [config, locked, lockNow]);

  const enable = useCallback(async (code: string) => {
    const cfg = await makeAppLock(code);
    saveAppLock(cfg);
    setConfig(cfg);
    writeSessionAt(Date.now());
    setLocked(false);
  }, []);

  const disable = useCallback(async (code: string) => {
    if (!config || !(await verifyCode(code, config))) throw new Error("Wrong code.");
    saveAppLock(null);
    clearSessionAt();
    setConfig(null);
    setLocked(false);
  }, [config]);

  const changeCode = useCallback(async (current: string, next: string) => {
    if (!config || !(await verifyCode(current, config))) throw new Error("Wrong code.");
    const cfg = await rehashCode(next, config);
    saveAppLock(cfg);
    setConfig(cfg);
  }, [config]);

  const setAutoLock = useCallback((ms: number) => {
    if (!config) return;
    const next = { ...config, autoLockMs: ms, updated_at: new Date().toISOString() };
    saveAppLock(next);
    setConfig(next);
  }, [config]);

  const unlock = useCallback(async (code: string): Promise<boolean> => {
    if (!config) return true;
    if (!(await verifyCode(code, config))) return false;
    writeSessionAt(Date.now());
    setLocked(false);
    return true;
  }, [config]);

  const value = useMemo<AppLockCtx>(() => ({
    enabled: !!config,
    locked: !!config && locked,
    autoLockMs: config?.autoLockMs ?? DEFAULT_AUTOLOCK_MS,
    enable, disable, changeCode, setAutoLock, unlock, lockNow,
  }), [config, locked, enable, disable, changeCode, setAutoLock, unlock, lockNow]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppLock() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AppLockProvider missing");
  return c;
}
