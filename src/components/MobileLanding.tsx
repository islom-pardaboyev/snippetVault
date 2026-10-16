import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { LogoMark } from "./Logo";
import { isIOS } from "../hooks/ui";
import { ANDROID_APP_URL } from "../lib/app";

/**
 * Shown to phone-sized *browser* visits (see `useAppLanding`). The app is a large-screen
 * experience, so on a phone we point at the installable app instead of squeezing the workspace
 * into a small viewport. The installed app never renders this — it runs full-screen.
 *
 * "Continue on the web instead" opts out permanently, so the page informs rather than locks
 * anyone out (an iPhone visitor has no Android app to install).
 */

const FEATURES: { icon: IconName; label: string }[] = [
  { icon: "code", label: "Snippets with syntax highlighting" },
  { icon: "lock", label: "Encrypted vault for secrets" },
  { icon: "wifioff", label: "Works offline" },
];

export function MobileLanding({ onContinue }: { onContinue: () => void }) {
  const [steps, setSteps] = useState(false);
  const ios = isIOS();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg text-ink">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="anim-rise flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
          <LogoMark size={30} /> SnippetVault
        </div>

        <h1 className="anim-rise mt-9 text-[clamp(26px,7.5vw,34px)] font-bold leading-[1.15] tracking-tight">
          Built for the big screen.
        </h1>
        <p className="anim-rise mt-3 text-[15px] leading-relaxed text-muted">
          Your private code vault. On a phone it lives in the app — install it to keep your snippets
          with you, full-screen and offline.
        </p>

        <ul className="anim-rise mt-6 grid gap-2.5">
          {FEATURES.map((f) => (
            <li key={f.label}
              className="flex items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 text-[14px]">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-accent">
                <Icon name={f.icon} size={15} />
              </span>
              {f.label}
            </li>
          ))}
        </ul>

        <div className="anim-rise mt-7">
          {ios ? (
            <button className="btn btn-primary btn-lg btn-wide" onClick={() => setSteps(true)}>
              <Icon name="download" size={17} /> How to install
            </button>
          ) : (
            <a className="btn btn-primary btn-lg btn-wide" href={ANDROID_APP_URL}
              target="_blank" rel="noopener noreferrer">
              <Icon name="download" size={17} /> Install the app
            </a>
          )}

          {ios && steps ? (
            <ol className="mt-3 grid gap-2 rounded-card border border-line bg-surface p-3.5 text-[13.5px] text-muted">
              <li><b className="text-ink">1.</b> Tap the <b className="text-ink">Share</b> button in Safari's toolbar.</li>
              <li><b className="text-ink">2.</b> Choose <b className="text-ink">Add to Home Screen</b>.</li>
              <li><b className="text-ink">3.</b> Tap <b className="text-ink">Add</b> — SnippetVault opens full-screen.</li>
            </ol>
          ) : null}

          <p className="mt-3 text-center text-[12.5px] text-faint">
            Free · Android 7.0 and up · your vault key never leaves your device
          </p>
        </div>

        <div className="mt-auto pt-9">
          <button onClick={onContinue}
            className="mx-auto block text-[13.5px] font-semibold text-muted underline-offset-4 transition hover:text-ink hover:underline">
            Continue on the web instead
          </button>
          <nav aria-label="Legal" className="mt-5 flex items-center justify-center gap-3 text-[12.5px] text-faint">
            <Link to="/privacy" className="transition hover:text-muted">Privacy</Link>
            <span aria-hidden>·</span>
            <Link to="/terms" className="transition hover:text-muted">Terms</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
