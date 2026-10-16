import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import { Select } from "./Select";
import { PasscodeDots, PasscodePad } from "./PasscodePad";
import { PwMeter, passwordValid } from "./PwMeter";
import { useTheme, useInstall, useToast } from "../hooks/ui";
import { isAdminEmail, useAuth, authMessage } from "../hooks/auth";
import { useSnippets } from "../hooks/snippets";
import { useAppLock } from "../hooks/applock";
import { AUTOLOCK_OPTIONS, MAX_CODE_LEN, MIN_CODE_LEN, codeIssue } from "../lib/applock";
import { exportJson, parseImport, seedSnippets } from "../lib/utils";
import type { Accent, ThemeMode } from "../lib/types";

const ACCENTS: { id: Accent; c: string; name: string }[] = [
  { id: "lime", c: "#c8f542", name: "Lime" }, { id: "sky", c: "#8ecbff", name: "Light blue" },
  { id: "blue", c: "#4f8cff", name: "Blue" }, { id: "violet", c: "#a597ff", name: "Violet" },
  { id: "pink", c: "#ff7ab8", name: "Pink" }, { id: "coral", c: "#ff8a65", name: "Coral" },
  { id: "red", c: "#ff6b6b", name: "Red" }, { id: "amber", c: "#ffc83d", name: "Amber" },
  { id: "green", c: "#4ade80", name: "Green" }, { id: "cyan", c: "#4fe0dc", name: "Cyan" },
];
const THEMES: { id: ThemeMode; label: string }[] = [
  { id: "system", label: "System" }, { id: "dark", label: "Dark" }, { id: "light", label: "Light" },
];
const SHORTCUTS: [string, string][] = [
  ["Command palette", "⌘ K"], ["Focus search", "/"], ["New snippet", "N"], ["Toggle dark / light", "D"], ["Copy code (detail)", "C"],
  ["Edit (detail)", "E"], ["Favourite (detail)", "F"], ["Run code (detail)", "R"], ["Run code (editor)", "⌘ ⇧ ↵"], ["Save (editor)", "⌘ ↵"], ["Go back", "Esc"],
];

export function SettingsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const { theme, accent, customColor, setTheme, setAccent, setCustomColor } = useTheme();
  const { email, user, logout, hasPassword, changePassword } = useAuth();
  const nav = useNavigate();
  const [pwOpen, setPwOpen] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwNote, setPwNote] = useState<{ text: string; ok?: boolean }>({ text: "" });
  const viaGoogle = !!user?.providerData.some((p) => p.providerId === "google.com");
  const submitPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) return setPwNote({ text: "New password needs at least 8 characters." });
    try {
      await changePassword(curPw, newPw);
      setPwNote({ text: "Password updated.", ok: true }); setCurPw(""); setNewPw(""); setPwOpen(false);
    } catch (err) { setPwNote({ text: authMessage(err) }); }
  };
  const { snippets, saveMany } = useSnippets();
  const { canInstall, installed, install } = useInstall();
  const toast = useToast();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const onImport = async (f?: File) => {
    if (!f) return;
    try {
      const list = parseImport(await f.text());
      if (!list.length) return toast("No snippets found in that file.", { kind: "err" });
      await saveMany(list);
      toast(`Imported ${list.length} snippet${list.length > 1 ? "s" : ""}`);
    } catch { toast("That file isn't a valid export.", { kind: "err" }); }
    if (file.current) file.current.value = "";
  };

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-auto w-[min(560px,calc(100vw-28px))] max-h-[min(86vh,760px)] flex-col overflow-hidden rounded-[20px] border border-line-strong bg-surface p-0 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,.7)] open:flex">
      <div className="flex items-center px-6 pt-4 pb-2">
        <h2 className="flex-1 text-lg font-bold tracking-tight">Settings</h2>
        <button aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2"><Icon name="x" /></button>
      </div>
      <div className="overflow-y-auto px-6 pb-6">
        <Section title="Appearance">
          <Row label="Theme">
            <div className="inline-flex gap-0.5 rounded-[11px] border border-line bg-surface-2 p-[3px]">
              {THEMES.map((t) => (
                <button key={t.id} onClick={() => setTheme(t.id)}
                  className={`h-[30px] rounded-lg px-3 text-[13px] font-semibold ${theme === t.id ? "bg-surface-3 text-ink" : "text-muted"}`}>{t.label}</button>
              ))}
            </div>
          </Row>
          <Row label="Accent" hint="Also recolours the logo, favicon and app icon">
            <div className="flex max-w-[280px] flex-wrap justify-end gap-2.5">
              {ACCENTS.map((a) => (
                <button key={a.id} aria-label={a.name} title={a.name} onClick={() => setAccent(a.id)}
                  className="size-7 rounded-full outline-offset-2 transition"
                  style={{ background: a.c, outline: accent === a.id ? `2px solid ${a.c}` : "1px solid var(--line-strong)", border: accent === a.id ? "2px solid var(--bg)" : "none" }} />
              ))}
              <label title="Custom colour" aria-label="Custom colour"
                className="relative size-7 cursor-pointer overflow-hidden rounded-full outline-offset-2"
                style={{
                  background: accent === "custom" ? customColor : "conic-gradient(#ff6b6b,#ffc83d,#4ade80,#4fe0dc,#4f8cff,#a597ff,#ff7ab8,#ff6b6b)",
                  outline: accent === "custom" ? `2px solid ${customColor}` : "1px solid var(--line-strong)",
                  border: accent === "custom" ? "2px solid var(--bg)" : "none",
                }}>
                <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0" />
              </label>
            </div>
          </Row>
        </Section>

        <Section title="Your data">
          <Row label="Export" hint={`${snippets.length} snippet${snippets.length === 1 ? "" : "s"} as JSON`}>
            <button className="btn" onClick={() => { exportJson(snippets); toast("Exported"); }}><Icon name="download" size={16} /> Export</button>
          </Row>
          <Row label="Import" hint="Restore from a SnippetVault JSON file">
            <button className="btn" onClick={() => file.current?.click()}><Icon name="upload" size={16} /> Import</button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
          </Row>
          <Row label="Example snippets" hint="Add a starter set to your vault">
            <button className="btn" onClick={async () => { await saveMany(seedSnippets()); toast("Examples added"); }}><Icon name="sparkles" size={16} /> Add</button>
          </Row>
        </Section>

        <Section title="App">
          <Row label="Install SnippetVault" hint={installed ? "Already installed on this device ✓" : canInstall ? "Use it like a native app, even offline" : "Use your browser menu → Add to Home Screen / Install"}>
            {canInstall && <button className="btn btn-primary" onClick={install}><Icon name="download" size={16} /> Install</button>}
          </Row>
        </Section>

        <Security />

        <Section title="Keyboard shortcuts">
          <div className="grid gap-x-6 sm:grid-cols-2">
            {SHORTCUTS.map(([l, k]) => (
              <div key={l} className="flex items-center justify-between border-b border-line py-2 text-sm text-muted">
                {l}<kbd className="rounded-md border border-b-2 border-line-strong bg-surface-3 px-1.5 font-mono text-[11px]">{k}</kbd>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Account">
          <Row label={user?.displayName || email || "Signed in"}
            hint={`${user?.displayName ? `${email} · ` : ""}${viaGoogle ? "Signed in with Google" : "Email & password"} · synced with Firebase`}>
            <button className="btn btn-danger" onClick={() => { onClose(); logout(); }}><Icon name="logout" size={16} /> Sign out</button>
          </Row>
          {isAdminEmail(email) && (
            <Row label="Admin" hint="Site administration (passcode required)">
              <button className="btn" onClick={() => { onClose(); nav("/admin"); }}><Icon name="lock" size={16} /> Open admin</button>
            </Row>
          )}
          {hasPassword && (
            <div className="border-t border-line pt-2">
              <Row label="Password" hint={pwNote.text && !pwOpen ? pwNote.text : "Change the password you sign in with"}>
                <button className="btn" onClick={() => { setPwOpen((o) => !o); setPwNote({ text: "" }); }}>{pwOpen ? "Cancel" : "Change"}</button>
              </Row>
              {pwOpen && (
                <form onSubmit={submitPw} className="grid gap-2 pb-2">
                  <input type="password" autoComplete="current-password" placeholder="Current password" value={curPw} onChange={(e) => setCurPw(e.target.value)}
                    className="w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 outline-none focus:border-accent" />
                  <input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                    className="w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 outline-none focus:border-accent" />
                  <PwMeter pw={newPw} min={8} />
                  {pwNote.text && <p className={`text-[13px] ${pwNote.ok ? "text-accent" : "text-danger"}`}>{pwNote.text}</p>}
                  <button className="btn btn-primary" disabled={!curPw || !passwordValid(newPw)}>Update password</button>
                </form>
              )}
            </div>
          )}
        </Section>

        <Section title="Danger zone">
          <DeleteAccount hasPassword={hasPassword} email={email} onDeleted={onClose} />
        </Section>
      </div>
    </dialog>
  );
}

function Security() {
  const { enabled, autoLockMs, enable, disable, changeCode, setAutoLock, lockNow } = useAppLock();
  const toast = useToast();
  const [mode, setMode] = useState<null | "on" | "change" | "off">(null);
  const [cur, setCur] = useState("");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [slot, setSlot] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const clear = () => { setMode(null); setSlot(0); setCur(""); setCode(""); setConfirm(""); setNote(""); setBusy(false); };
  const open = (m: "on" | "change" | "off") => { setMode(mode === m ? null : m); setSlot(0); setCur(""); setCode(""); setConfirm(""); setNote(""); };

  /* Each mode is a short walk through the same keypad: current → new → confirm. There is no
     <input> anywhere in the flow, so a phone's keyboard never covers the keys. */
  const steps = mode === "change" ? ["cur", "new", "confirm"] : mode === "on" ? ["new", "confirm"] : ["cur"];
  const step = steps[Math.min(slot, steps.length - 1)] ?? "cur";
  const atLast = slot >= steps.length - 1;
  const value = step === "cur" ? cur : step === "new" ? code : confirm;
  const setValue = step === "cur" ? setCur : step === "new" ? setCode : setConfirm;
  const label = step === "cur" ? "Current code" : step === "new" ? "New code" : "Confirm new code";

  const onEnable = async () => {
    setBusy(true);
    try { await enable(code); toast("App lock is on"); clear(); }
    catch { setNote("Couldn't turn on the app lock on this device."); setBusy(false); }
  };
  const onChange = async () => {
    setBusy(true);
    try { await changeCode(cur, code); toast("App code changed"); clear(); }
    catch { setNote("That current code is wrong."); setBusy(false); }
  };
  const onDisable = async () => {
    setBusy(true);
    try { await disable(cur); toast("App lock is off"); clear(); }
    catch { setNote("That code is wrong."); setBusy(false); }
  };

  const ready = value.length >= MIN_CODE_LEN;
  const mismatch = step === "confirm" && confirm.length > 0 && code !== confirm;
  /* "Continue" only needs the step you're on filled in; the final button needs the whole flow valid. */
  const lastStepValid =
    mode === "on" ? !codeIssue(code, confirm)
    : mode === "change" ? !!cur && !codeIssue(code, confirm)
    : !codeIssue(cur);
  const blockedNow = busy || (atLast ? !lastStepValid : !ready);

  const advance = (e: React.FormEvent) => {
    e.preventDefault();
    if (blockedNow) return;
    if (!atLast) { setSlot((s) => s + 1); return; }
    if (mode === "on") void onEnable();
    else if (mode === "change") void onChange();
    else void onDisable();
  };

  const hint = note
    || (mismatch ? "The two codes don't match." : ready ? "Looks good." : `Use at least ${MIN_CODE_LEN} digits.`);

  return (
    <Section title="Security">
      <Row label="App lock" hint={enabled ? "On — a code is required to open the app on this device" : "Require a code to open SnippetVault on this device"}>
        {enabled ? (
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => open("change")}>{mode === "change" ? "Cancel" : "Change code"}</button>
            <button className="btn" onClick={lockNow}><Icon name="lock" size={16} /> Lock now</button>
            <button className="btn btn-danger" onClick={() => open("off")}>{mode === "off" ? "Cancel" : "Turn off"}</button>
          </div>
        ) : (
          <button className="btn" onClick={() => open("on")}>{mode === "on" ? "Cancel" : "Turn on"}</button>
        )}
      </Row>

      {enabled && (
        <Row label="Auto-lock" hint="Lock again after the app has been in the background">
          <Select ariaLabel="Auto-lock" align="right" className="w-[190px]" value={String(autoLockMs)}
            onChange={(v) => { setAutoLock(Number(v)); toast("Auto-lock updated"); }}
            options={AUTOLOCK_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))} />
        </Row>
      )}

      {mode && (
        <form onSubmit={advance} className="grid gap-2.5 pb-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold">{label}</span>
            {steps.length > 1 && <span className="text-[12px] text-faint">Step {slot + 1} of {steps.length}</span>}
          </div>

          <PasscodeDots filled={value.length} slots={4} invalid={mismatch || !!note} />
          <p role="status" aria-live="polite"
            className={`min-h-[17px] text-center text-[12.5px] ${note || mismatch ? "text-danger" : "text-faint"}`}>
            {hint}
          </p>

          <button className={mode === "off" ? "btn btn-danger" : "btn btn-primary"} disabled={blockedNow}>
            {atLast ? (mode === "on" ? "Turn on app lock" : mode === "change" ? "Change code" : "Turn off app lock") : "Continue"}
          </button>
          {atLast && slot > 0 && (
            <button type="button" className="link-btn" onClick={() => { setSlot(0); setCode(""); setConfirm(""); setNote(""); }}>
              Start over
            </button>
          )}

          <PasscodePad value={value} disabled={busy} label={label} max={MAX_CODE_LEN}
            onChange={(next) => { setValue(next); if (note) setNote(""); }} />
        </form>
      )}

      <p className="pt-1 text-[12.5px] text-faint">
        The app lock is a <b className="text-muted">device privacy screen</b>, not encryption — it stops someone who picks up your
        unlocked phone from opening the app. Your snippets aren't scrambled by it. Use the <b className="text-muted">Vault</b> for data you need to keep secret.
      </p>
    </Section>
  );
}

function DeleteAccount({ hasPassword, email, onDeleted }: { hasPassword: boolean; email: string | null; onDeleted(): void }) {
  const { deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ready = typed.trim().toLowerCase() === (email ?? "").toLowerCase() && (!hasPassword || !!pw);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await deleteAccount(hasPassword ? pw : null);
      onDeleted(); // the auth listener then returns the app to the login screen
    } catch (error) {
      setErr(authMessage(error));
      setBusy(false);
    }
  };

  return (
    <div className="py-2">
      <Row label="Delete account" hint="Permanently removes your snippets, groups, images and sign-in. This can't be undone.">
        <button className="btn btn-danger" onClick={() => setOpen((o) => !o)}>{open ? "Cancel" : "Delete…"}</button>
      </Row>
      {open && (
        <form onSubmit={go} className="grid gap-2 pb-2">
          <p className="text-[13px] text-muted">Type <b className="text-ink">{email}</b> to confirm.</p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email ?? ""} autoComplete="off"
            className="w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 outline-none focus:border-danger" />
          {hasPassword && (
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Your password" autoComplete="current-password"
              className="w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 outline-none focus:border-danger" />
          )}
          {!hasPassword && <p className="text-[13px] text-muted">You'll be asked to confirm with Google in a popup.</p>}
          {err && <p className="text-[13px] text-danger">{err}</p>}
          <button className="btn btn-danger" disabled={!ready || busy}>{busy ? "Deleting…" : "Permanently delete my account"}</button>
        </form>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[.1em] text-faint">{title}</h3>
      {children}
    </section>
  );
}
function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <div className="min-w-[160px] flex-1">
        <div className="font-semibold">{label}</div>
        {hint && <div className="text-[12.5px] text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
