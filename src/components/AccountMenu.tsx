import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { Avatar, accountName } from "./Avatar";
import { isAdminEmail, useAuth } from "../hooks/auth";
import { useTheme, useToast } from "../hooks/ui";

function MenuItem({ icon, label, danger, onClick }: { icon: IconName; label: string; danger?: boolean; onClick(): void }) {
  const cls = `flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm font-medium transition ${danger ? "text-muted hover:bg-danger/15 hover:text-danger" : "text-muted hover:bg-surface-2 hover:text-ink"}`;
  const body = (
    <>
      <Icon name={icon} size={17} />
      <span className="flex-1 truncate">{label}</span>
    </>
  );
  return <button type="button" role="menuitem" onClick={onClick} className={cls}>{body}</button>;
}

/** Header account menu: who's signed in, their picture, and quick account actions. */
export function AccountMenu({ onSettings }: { onSettings(): void }) {
  const { user, email, logout } = useAuth();
  const { isLight, toggle: toggleTheme } = useTheme();
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const name = accountName(user?.displayName, email);
  // Header button shows just the name; the dropdown keeps the full name + email.
  const shortName = user?.displayName?.trim().split(/\s+/)[0] || name;
  const viaGoogle = !!user?.providerData.some((p) => p.providerId === "google.com");
  const method = !user ? "Demo mode" : viaGoogle ? "Signed in with Google" : "Email & password";

  // Close on outside click ...
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  // ... on Escape ...
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // ... and whenever the route changes.
  useEffect(() => setOpen(false), [loc.pathname]);

  const run = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <div ref={root} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" title={email ?? undefined}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-[38px] items-center gap-2 rounded-full border bg-surface pl-1 pr-2.5 transition ${open ? "border-accent ring-[3px] ring-accent/20" : "border-line hover:border-line-strong hover:bg-surface-2"}`}>
        <Avatar src={user?.photoURL} name={name} />
        <span className="max-w-[84px] truncate text-[13px] font-semibold sm:max-w-[130px]">{shortName}</span>
        <Icon name="chevron" size={15} className={`text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" aria-label="Account"
          className="anim-rise absolute right-0 top-full z-50 mt-2 w-[min(288px,calc(100vw-24px))] overflow-hidden rounded-xl border border-line-strong bg-surface p-1.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,.7)]">
          <div className="flex items-center gap-3 rounded-lg px-2.5 py-2.5">
            <Avatar src={user?.photoURL} name={name} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{name}</div>
              {email && <div className="truncate text-[12.5px] text-muted">{email}</div>}
              <div className="mt-0.5 truncate text-[11.5px] text-faint">{method}</div>
            </div>
          </div>

          <div className="my-1 h-px bg-line" />

          <MenuItem icon="sliders" label="Settings" onClick={run(onSettings)} />
          {isAdminEmail(email) && <MenuItem icon="lock" label="Admin" onClick={run(() => nav("/admin"))} />}
          <MenuItem icon={isLight ? "moon" : "sun"} label={isLight ? "Dark mode" : "Light mode"}
            onClick={run(() => { toggleTheme(); toast(isLight ? "Dark mode" : "Light mode"); })} />

          <div className="my-1 h-px bg-line" />

          <MenuItem icon="logout" label="Sign out" danger onClick={run(() => logout())} />
        </div>
      )}
    </div>
  );
}
