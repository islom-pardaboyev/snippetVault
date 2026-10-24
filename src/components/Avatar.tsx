import { useState } from "react";

/** The name to show for an account, falling back to the email's local part. */
export function accountName(displayName?: string | null, email?: string | null) {
  return displayName?.trim() || email?.split("@")[0] || "Account";
}

/** One or two letters used when an account has no profile picture. */
function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({ src, name, size = 28 }: { src?: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    );
  }
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className="grid shrink-0 place-items-center rounded-full bg-accent font-bold uppercase text-accent-ink">
      {initials(name)}
    </span>
  );
}
