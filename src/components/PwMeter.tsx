import { Icon } from "./Icon";

/**
 * A live "requirements" checklist (+ optional strength bar) shown while someone types a
 * password or an app code. Requirements mirror what the forms actually enforce.
 */

/** The one hard rule for account passwords (Firebase's own minimum is lower; we ask for 8). */
const PW_MIN = 8;

/** True when the password (and confirmation, if given) satisfies the requirement. */
export function passwordValid(pw: string, confirm?: string): boolean {
  return pw.length >= PW_MIN && (confirm === undefined || (pw.length > 0 && pw === confirm));
}

/** 0–4 strength buckets: too short, weak, fair, good, strong. */
function passwordStrength(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= PW_MIN) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

const STRENGTH = [
  { label: "Too short", color: "var(--line-strong)" },
  { label: "Weak", color: "#ff6b6b" },
  { label: "Fair", color: "#ffc83d" },
  { label: "Good", color: "#4ade80" },
  { label: "Strong", color: "var(--accent)" },
];

export function PwMeter({
  pw, confirm, min = PW_MIN, strength = true, lengthLabel,
}: { pw: string; confirm?: string; min?: number; strength?: boolean; lengthLabel?: string }) {
  const reqs: { label: string; ok: boolean }[] = [
    { label: lengthLabel ?? `At least ${min} characters`, ok: pw.length >= min },
    ...(confirm !== undefined ? [{ label: "Both entries match", ok: pw.length > 0 && pw === confirm }] : []),
  ];
  const score = pw.length === 0 ? 0 : pw.length < min ? 1 : passwordStrength(pw);
  const meta = STRENGTH[score];

  return (
    <div className="mt-2.5">
      <ul className="grid gap-1">
        {reqs.map((r) => (
          <li key={r.label} className={`flex items-center gap-2 text-[12.5px] ${r.ok ? "text-ink" : "text-muted"}`}>
            <span aria-hidden className={`grid size-[15px] shrink-0 place-items-center rounded-full border transition-colors ${r.ok ? "border-accent bg-accent text-[var(--accent-ink)]" : "border-line-strong text-transparent"}`}>
              <Icon name="check" size={10} />
            </span>
            {r.label}
          </li>
        ))}
      </ul>
      {strength && pw.length > 0 && (
        <div className="mt-2.5">
          <div className="mb-1.5 flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-1 flex-1 rounded-full transition-colors" style={{ background: i < score ? meta.color : "var(--line-strong)" }} />
            ))}
          </div>
          <p className="text-[12px] text-faint">
            Strength: <b className="font-semibold" style={{ color: meta.color }}>{meta.label}</b>
            {score < 4 ? " — more length, mixed case, numbers or symbols make it stronger." : ""}
          </p>
        </div>
      )}
    </div>
  );
}
