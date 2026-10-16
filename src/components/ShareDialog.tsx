import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Select } from "./Select";
import { DEMO, useAuth } from "../hooks/auth";
import { useToast } from "../hooks/ui";
import { copyText } from "../lib/utils";
import { createShare, revokeShare, shareUrl, getShareMeta, expiresAtFromTtl, expiryLabel, EXPIRY_OPTIONS } from "../lib/share";
import type { Snippet } from "../lib/types";

interface Props {
  open: boolean;
  onClose(): void;
  kind: "snippet" | "group";
  title: string;
  group?: string;
  snippets: Snippet[];
  /** Existing token, so re-opening shows the same link instead of creating a new one. */
  token?: string;
  /** Called with the token after create, or "" after revoke. */
  onToken(token: string): void;
}

const HOURS: Record<string, number | null> = Object.fromEntries(EXPIRY_OPTIONS.map((o) => [o.value, o.hours]));

/** Pick the expiry option that best matches an absolute date. */
function ttlFromExpiry(iso: string | null): string {
  if (!iso) return "never";
  const hrs = (new Date(iso).getTime() - Date.now()) / 3600_000;
  if (hrs <= 0) return "never";
  let best = "never", bestDiff = Infinity;
  for (const o of EXPIRY_OPTIONS) {
    if (!o.hours) continue;
    const d = Math.abs(o.hours - hrs);
    if (d < bestDiff) { bestDiff = d; best = o.value; }
  }
  return best;
}

/**
 * Creates a public, read-only share link for a snippet or a whole group and lets
 * the owner copy it, set an expiry, refresh its contents, or revoke it.
 */
export function ShareDialog({ open, onClose, kind, title, group, snippets, token, onToken }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const ref = useRef<HTMLDialogElement>(null);
  const started = useRef(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [ttl, setTtl] = useState("never");
  const [views, setViews] = useState<number | null>(null);
  const [expires, setExpires] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const run = useCallback(async (existing?: string, ttlValue?: string) => {
    if (!user) return;
    const chosen = ttlValue ?? ttl;
    setBusy(true);
    setError("");
    const expires_at = expiresAtFromTtl(HOURS[chosen] ?? null);
    const ok = await createShare(
      { uid: user.uid, name: user.displayName || user.email || "Someone" },
      { token: existing, kind, title, group, snippets, expires_at },
    );
    setLink(ok);
    setExpires(expires_at);
    onToken(ok);
    setBusy(false);
    if (existing) toast("Share link updated");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, kind, title, group, snippets, onToken, toast, ttl]);

  // On open: reuse an existing link, otherwise mint a fresh one.
  useEffect(() => {
    if (!open) { started.current = false; return; }
    if (started.current) return;
    started.current = true;
    setCopied(false);
    setError("");
    setViews(null);
    setExpires(null);
    setTtl("never");
    if (token) { setLink(token); return; }
    if (!user) { setLink(""); return; }
    setLink("");
    run("", "never").catch((e) => { setError((e as Error).message || "Could not create the link."); setBusy(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load view count and current expiry when re-opening an existing link.
  useEffect(() => {
    if (!open || !token) return;
    let alive = true;
    getShareMeta(token).then((m) => {
      if (!alive || !m) return;
      setViews(m.views ?? 0);
      setExpires(m.expires_at ?? null);
      setTtl(ttlFromExpiry(m.expires_at ?? null));
    }).catch(() => { /* offline — leave the defaults */ });
    return () => { alive = false; };
  }, [open, token]);

  const copy = async () => {
    if (!link) return;
    if (await copyText(shareUrl(link))) {
      setCopied(true);
      toast("Link copied");
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const revoke = async () => {
    if (!link) return;
    setBusy(true);
    try { await revokeShare(link); } catch { /* best effort */ }
    setLink("");
    onToken("");
    setBusy(false);
    toast("Share link revoked");
  };

  const refresh = () => run(link).catch((e) => { setError((e as Error).message || "Could not refresh the link."); setBusy(false); });

  const changeTtl = (v: string) => {
    setTtl(v);
    // apply immediately to an existing link
    if (link && user) run(link, v).catch((e) => { setError((e as Error).message || "Could not update the expiry."); setBusy(false); });
  };

  const url = link ? shareUrl(link) : "";

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-auto w-[min(560px,calc(100vw-28px))] overflow-hidden rounded-[22px] border border-line-strong bg-surface p-0 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,.7)]">
      {open && (
        <div className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 sm:p-6">
          <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="link" size={22} /></div>
          <h2 className="text-xl font-bold tracking-tight">Share {kind === "group" ? "group" : "snippet"}</h2>
          <p className="mt-1.5 text-sm text-muted">
            Anyone with the link can read <b className="font-semibold text-ink">{title || "this"}</b> — code{kind === "group" ? ", images and notes for every snippet in the group" : ", images and its notes"}.
            They can’t edit or see the rest of your vault. Revoke any time.
          </p>

          {DEMO ? (
            <div className="mt-5 rounded-xl border border-line bg-surface-2 p-4 text-[13.5px] text-muted">
              Sharing writes a public copy to Firestore, so it needs a real signed-in account. Demo mode is offline-only.
            </div>
          ) : (
            <>
              <label className="mt-5 block">
                <span className="mb-1.5 block text-[12.5px] font-semibold text-muted">Read-only link</span>
                {busy && !url ? (
                  <div className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface-2 px-3 py-3 text-sm text-muted">
                    <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" /> Creating link…
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input readOnly value={url} onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface-2 px-3 py-3 text-sm text-ink outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20" />
                    <button type="button" className="btn btn-primary shrink-0" onClick={copy} disabled={!url}>
                      <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                )}
              </label>

              {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}

              <label className="mt-4 block">
                <span className="mb-1.5 block text-[12.5px] font-semibold text-muted">Link expires</span>
                <Select ariaLabel="Link expiry" value={ttl} onChange={changeTtl}
                  options={EXPIRY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
              </label>

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[12.5px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="eye" size={15} className="text-faint" />
                  Read-only · no sign-in needed{kind === "group" && snippets.length > 0 ? ` · ${snippets.length} snippet${snippets.length > 1 ? "s" : ""}` : ""}
                </span>
                <span className="text-faint">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="chart" size={14} className="text-faint" />
                  {views === null ? "—" : `${views} view${views === 1 ? "" : "s"}`}
                </span>
                <span className="text-faint">·</span>
                <span>{expiryLabel(expires)}</span>
              </div>

              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <button type="button" className="btn btn-ghost !text-muted hover:!text-ink sm:mr-auto" onClick={refresh} disabled={busy || !link}>
                  <Icon name="refresh" size={16} /> Refresh contents
                </button>
                {link && <button type="button" className="btn !border-danger !bg-danger !text-[#1a0b0b] font-bold" onClick={revoke} disabled={busy}><Icon name="trash" size={16} /> Revoke</button>}
                <button type="button" className="btn" onClick={onClose}>Done</button>
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
