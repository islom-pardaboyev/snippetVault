import { useEffect, useState, type FormEvent } from "react";
import { DEMO, isAdminEmail, useAuth } from "../hooks/auth";
import { useSnippets } from "../hooks/snippets";
import type { SyncState } from "../lib/types";
import { exportJson } from "../lib/utils";
import { projectId } from "../lib/firebase";
import { Icon } from "../components/Icon";

const UNLOCK_KEY = "sv:admin-unlocked";
const PASSCODE_HASH = (import.meta.env.VITE_ADMIN_PASSCODE_SHA256 ?? "").trim().toLowerCase();

async function sha256Hex(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SYNC_LABEL: Record<SyncState, string> = { synced: "all changes synced", syncing: "syncing…", offline: "offline" };

const readUnlocked = () => { try { return sessionStorage.getItem(UNLOCK_KEY) === "1"; } catch { return false; } };

/** /admin: 1) signed in with the admin Google/email account, 2) passcode, per browser session. */
export function Admin() {
  const { email } = useAuth();
  const [unlocked, setUnlocked] = useState(readUnlocked);

  if (!DEMO && !isAdminEmail(email)) {
    return (
      <Card icon="lock" title="Not authorised" text="This page is only for the site administrator." />
    );
  }
  if (!DEMO && !unlocked) {
    return <Passcode onOk={() => { try { sessionStorage.setItem(UNLOCK_KEY, "1"); } catch { /* private mode */ } setUnlocked(true); }} />;
  }
  return <Dashboard onLock={() => { try { sessionStorage.removeItem(UNLOCK_KEY); } catch { /* ignore */ } setUnlocked(false); }} />;
}

function Passcode({ onOk }: { onOk(): void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const input = "w-full rounded-[10px] border border-line bg-surface-2 px-3 py-3 outline-none transition focus:border-accent focus:ring-[3px] focus:ring-accent/20";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!PASSCODE_HASH) return setErr("Admin passcode isn't configured (VITE_ADMIN_PASSCODE_SHA256).");
    setBusy(true);
    const ok = (await sha256Hex(code)) === PASSCODE_HASH;
    setBusy(false);
    if (ok) onOk(); else { setErr("Wrong passcode."); setCode(""); }
  };

  return (
    <form onSubmit={submit} className="mx-auto mt-10 w-full max-w-[380px]">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="lock" size={22} /></div>
      <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">Admin access</h1>
      <p className="mb-5 text-muted">Enter the admin passcode to continue.</p>
      <input autoFocus type="password" autoComplete="off" className={input} placeholder="Passcode" value={code} onChange={(e) => setCode(e.target.value)} />
      <button className="btn btn-primary btn-lg btn-wide mt-3" disabled={busy || !code}>{busy ? "Checking…" : "Unlock"}</button>
      <p role="status" className="mt-3 min-h-[22px] text-[13px] text-danger">{err}</p>
    </form>
  );
}

function Dashboard({ onLock }: { onLock(): void }) {
  const { email } = useAuth();
  const { snippets, groups, sync } = useSnippets();
  const [storage, setStorage] = useState<{ used: number } | null>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setStorage({ used: e.usage ?? 0 })).catch(() => setStorage(null));
  }, []);

  const stats = [
    ["Snippets", snippets.length],
    ["Groups", groups.length],
    ["Favourites", snippets.filter((s) => s.favorite).length],
    ["Images", snippets.reduce((n, s) => n + (s.image_count ?? 0), 0)],
  ] as const;
  const mb = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

  return (
    <div className="anim-rise mx-auto max-w-[1040px]">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[clamp(26px,3.2vw,36px)] font-bold leading-[1.1] tracking-[-0.04em]">Admin</h1>
          <p className="mt-1 text-sm text-muted">{email} · {SYNC_LABEL[sync]}</p>
        </div>
        <button className="btn ml-auto" onClick={onLock}><Icon name="lock" size={16} /> Lock</button>
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-card border border-line bg-surface p-4">
            <div className="text-[12.5px] font-semibold text-muted">{label}</div>
            <div className="mt-1 font-mono text-[28px] font-bold">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-1 font-bold">This browser</h2>
          <p className="mb-4 text-sm text-muted">
            {storage ? `${mb(storage.used)} stored by this app in this browser (offline cache included).` : "Storage estimate not available in this browser."}
          </p>
          <button className="btn" onClick={() => exportJson(snippets)}><Icon name="download" size={16} /> Export vault (JSON)</button>
        </div>

        <div className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-1 font-bold">Users</h2>
          <p className="mb-4 text-sm text-muted">
            The client can't list other accounts. The full user list lives in the Firebase console.
          </p>
          <a className="btn" target="_blank" rel="noreferrer" href={`https://console.firebase.google.com/project/${projectId}/authentication/users`}>
            <Icon name="link" size={16} /> Open Firebase Authentication
          </a>
        </div>
      </div>
    </div>
  );
}

function Card({ icon, title, text }: { icon: "lock"; title: string; text: string }) {
  return (
    <div className="mx-auto mt-10 max-w-[420px] rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <div className="mx-auto mb-4 grid size-[54px] place-items-center rounded-2xl bg-danger/15 text-danger"><Icon name={icon} size={26} /></div>
      <h1 className="mb-1.5 text-[22px] font-bold tracking-tight">{title}</h1>
      <p className="text-muted">{text}</p>
    </div>
  );
}
