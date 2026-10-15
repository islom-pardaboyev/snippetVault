import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { useOnline } from "../hooks/ui";

/** Full-screen "no internet" state, shown when signed out and without a connection. */
export function Offline({ onRetry }: { onRetry?: () => void }) {
  const online = useOnline();
  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(800px_500px_at_50%_-10%,color-mix(in_srgb,var(--accent)_13%,transparent),transparent_65%)] px-5 py-7">
      <div className="anim-rise mx-auto w-full max-w-[520px] text-center">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="mx-auto grid size-[84px] place-items-center rounded-[26px] border border-accent/40 bg-accent/15 text-accent">
          <Icon name="wifioff" size={38} />
        </div>
        <h1 className="mb-2.5 mt-6 text-[clamp(24px,4.5vw,34px)] font-bold tracking-[-0.04em]">You're offline</h1>
        <p className="mx-auto mb-6 max-w-[44ch] text-muted">
          SnippetVault can't reach the internet right now. Sign in once while online and your vault will open offline from then on.
        </p>
        <ul className="mb-6 grid gap-2 text-left">
          {[
            "Snippets you've already opened are saved on this device.",
            "Edits you make offline are queued and sync automatically.",
            "Check your Wi‑Fi or mobile data, then try again.",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-muted">
              <Icon name="check" size={16} className="mt-0.5 text-accent" />{t}
            </li>
          ))}
        </ul>
        <button className="btn btn-primary btn-lg" onClick={() => (onRetry ? onRetry() : location.reload())}>
          <Icon name="refresh" /> Try again
        </button>
        <div className="mt-[18px] inline-flex items-center gap-2 text-[13px] text-muted">
          <span className={`size-2 rounded-full ${online ? "bg-accent" : "bg-danger"}`} />
          {online ? "Connection is back" : "No connection"}
        </div>
      </div>
    </div>
  );
}
