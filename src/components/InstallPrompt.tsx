import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { LogoMark } from "./Logo";
import { isMobileDevice, useInstall } from "../hooks/ui";

const KEY = "sv:install-dismissed";
const WEEK = 7 * 864e5;

/** Bottom sheet inviting mobile visitors to install the PWA. */
export function InstallPrompt({ aboveNav = false }: { aboveNav?: boolean }) {
  const { canInstall, ios, install } = useInstall();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState(false);

  const eligible = (canInstall || ios) && isMobileDevice();

  useEffect(() => {
    if (!eligible) { setOpen(false); return; }
    try { if (Date.now() - Number(localStorage.getItem(KEY) ?? 0) < WEEK) return; } catch { /* ignore */ }
    const t = setTimeout(() => setOpen(true), 2200);
    return () => clearTimeout(t);
  }, [eligible]);

  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
  };

  if (!open) return null;
  return (
    <div role="dialog" aria-label="Install SnippetVault"
      className={`anim-rise fixed inset-x-3 z-40 rounded-2xl border border-line-strong bg-surface p-4 shadow-[0_24px_60px_-12px_rgba(0,0,0,.7)] ${aboveNav ? "bottom-[86px]" : "bottom-4"}`}>
      <div className="flex items-start gap-3">
        <LogoMark size={44} />
        <div className="min-w-0 flex-1">
          <div className="font-bold tracking-tight">Install SnippetVault</div>
          <p className="text-[13.5px] text-muted">Add it to your home screen for a full-screen app that works offline.</p>
        </div>
        <button aria-label="Not now" onClick={dismiss} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2"><Icon name="x" size={16} /></button>
      </div>

      {steps ? (
        <ol className="mt-3 grid gap-2 rounded-xl bg-surface-2 p-3 text-[13.5px] text-muted">
          <li><b className="text-ink">1.</b> Tap the <b className="text-ink">Share</b> button in Safari's toolbar.</li>
          <li><b className="text-ink">2.</b> Choose <b className="text-ink">Add to Home Screen</b>.</li>
          <li><b className="text-ink">3.</b> Tap <b className="text-ink">Add</b> — done.</li>
        </ol>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button className="btn btn-primary flex-1"
          onClick={async () => { if (canInstall) { await install(); dismiss(); } else setSteps(true); }}>
          <Icon name="download" size={16} /> {canInstall ? "Install app" : "How to install"}
        </button>
        <button className="btn" onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
}
