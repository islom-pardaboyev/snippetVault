import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useAppLock } from "../hooks/applock";
import { useAuth } from "../hooks/auth";
import { Logo } from "./Logo";
import { Icon } from "./Icon";
import { PasscodeDots, PasscodePad } from "./PasscodePad";

/**
 * Full-screen passcode gate shown on a cold start and after the auto-lock window. It is a
 * device privacy screen (see `lib/applock.ts`) — the app content lives behind it, not inside it.
 *
 * Entry is a keypad, never a text field: no `<input>` means no native keyboard covering the
 * buttons on a phone, and nothing for autofill to grab.
 */
export function LockScreen() {
  const { unlock } = useAppLock();
  const { email, logout } = useAuth();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [fails, setFails] = useState(0);
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) setUntil(0);
    }, 250);
    return () => clearInterval(t);
  }, [until]);

  const wait = Math.max(0, until - now);
  const cooling = wait > 0;
  const blocked = cooling || busy;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (blocked || !code) return;
    setBusy(true);
    const ok = await unlock(code);
    setBusy(false);
    if (ok) return;
    const next = fails + 1;
    setFails(next);
    setCode("");
    setErr("Wrong code. Try again.");
    if (next % 3 === 0) {
      const ms = Math.min(30_000, 1000 * 2 ** (next / 3 - 1));
      setUntil(Date.now() + ms);
      setNow(Date.now());
    }
  };

  /* The keypad has focus (there is no input to hold it), so Enter has to be wired up by hand —
     preventDefault also stops the browser's implicit form submit firing a second time. */
  const onEnter = (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void submit();
  };

  return (
    <div className="grid min-h-screen place-items-center px-6 py-8 sm:py-10
      bg-[radial-gradient(800px_460px_at_50%_-10%,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_60%)]">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="lock" size={26} /></div>
          <div className="mb-3"><Logo size={30} text="text-lg" /></div>
          <h1 className="text-[24px] font-bold tracking-tight">App locked</h1>
          <p className="mt-1 text-muted">
            {email ? <>Enter your app code to open <b className="text-ink">{email}</b>.</> : "Enter your app code to continue."}
          </p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate onKeyDown={onEnter}>
          {/* key={fails} remounts the row on each failure so the shake plays again. */}
          <div key={fails} className={`pb-5 ${err ? "anim-shake" : ""}`}>
            <PasscodeDots filled={code.length} slots={4} invalid={!!err} />
          </div>
          <p role="status" aria-live="polite"
            className={`mb-1 min-h-[20px] text-center text-[13px] ${cooling ? "text-muted" : "text-danger"}`}>
            {cooling ? "Too many attempts — please wait a moment." : err}
          </p>

          <PasscodePad value={code} disabled={blocked} label="App code"
            onChange={(next) => { setCode(next); if (err) setErr(""); }} />

          <button className="btn btn-primary btn-lg btn-wide mt-7" disabled={blocked || !code}>
            {busy ? "Checking…" : cooling ? `Wait ${Math.ceil(wait / 1000)}s` : "Unlock"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button type="button" className="link-btn" onClick={() => setHelp((h) => !h)}>Forgot your code?</button>
        </div>
        {help && (
          <div className="mt-3 rounded-xl border border-line bg-surface-2 p-4 text-[13px] text-muted">
            <p className="mb-2">
              The app code is stored <b className="text-ink">only on this device</b> and can't be recovered or emailed.
              To remove it, sign out below and clear this site's data (or reinstall the app).
            </p>
            <button type="button" className="btn btn-danger btn-wide" onClick={() => logout()}>
              <Icon name="logout" size={16} /> Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
