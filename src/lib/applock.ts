/**
 * App passcode ("app lock") — a **device privacy screen**, not encryption.
 *
 * It stops someone who picks up your already-signed-in device from opening the app. It does
 * **not** scramble your data: the config lives in `localStorage`, so anyone with access to the
 * device's storage can read it and brute-force the code offline. That is why the UI says so
 * plainly, and why a short PIN is acceptable here (unlike the Vault, which needs real crypto).
 *
 * Per device (decision D8): nothing here is synced — a new device sets its own code.
 */
import { randomBytes, toBase64, fromBase64, utf8 } from "./crypto";

/** Work factor for hashing the code. Lower than the Vault's KDF: this is a local gate, not encryption. */
export const APP_LOCK_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

/** Shortest accepted code. A 4–12 digit PIN. */
export const MIN_CODE_LEN = 4;
/**
 * Longest accepted code. The keypad (`components/PasscodePad.tsx`) is the only way to enter one,
 * and it stops here so a code can never become a way to make this device's hash expensive.
 */
export const MAX_CODE_LEN = 12;

/** Default auto-lock window when the lock is first turned on. */
export const DEFAULT_AUTOLOCK_MS = 5 * 60_000;

/** Persisted app-lock config, base64 fields, stored in `localStorage`. */
export interface AppLockConfig {
  v: 1;
  /** base64 16-byte salt (not secret). */
  salt: string;
  /** base64 of PBKDF2(code, salt, iterations). */
  hash: string;
  iterations: number;
  /** Auto-lock timeout in ms, or -1 for "never". */
  autoLockMs: number;
  created_at: string;
  updated_at: string;
}

/** Auto-lock choices for the Settings dropdown. `-1` means never auto-lock (cold start still asks). */
export const AUTOLOCK_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Immediately" },
  { value: 60_000, label: "After 1 minute" },
  { value: 5 * 60_000, label: "After 5 minutes" },
  { value: 30 * 60_000, label: "After 30 minutes" },
  { value: -1, label: "Never" },
];

export interface CodeIssue {
  text: string;
  kind: "err" | "ok";
}

/**
 * Validate a code; returns a message to show, or null when it's fine.
 *
 * Codes are **digits only**: the keypad is the sole way to enter one, so a code can never be a
 * short phrase that a 4-digit gate would protect badly.
 */
export function codeIssue(code: string, confirm?: string): CodeIssue | null {
  if (code.length < MIN_CODE_LEN) return { text: `Use at least ${MIN_CODE_LEN} digits.`, kind: "err" };
  if (code.length > MAX_CODE_LEN) return { text: `Use at most ${MAX_CODE_LEN} digits.`, kind: "err" };
  if (!/^\d+$/.test(code)) return { text: "Digits only (0–9).", kind: "err" };
  if (confirm !== undefined && code !== confirm) return { text: "The two codes don't match.", kind: "err" };
  return null;
}

/** PBKDF2-HMAC-SHA-256 over the code, returned as base64. */
export async function deriveCodeHash(code: string, saltB64: string, iterations: number): Promise<string> {
  const base = await crypto.subtle.importKey("raw", utf8(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromBase64(saltB64), iterations, hash: "SHA-256" },
    base,
    HASH_BYTES * 8,
  );
  return toBase64(new Uint8Array(bits));
}

/** Build a fresh config for a code. `iterations` is overridable so tests stay fast. */
export async function makeAppLock(
  code: string,
  opts: { iterations?: number; autoLockMs?: number } = {},
): Promise<AppLockConfig> {
  const iterations = opts.iterations ?? APP_LOCK_ITERATIONS;
  const salt = toBase64(randomBytes(SALT_BYTES));
  const hash = await deriveCodeHash(code, salt, iterations);
  const now = new Date().toISOString();
  return { v: 1, salt, hash, iterations, autoLockMs: opts.autoLockMs ?? DEFAULT_AUTOLOCK_MS, created_at: now, updated_at: now };
}

/** Re-hash a new code with the existing salt/iterations (used by "change code"). */
export async function rehashCode(code: string, cfg: AppLockConfig): Promise<AppLockConfig> {
  return { ...cfg, hash: await deriveCodeHash(code, cfg.salt, cfg.iterations), updated_at: new Date().toISOString() };
}

/** Constant-time-ish comparison of two base64 digests. */
function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when `code` matches the stored hash. */
export async function verifyCode(code: string, cfg: AppLockConfig): Promise<boolean> {
  return sameDigest(await deriveCodeHash(code, cfg.salt, cfg.iterations), cfg.hash);
}

/* --------------------------------------------------------------- storage */

const STORE_KEY = "sv:applock";
/** Session-scoped "we were unlocked at this time" marker; cleared when the tab closes. */
const SESSION_KEY = "sv:applock:active";

export function loadAppLock(): AppLockConfig | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<AppLockConfig>;
    if (c && c.v === 1 && typeof c.salt === "string" && typeof c.hash === "string" && typeof c.iterations === "number") {
      return { ...(c as AppLockConfig), autoLockMs: typeof c.autoLockMs === "number" ? c.autoLockMs : DEFAULT_AUTOLOCK_MS };
    }
  } catch { /* private mode / corrupt value */ }
  return null;
}

export function saveAppLock(cfg: AppLockConfig | null): void {
  try {
    if (cfg) localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(STORE_KEY);
  } catch { /* ignore */ }
}

export function readSessionAt(): number | null {
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    return v ? Number(v) : null;
  } catch { return null; }
}

export function writeSessionAt(t: number): void {
  try { sessionStorage.setItem(SESSION_KEY, String(t)); } catch { /* ignore */ }
}

export function clearSessionAt(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/**
 * Should the app start locked right now? Locked when there is no live session marker, or the
 * marker is older than the auto-lock window. With "Never" (`autoLockMs < 0`) a live marker means
 * unlocked; a **cold start** (no marker at all) still asks for the code once.
 */
export function shouldStartLocked(cfg: AppLockConfig, now = Date.now()): boolean {
  const at = readSessionAt();
  if (at == null) return true;
  if (cfg.autoLockMs < 0) return false;
  return now - at >= cfg.autoLockMs;
}
