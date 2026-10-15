import { useState, type FormEvent } from "react";
import { useAuth, authMessage } from "../hooks/auth";
import { useOnline } from "../hooks/ui";
import { Logo } from "../components/Logo";
import { Icon } from "../components/Icon";
import { CodeBlock } from "../components/CodeBlock";

const DEMO_CODE = `const vault = await snippets.search("debounce");

// every device. every keystroke. offline too.
vault.sync({ realtime: true });`;

export function Login() {
  const { signIn, signUp, reset } = useAuth();
  const online = useOnline();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; kind?: "err" | "ok" }>({ text: "" });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !pw) return setNote({ text: "Enter an email and a password.", kind: "err" });
    setBusy(true);
    setNote({ text: mode === "up" ? "Creating your vault…" : "Signing in…" });
    try {
      await (mode === "up" ? signUp(email.trim(), pw) : signIn(email.trim(), pw));
    } catch (err) {
      setNote({ text: authMessage(err), kind: "err" });
      setBusy(false);
    }
  };
  const forgot = async () => {
    if (!email.trim()) return setNote({ text: "Type your email above first, then press this again.", kind: "err" });
    try { await reset(email.trim()); setNote({ text: "Password reset email sent — check your inbox.", kind: "ok" }); }
    catch (err) { setNote({ text: authMessage(err), kind: "err" }); }
  };

  const input = "w-full rounded-[10px] border border-line bg-surface-2 px-3 py-3 outline-none transition placeholder:text-faint focus:border-accent focus:ring-[3px] focus:ring-accent/20";

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative flex flex-col justify-between gap-10 overflow-hidden border-b border-line bg-surface px-6 py-7 lg:border-b-0 lg:border-r lg:px-[clamp(28px,5vw,72px)] lg:py-12
        bg-[radial-gradient(900px_500px_at_10%_-10%,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_60%),radial-gradient(700px_500px_at_110%_110%,color-mix(in_srgb,var(--accent)_9%,transparent),transparent_60%)]">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_30%_30%,#000_0%,transparent_70%)]" />
        <div className="relative"><Logo size={34} text="text-xl" /></div>
        <div className="relative">
          <h1 className="mb-4 max-w-[12ch] text-[clamp(36px,5vw,64px)] font-bold leading-[1.02] tracking-[-0.045em]">
            Every snippet you've <em className="not-italic text-accent">ever</em> needed.
          </h1>
          <p className="mb-7 max-w-[46ch] text-base text-muted lg:text-[17px]">
            A private, realtime vault for the code you keep rewriting. Search it in a keystroke, copy it in another.
          </p>
          <div className="hidden max-w-[480px] -rotate-1 lg:block">
            <CodeBlock code={DEMO_CODE} lang="JavaScript" title="vault.js" />
          </div>
        </div>
        <div className="relative hidden flex-wrap gap-x-[18px] gap-y-2 text-[13.5px] text-muted lg:flex">
          {["Realtime sync", "Works offline", "Installable app", "Private by default"].map((f) => (
            <span key={f} className="inline-flex items-center gap-2"><Icon name="check" size={15} className="text-accent" />{f}</span>
          ))}
        </div>
      </section>

      <section className="grid place-items-center px-6 py-8">
        <form onSubmit={submit} className="w-full max-w-[380px]" noValidate>
          <h2 className="mb-1.5 text-[28px] font-bold tracking-tight">{mode === "up" ? "Create your vault" : "Welcome back"}</h2>
          <p className="mb-6 text-muted">{mode === "up" ? "Pick any password with 6 or more characters." : "Sign in to sync your snippets."}</p>

          <label className="mb-3.5 block"><span className="mb-1.5 block text-[12.5px] font-semibold text-muted">Email</span>
            <input className={input} type="email" autoComplete="email" inputMode="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="mb-4 block"><span className="mb-1.5 block text-[12.5px] font-semibold text-muted">Password</span>
            <span className="relative block">
              <input className={`${input} pr-11`} type={show ? "text" : "password"} autoComplete={mode === "up" ? "new-password" : "current-password"}
                placeholder="At least 6 characters" value={pw} onChange={(e) => setPw(e.target.value)} />
              <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}
                className="absolute right-1 top-1 grid size-10 place-items-center rounded-lg text-muted hover:text-ink">
                <Icon name={show ? "eyeoff" : "eye"} size={17} />
              </button>
            </span></label>

          <button className="btn btn-primary btn-lg btn-wide" disabled={busy || !online}>
            {busy ? "Please wait…" : mode === "up" ? "Create account" : "Sign in"}
          </button>
          {!online && <p className="mt-3 text-[13px] text-danger">You're offline — connect to the internet to sign in.</p>}
          <p role="status" className={`mt-3.5 min-h-[22px] text-[13px] ${note.kind === "err" ? "text-danger" : note.kind === "ok" ? "text-accent" : "text-muted"}`}>{note.text}</p>

          <div className="flex items-center justify-between text-[13px]">
            <button type="button" className="link-btn" onClick={() => { setMode(mode === "in" ? "up" : "in"); setNote({ text: "" }); }}>
              {mode === "in" ? "Create an account" : "I already have an account"}
            </button>
            {mode === "in" && <button type="button" className="link-btn" onClick={forgot}>Forgot password?</button>}
          </div>

        </form>
      </section>
    </div>
  );
}
