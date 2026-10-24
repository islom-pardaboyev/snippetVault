import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { Logo } from "./Logo";
import { CommandPalette } from "./CommandPalette";
import { AccountMenu } from "./AccountMenu";
import { SettingsDialog } from "./SettingsDialog";
import { useNewGroup } from "./NewGroupDialog";
import { LangIcon } from "./LangIcon";
import { useSnippets } from "../hooks/snippets";
import { useVault } from "../hooks/vault";
import { useAuth } from "../hooks/auth";
import { useOnline, useTheme, useToast } from "../hooks/ui";
import { LANGUAGES } from "../lib/utils";
import { recentSearches, pushRecentSearch, clearRecentSearches } from "../lib/search";

const SYNC_LABEL = { synced: "Synced", syncing: "Syncing…", offline: "Offline" } as const;

export function Shell() {
  const nav = useNavigate();
  const [newGroup, newGroupDialog] = useNewGroup();
  const { verified, resendVerification, email: accountEmail } = useAuth();
  const [verifyHidden, setVerifyHidden] = useState(false);
  const loc = useLocation();
  const online = useOnline();
  const { snippets, sync, groups: allGroupNames, groupMeta, save } = useSnippets();
  const { items: vaultItems, status: vaultStatus, available: vaultAvailable, lock: lockVault } = useVault();
  const [dropOn, setDropOn] = useState<string | null>(null);
  const toast = useToast();
  const { isLight, toggle: toggleTheme } = useTheme();
  const [params, setParams] = useSearchParams();
  const [palette, setPalette] = useState(false);
  const [settings, setSettings] = useState(false);
  const [more, setMore] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>(() => recentSearches());
  const [searchFocus, setSearchFocus] = useState(false);

  const q = params.get("q") ?? "";
  const onSearch = (v: string) => {
    const isLibrary = loc.pathname === "/" || loc.pathname.startsWith("/lang/") || loc.pathname.startsWith("/tag/") || loc.pathname.startsWith("/group/") || loc.pathname === "/favorites";
    if (isLibrary) setParams(v ? { q: v } : {}, { replace: true });
    else nav(v ? `/?q=${encodeURIComponent(v)}` : "/");
  };

  /* the "More" sheet closes on navigation and on Escape */
  useEffect(() => { setMore(false); }, [loc.pathname]);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMore(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [more]);

  /* global shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); return; }
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key.toLowerCase() === "n") { e.preventDefault(); nav("/new"); }
      else if (e.key.toLowerCase() === "d") { e.preventDefault(); toggleTheme(); toast(isLight ? "Dark mode" : "Light mode"); }
    };
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || t.closest?.(".cm-editor")) return;
      if (document.querySelector("dialog[open]")) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (text.trim().length < 3) return;
      e.preventDefault();
      nav("/new", { state: { code: text } });
      toast("Pasted into a new snippet");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("paste", onPaste); };
  }, [nav, toast, toggleTheme, isLight]);

  const { langs, tags, groups } = useMemo(() => {
    const lc: Record<string, number> = {}, tc: Record<string, number> = {}, gc: Record<string, number> = {};
    snippets.forEach((s) => { if (s.group) gc[s.group] = (gc[s.group] ?? 0) + 1; lc[s.language] = (lc[s.language] ?? 0) + 1; s.tags.forEach((t) => (tc[t] = (tc[t] ?? 0) + 1)); });
    const langs = Object.entries(lc).sort((a, b) => b[1] - a[1] || LANGUAGES.indexOf(a[0] as never) - LANGUAGES.indexOf(b[0] as never));
    const tags = Object.entries(tc).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const groups = allGroupNames.map((g) => [g, gc[g] ?? 0] as [string, number]);
    return { langs, tags, groups };
  }, [snippets, allGroupNames]);
  const favs = snippets.filter((s) => s.favorite).length;
  const sharedCount = snippets.filter((s) => s.share_token).length + Object.values(groupMeta).filter((m) => m.share_token).length;
  const moreActive = ["/vault", "/shared", "/insights"].some((p) => loc.pathname === p || loc.pathname.startsWith(`${p}/`));

  const item = "relative flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink";
  const active = "!bg-accent/15 !text-ink font-bold before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-accent before:content-['']";

  return (
    <div className="flex min-h-screen flex-col">
      {newGroupDialog}
      {!verified && !verifyHidden && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line bg-surface-2 px-4 py-2 text-center text-[13px]">
          <span>Confirm your email — we sent a link to <b>{accountEmail}</b>.</span>
          <button className="link-btn" onClick={() => resendVerification().then(() => toast("Verification email sent"), () => toast("Couldn't send — try again in a minute", { kind: "err" }))}>Resend</button>
          <button className="link-btn" onClick={() => setVerifyHidden(true)}>Dismiss</button>
        </div>
      )}
      {!online && (
        <div className="flex items-center justify-center gap-2.5 border-b border-accent/40 bg-accent/15 px-4 py-2 text-center text-[13px] font-semibold">
          <Icon name="wifioff" size={16} /> You're offline — your vault still works and changes sync when you're back.
        </div>
      )}
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-line bg-bg/80 px-3.5 py-2.5 backdrop-blur-xl backdrop-saturate-150 md:flex-nowrap md:px-[18px]">
        <NavLink to="/" className="mr-2"><Logo /></NavLink>
        <label className="relative order-3 basis-full md:order-none md:max-w-[460px] md:flex-1 md:basis-auto">
          <span className="sr-only">Search snippets</span>
          <Icon name="search" className="absolute left-3 top-[10px] text-faint" />
          <input ref={searchRef} type="search" value={q} onChange={(e) => onSearch(e.target.value)}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => { setSearchFocus(false); if (q.trim().length >= 2) setRecent(pushRecentSearch(q)); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q.trim().length >= 2) setRecent(pushRecentSearch(q));
              else if (e.key === "Escape") { setSearchFocus(false); e.currentTarget.blur(); }
            }}
            placeholder="Search title, code or tag…"
            className="h-[38px] w-full rounded-[10px] border border-line bg-surface pl-10 pr-11 outline-none transition placeholder:text-faint focus:border-accent focus:ring-[3px] focus:ring-accent/20" />
          <kbd className="absolute right-2 top-2 hidden rounded-md border border-line-strong bg-surface-3 px-1.5 font-mono text-[11px] text-muted md:block">/</kbd>
          {searchFocus && !q && recent.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-[12px] border border-line-strong bg-surface p-1.5 text-left shadow-[0_24px_60px_-16px_rgba(0,0,0,.7)]">
              <div className="flex items-center justify-between px-2.5 pb-1 pt-1">
                <span className="text-[11px] font-bold uppercase tracking-[.1em] text-faint">Recent searches</span>
                <button type="button" className="text-[11.5px] font-semibold text-faint hover:text-ink"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { clearRecentSearches(); setRecent([]); }}>Clear</button>
              </div>
              {recent.map((r) => (
                <button key={r} type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onSearch(r); setSearchFocus(false); }}
                  className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink">
                  <Icon name="search" size={15} className="text-faint" />
                  <span className="min-w-0 flex-1 truncate">{r}</span>
                </button>
              ))}
            </div>
          )}
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          <span data-s={sync} title={`Sync status: ${SYNC_LABEL[sync]}`}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-[12.5px] text-muted">
            <span className={`size-[7px] rounded-full ${sync === "offline" ? "bg-danger" : "bg-accent"} ${sync === "syncing" ? "animate-[pulse-dot_1s_infinite]" : ""}`} />
            <span className="hidden md:inline">{SYNC_LABEL[sync]}</span>
          </span>
          <button className="btn btn-ghost !px-2.5 hidden md:inline-flex" aria-label="Command palette" onClick={() => setPalette(true)}>
            <Icon name="command" size={17} />
          </button>
          {vaultAvailable && (
            <button className="btn btn-ghost !px-2.5" aria-label={vaultStatus === "unlocked" ? "Lock the vault" : "Vault"}
              title={vaultStatus === "unlocked" ? "Lock the vault" : "Vault"}
              onClick={() => { if (vaultStatus === "unlocked") { lockVault(); toast("Vault locked"); } else nav("/vault"); }}>
              <Icon name={vaultStatus === "unlocked" ? "unlock" : "lock"} size={17} />
            </button>
          )}
          {/* On phones the bottom nav already carries "New" in the centre, so this
              button hides below md — one + on screen, always reachable by thumb. */}
          <button className="btn btn-primary hidden md:inline-flex" onClick={() => nav("/new")}>
            <Icon name="plus" size={17} /> New
          </button>
          <AccountMenu onSettings={() => setSettings(true)} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="sticky top-[59px] hidden h-[calc(100vh-59px)] w-[236px] shrink-0 overflow-y-auto overscroll-contain border-r border-line px-3 pb-6 pt-[18px] md:block">
          <SideGroup title="Library">
            <NavLink end to="/" className={({ isActive }) => `${item} ${isActive ? active : ""}`}>
              <Icon name="library" size={17} /><span className="flex-1">All snippets</span><Count n={snippets.length} />
            </NavLink>
            <NavLink to="/favorites" className={({ isActive }) => `${item} ${isActive ? active : ""}`}>
              <Icon name="star" size={17} /><span className="flex-1">Favourites</span><Count n={favs} />
            </NavLink>
            <NavLink to="/groups" className={({ isActive }) => `${item} ${isActive ? active : ""}`}>
              <Icon name="folder" size={17} /><span className="flex-1">All groups</span><Count n={allGroupNames.length} />
            </NavLink>
            {vaultAvailable && (
              <NavLink to="/vault" className={({ isActive }) => `${item} ${isActive ? active : ""}`}>
                <Icon name={vaultStatus === "unlocked" ? "unlock" : "lock"} size={17} /><span className="flex-1">Vault</span><Count n={vaultItems.length} />
              </NavLink>
            )}
            <NavLink to="/shared" className={({ isActive }) => `${item} ${isActive ? active : ""}`}>
              <Icon name="link" size={17} /><span className="flex-1">Shared snippets</span><Count n={sharedCount} />
            </NavLink>
            <NavLink to="/insights" className={({ isActive }) => `${item} ${isActive ? active : ""}`}>
              <Icon name="chart" size={17} /><span className="flex-1">Insights</span>
            </NavLink>
          </SideGroup>
          <SideGroup title="Groups" action={
            <button aria-label="New group" title="New group" className="grid size-6 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
              onClick={newGroup}>
              <Icon name="plus" size={15} />
            </button>}>
            {groups.length === 0 && <p className="px-2.5 py-1 text-[12.5px] text-faint">No groups yet — press + to create one.</p>}
            {groups.map(([g, n]) => {
              const m = groupMeta[g] ?? {};
              return (
                <NavLink key={g} to={`/group/${encodeURIComponent(g)}`}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-snippet-id")) { e.preventDefault(); setDropOn(g); } }}
                  onDragLeave={() => setDropOn((d) => (d === g ? null : d))}
                  onDrop={(e) => {
                    e.preventDefault(); setDropOn(null);
                    const sn = snippets.find((x) => x.id === e.dataTransfer.getData("text/x-snippet-id"));
                    if (sn && sn.group !== g) { save({ ...sn, group: g, updated_at: new Date().toISOString() }); toast(`Moved to ${g}`); }
                  }}
                  className={({ isActive }) => `${item} ${isActive ? active : ""} ${dropOn === g ? "!bg-accent/25 ring-2 ring-accent" : ""}`}>
                  {m.emoji ? <span className="w-[17px] text-center text-[15px] leading-none">{m.emoji}</span>
                    : <Icon name="folder" size={17} style={m.color ? { color: m.color } : undefined} />}
                  <span className="flex-1 truncate">{g}</span>
                  {m.color && <span className="size-2 rounded-full" style={{ background: m.color }} />}
                  <Count n={n} />
                </NavLink>
              );
            })}
          </SideGroup>
          {langs.length > 0 && (
            <SideGroup title="Languages">
              {langs.map(([l, n]) => (
                <NavLink key={l} to={`/lang/${encodeURIComponent(l)}`} className={({ isActive }) => `${item} ${isActive ? active : ""}`}>
                  <LangIcon lang={l} size={16} />
                  <span className="flex-1 truncate">{l}</span><Count n={n} />
                </NavLink>
              ))}
            </SideGroup>
          )}
          {tags.length > 0 && (
            <SideGroup title="Tags">
              {tags.slice(0, 20).map(([t, n]) => (
                <NavLink key={t} to={`/tag/${encodeURIComponent(t)}`} className={({ isActive }) => `${item} ${isActive ? active : ""}`}>
                  <span className="flex-1 truncate">#{t}</span><Count n={n} />
                </NavLink>
              ))}
            </SideGroup>
          )}
        </aside>
        <main className="min-w-0 flex-1 px-3.5 pb-28 pt-[18px] md:px-[clamp(18px,3vw,44px)] md:pb-[90px] md:pt-7">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg/90 px-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl md:hidden" aria-label="Primary">
        <MobTab to="/" icon="library" label="Library" end />
        <MobTab to="/favorites" icon="star" label="Favourites" />
        <button onClick={() => nav("/new")} aria-label="New snippet" className="flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold text-accent-ink">
          <span className="grid h-[34px] w-[46px] place-items-center rounded-xl bg-accent"><Icon name="plus" /></span>
        </button>
        <MobTab to="/groups" icon="folder" label="Groups" />
        <button onClick={() => setMore(true)} aria-label="More" aria-haspopup="dialog" aria-expanded={more}
          className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold ${moreActive ? "text-ink [&_svg]:text-accent" : "text-faint"}`}>
          <Icon name="more" /> More
        </button>
      </nav>

      <MoreSheet open={more} onClose={() => setMore(false)} onSettings={() => setSettings(true)}
        vaultAvailable={vaultAvailable} vaultUnlocked={vaultStatus === "unlocked"} vaultCount={vaultItems.length} sharedCount={sharedCount} />

      <CommandPalette open={palette} onClose={() => setPalette(false)} onSettings={() => setSettings(true)} />
      <SettingsDialog open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

function SideGroup({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 ml-2.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-[.1em] text-faint">{title}{action}</h3>
      {children}
    </div>
  );
}
const Count = ({ n }: { n: number }) => <span className="font-mono text-xs tabular-nums text-faint">{n}</span>;

function MobTab({ to, icon, label, end }: { to: string; icon: IconName; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => `flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold ${isActive ? "text-ink [&_svg]:text-accent" : "text-faint"}`}>
      <Icon name={icon} /> {label}
    </NavLink>
  );
}

function SheetRow({ icon, label, count, onClick }: { icon: IconName; label: string; count?: number; onClick(): void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-semibold text-ink transition hover:bg-surface-2 active:bg-surface-2">
      <Icon name={icon} size={19} className="text-accent" />
      <span className="flex-1">{label}</span>
      {count !== undefined && <Count n={count} />}
    </button>
  );
}

function MoreSheet({ open, onClose, onSettings, vaultAvailable, vaultUnlocked, vaultCount, sharedCount }: {
  open: boolean; onClose(): void; onSettings(): void;
  vaultAvailable: boolean; vaultUnlocked: boolean; vaultCount: number; sharedCount: number;
}) {
  const nav = useNavigate();
  if (!open) return null;
  const go = (to: string) => { onClose(); nav(to); };
  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="More">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div className="anim-sheet absolute inset-x-0 bottom-0 rounded-t-[22px] border-t border-line-strong bg-surface p-3 pb-[calc(14px+env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-20px_rgba(0,0,0,.6)]">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong" />
        <div className="mb-1 flex items-center justify-between px-3">
          <span className="text-[11px] font-bold uppercase tracking-[.1em] text-faint">More</span>
          <button aria-label="Close" onClick={onClose} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"><Icon name="x" size={15} /></button>
        </div>
        <div className="grid gap-0.5">
          {vaultAvailable && (
            <SheetRow icon={vaultUnlocked ? "unlock" : "lock"} label="Vault" count={vaultCount} onClick={() => go("/vault")} />
          )}
          <SheetRow icon="link" label="Shared snippets" count={sharedCount} onClick={() => go("/shared")} />
          <SheetRow icon="chart" label="Insights" onClick={() => go("/insights")} />
          <SheetRow icon="sliders" label="Settings" onClick={() => { onClose(); onSettings(); }} />
        </div>
      </div>
    </div>
  );
}
