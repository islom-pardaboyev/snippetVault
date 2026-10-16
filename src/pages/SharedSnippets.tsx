import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSnippets } from "../hooks/snippets";
import { useToast } from "../hooks/ui";
import { Icon } from "../components/Icon";
import { LangIcon } from "../components/LangIcon";
import { copyText } from "../lib/utils";
import { revokeShare, shareUrl, getShareMeta, expiryLabel, type ShareMeta } from "../lib/share";
import type { GroupMeta, Snippet } from "../lib/types";

/** Lists everything the user has published as a read-only link, with copy / open / revoke. */
export function SharedSnippets() {
  const { snippets, groupMeta, save, updateGroup } = useSnippets();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [metas, setMetas] = useState<Record<string, ShareMeta>>({});

  const sharedSnippets = snippets.filter((s) => s.share_token);
  const sharedGroups = Object.entries(groupMeta).filter(([, m]) => m.share_token) as Array<[string, GroupMeta]>;
  const total = sharedSnippets.length + sharedGroups.length;
  const tokenKey = [...sharedSnippets.map((s) => s.share_token!), ...sharedGroups.map(([, m]) => m.share_token!)].filter(Boolean).join(",");

  // Load each share's view count + expiry (a handful of tiny reads).
  useEffect(() => {
    const tokens = tokenKey ? tokenKey.split(",") : [];
    if (!tokens.length) { setMetas({}); return; }
    let alive = true;
    Promise.all(tokens.map(async (t) => [t, await getShareMeta(t)] as const))
      .then((rows) => {
        if (!alive) return;
        const m: Record<string, ShareMeta> = {};
        rows.forEach(([t, meta]) => { if (meta) m[t] = meta; });
        setMetas(m);
      })
      .catch(() => { /* offline — leave stats blank */ });
    return () => { alive = false; };
  }, [tokenKey]);

  const stats = useMemo(() => (token: string) => {
    const m = metas[token];
    if (!m) return "";
    const v = m.views ?? 0;
    return `${v} view${v === 1 ? "" : "s"} · ${expiryLabel(m.expires_at)}`;
  }, [metas]);

  const copy = async (token: string) => { if (await copyText(shareUrl(token))) toast("Link copied"); };

  const revokeSnippet = async (s: Snippet) => {
    if (!s.share_token) return;
    setBusy(s.share_token);
    try { await revokeShare(s.share_token); } catch { /* best effort */ }
    save({ ...s, share_token: "" });
    setBusy(null);
    toast("Share link revoked");
  };

  const revokeGroup = async (name: string, token: string) => {
    setBusy(token);
    try { await revokeShare(token); } catch { /* best effort */ }
    updateGroup(name, { share_token: "" });
    setBusy(null);
    toast("Share link revoked");
  };

  const linkText = (token: string) => shareUrl(token).replace(/^https?:\/\//, "");

  return (
    <div className="anim-rise mx-auto max-w-[1240px]">
      <div className="mb-6">
        <h1 className="text-[clamp(26px,3.2vw,36px)] font-bold leading-[1.1] tracking-[-0.04em]">Shared snippets</h1>
        <p className="mt-1 text-sm text-muted">
          {total === 0
            ? "Read-only links you've published from your vault."
            : `${total} link${total === 1 ? "" : "s"} · anyone with a link can read it, but not edit or see the rest of your vault`}
        </p>
      </div>

      {total === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong bg-surface px-5 py-[70px] text-center">
          <div className="mx-auto mb-[18px] grid size-[54px] place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="link" size={26} /></div>
          <h2 className="mb-1.5 text-[22px] font-bold tracking-tight">Nothing shared yet</h2>
          <p className="mx-auto mb-[22px] max-w-[44ch] text-muted">
            Open a snippet (or a group) and press <b className="font-semibold text-ink">Share</b> to publish a read-only copy — code, images and notes.
          </p>
          <Link to="/" className="btn btn-primary btn-lg"><Icon name="library" /> Browse snippets</Link>
        </div>
      ) : (
        <div className="space-y-6">
          {sharedSnippets.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-[12.5px] font-bold uppercase tracking-[.12em] text-faint">Snippets · {sharedSnippets.length}</h2>
              <div className="space-y-2.5">
                {sharedSnippets.map((s) => (
                  <ShareRow key={s.id} to={`/s/${s.id}`} icon={<LangIcon lang={s.language} size={20} />}
                    title={s.title || "Untitled"} meta={`${s.language} · ${linkText(s.share_token!)}`} stats={stats(s.share_token!)}
                    href={shareUrl(s.share_token!)} busy={busy === s.share_token}
                    onCopy={() => copy(s.share_token!)} onRevoke={() => revokeSnippet(s)} />
                ))}
              </div>
            </section>
          )}

          {sharedGroups.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-[12.5px] font-bold uppercase tracking-[.12em] text-faint">Groups · {sharedGroups.length}</h2>
              <div className="space-y-2.5">
                {sharedGroups.map(([name, m]) => (
                  <ShareRow key={name} to={`/group/${encodeURIComponent(name)}`}
                    icon={<span className="text-[19px] leading-none">{m.emoji || <Icon name="folder" size={19} />}</span>}
                    title={name} meta={linkText(m.share_token!)} stats={stats(m.share_token!)} href={shareUrl(m.share_token!)}
                    busy={busy === m.share_token} onCopy={() => copy(m.share_token!)} onRevoke={() => revokeGroup(name, m.share_token!)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ShareRow({ to, icon, title, meta, stats, href, busy, onCopy, onRevoke }: {
  to: string; icon: React.ReactNode; title: string; meta: string; stats?: string; href: string; busy: boolean;
  onCopy(): void; onRevoke(): void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-card border border-line bg-surface p-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2">{icon}</span>
      <div className="min-w-0 flex-1">
        <Link to={to} className="block truncate font-semibold tracking-tight hover:underline">{title}</Link>
        <span className="block truncate text-[12.5px] text-muted" title={href}>{meta}</span>
        {stats && <span className="block truncate text-[12px] text-faint">{stats}</span>}
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <button className="btn !h-9 flex-1 sm:flex-none" onClick={onCopy}><Icon name="copy" size={16} /> Copy link</button>
        <a className="btn btn-icon !h-9" href={href} target="_blank" rel="noreferrer" aria-label="Open link" title="Open link"><Icon name="link" size={16} /></a>
        <button className="btn btn-icon !h-9 hover:!border-danger/50 hover:!text-danger" onClick={onRevoke} disabled={busy} aria-label="Revoke link" title="Revoke link">
          <Icon name={busy ? "refresh" : "trash"} size={16} className={busy ? "animate-spin" : ""} />
        </button>
      </div>
    </div>
  );
}
