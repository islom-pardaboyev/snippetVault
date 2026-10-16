import { beforeAll, describe, expect, it } from "vitest";
import {
  APP_LOCK_ITERATIONS,
  MAX_CODE_LEN,
  MIN_CODE_LEN,
  codeIssue,
  deriveCodeHash,
  loadAppLock,
  makeAppLock,
  rehashCode,
  saveAppLock,
  shouldStartLocked,
  verifyCode,
  writeSessionAt,
  clearSessionAt,
} from "../applock";

/** Small work factor keeps these tests fast; the real default is 200k iterations. */
const FAST = 1000;

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

beforeAll(() => {
  (globalThis as unknown as { localStorage: unknown }).localStorage = fakeStorage();
  (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = fakeStorage();
});

describe("app lock hashing", () => {
  it("is deterministic for the same code, salt and iterations", async () => {
    const salt = (await makeAppLock("1234", { iterations: FAST })).salt;
    const a = await deriveCodeHash("1234", salt, FAST);
    const b = await deriveCodeHash("1234", salt, FAST);
    expect(a).toBe(b);
  });

  it("differs for a different code", async () => {
    const salt = (await makeAppLock("1234", { iterations: FAST })).salt;
    expect(await deriveCodeHash("1234", salt, FAST)).not.toBe(await deriveCodeHash("1235", salt, FAST));
  });

  it("verifies the right code and rejects the wrong one", async () => {
    const cfg = await makeAppLock("correct horse", { iterations: FAST });
    expect(await verifyCode("correct horse", cfg)).toBe(true);
    expect(await verifyCode("Correct horse", cfg)).toBe(false);
    expect(await verifyCode("", cfg)).toBe(false);
  });

  it("uses a fresh salt each time", async () => {
    const a = await makeAppLock("1234", { iterations: FAST });
    const b = await makeAppLock("1234", { iterations: FAST });
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("keeps the default work factor high", async () => {
    const cfg = await makeAppLock("1234");
    expect(cfg.iterations).toBe(APP_LOCK_ITERATIONS);
  });
});

describe("rehashCode", () => {
  it("preserves salt, iterations and auto-lock while changing the hash", async () => {
    const cfg = await makeAppLock("1234", { iterations: FAST, autoLockMs: 5 * 60_000 });
    const next = await rehashCode("9999", cfg);
    expect(next.salt).toBe(cfg.salt);
    expect(next.iterations).toBe(cfg.iterations);
    expect(next.autoLockMs).toBe(5 * 60_000);
    expect(next.hash).not.toBe(cfg.hash);
    expect(await verifyCode("9999", next)).toBe(true);
    expect(await verifyCode("1234", next)).toBe(false);
  });
});

describe("codeIssue", () => {
  it("rejects codes that are too short", () => {
    expect(codeIssue("123")).toMatchObject({ kind: "err" });
    expect(codeIssue("1234")).toBeNull();
  });

  it("rejects a mismatched confirmation", () => {
    expect(codeIssue("1234", "1235")).toMatchObject({ kind: "err" });
    expect(codeIssue("1234", "1234")).toBeNull();
  });

  it("only accepts digits — the keypad is the only way in", () => {
    expect(codeIssue("open sesame")).toMatchObject({ kind: "err" });
    expect(codeIssue("123a")).toMatchObject({ kind: "err" });
    expect(codeIssue("12 34")).toMatchObject({ kind: "err" });
    expect(MIN_CODE_LEN).toBeGreaterThanOrEqual(4);
  });

  it("rejects codes longer than the keypad allows", () => {
    expect(codeIssue("1".repeat(MAX_CODE_LEN))).toBeNull();
    expect(codeIssue("1".repeat(MAX_CODE_LEN + 1))).toMatchObject({ kind: "err" });
  });
});

describe("storage & auto-lock window", () => {
  it("round-trips a config through storage and clears on null", () => {
    const cfg = { ...makeAppLockSync(), hash: "abc", salt: "z", iterations: FAST, autoLockMs: 60_000, v: 1 as const };
    saveAppLock(cfg);
    expect(loadAppLock()).toMatchObject({ hash: "abc", autoLockMs: 60_000 });
    saveAppLock(null);
    expect(loadAppLock()).toBeNull();
  });

  it("locks on a cold start (no session marker)", () => {
    clearSessionAt();
    const cfg = { ...makeAppLockSync(), autoLockMs: 60_000 };
    expect(shouldStartLocked(cfg)).toBe(true);
  });

  it("stays unlocked within the window and locks after it", () => {
    const cfg = { ...makeAppLockSync(), autoLockMs: 60_000 };
    const now = Date.now();
    writeSessionAt(now);
    expect(shouldStartLocked(cfg, now + 1_000)).toBe(false);
    expect(shouldStartLocked(cfg, now + 60_000)).toBe(true);
  });

  it("never auto-locks when set to Never, but still asks on a cold start", () => {
    const cfg = { ...makeAppLockSync(), autoLockMs: -1 };
    clearSessionAt();
    expect(shouldStartLocked(cfg)).toBe(true);
    writeSessionAt(Date.now());
    expect(shouldStartLocked(cfg, Date.now() + 10 ** 9)).toBe(false);
  });
});

/** A config object without hashing, for the storage/window tests. */
function makeAppLockSync() {
  return { v: 1 as const, salt: "s", hash: "h", iterations: FAST, autoLockMs: 60_000, created_at: "", updated_at: "" };
}
