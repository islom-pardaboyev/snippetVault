import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth, authMessage } from "../hooks/auth";
import { useOnline } from "../hooks/ui";
import { Logo } from "../components/Logo";
import { Icon } from "../components/Icon";
import { CodeBlock } from "../components/CodeBlock";
import { PwMeter, passwordValid } from "../components/PwMeter";
import { ANDROID_APK_URL, isAndroidBrowser, isNativeApp } from "../lib/native";

const DEMO_CODE = `const vault = await snippets.search("debounce");

// every device. every keystroke. offline too.
vault.sync({ realtime: true });`;

export function Login() {
  const { signIn, signUp, signInWithGoogle, reset } = useAuth();
  const online = useOnline();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; kind?: "err" | "ok" }>({ text: "" });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !pw) return setNote({ text: "Enter an email and a password.", kind: "err" });
    if (mode === "up") {
      if (pw.length < 8) return setNote({ text: "Use at least 8 characters for your password.", kind: "err" });
      if (pw !== pw2) return setNote({ text: "The two passwords don't match.", kind: "err" });
    }
    setBusy(true);
    setNote({ text: mode === "up" ? "Creating your vault…" : "Signing in…" });
    try {
      await (mode === "up" ? signUp(email.trim(), pw) : signIn(email.trim(), pw));
    } catch (err) {
      setNote({ text: authMessage(err), kind: "err" });
      setBusy(false);
    }
  };
  const google = async () => {
    setBusy(true);
    setNote({ text: "Opening Google…" });
    try { await signInWithGoogle(); }
    catch (err) { setNote({ text: authMessage(err), kind: "err" }); setBusy(false); }
  };
  const forgot = async () => {
    if (!email.trim()) return setNote({ text: "Type your email above first, then press this again.", kind: "err" });
    try { await reset(email.trim()); setNote({ text: "Password reset email sent — check your inbox.", kind: "ok" }); }
    catch (err) { setNote({ text: authMessage(err), kind: "err" }); }
  };

  const input = "field";

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="flex flex-col justify-between gap-10 border-b border-line bg-surface px-6 py-7 lg:border-b-0 lg:border-r lg:px-[clamp(28px,5vw,72px)] lg:py-12">
        <div><Logo size={30} text="text-[16px]" /></div>
        <div>
          <h1 className="mb-4 max-w-[14ch] text-[clamp(34px,4.6vw,56px)] font-semibold leading-[1.04] tracking-[-0.035em]">
            Every snippet you've ever needed.
          </h1>
          <p className="mb-8 max-w-[46ch] text-[15px] leading-relaxed text-muted lg:text-[16px]">
            A private, realtime vault for the code you keep rewriting. Search it in a keystroke, copy it in another.
          </p>
          <div className="hidden max-w-[480px] lg:block">
            <CodeBlock code={DEMO_CODE} lang="JavaScript" title="vault.js" />
          </div>
        </div>
        <div className="hidden flex-wrap gap-x-[18px] gap-y-2 text-[13px] text-muted lg:flex">
          {["Realtime sync", "Works offline", "Installable app", "Private by default"].map((f) => (
            <span key={f} className="inline-flex items-center gap-2"><Icon name="check" size={14} className="text-muted" />{f}</span>
          ))}
        </div>
      </section>

      <section className="grid place-items-center px-6 py-8">
        <form onSubmit={submit} className="w-full max-w-[380px]" noValidate>
          <h2 className="mb-1.5 text-[26px] font-semibold tracking-[-0.02em]">{mode === "up" ? "Create your vault" : "Welcome back"}</h2>
          <p className="mb-6 text-muted">{mode === "up" ? "Use a password with 8 or more characters." : "Sign in to sync your snippets."}</p>

          {isAndroidBrowser && (
            <a href={ANDROID_APK_URL} download className="btn btn-lg btn-wide mb-4">
              <Icon name="download" size={17} /> Download the Android app
            </a>
          )}
          {/* The popup sign-in cannot run inside the Android WebView; email sign-in works there. */}
          {!isNativeApp && (
          <button type="button" className="btn btn-lg btn-wide mb-4" onClick={google} disabled={busy || !online}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
              <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
            </svg>
            Continue with Google
          </button>
          )}
          {!isNativeApp && (
          <div className="mb-4 flex items-center gap-3 text-[12px] uppercase tracking-[.1em] text-faint">
            <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
          </div>
          )}

          <label className="mb-3.5 block"><span className="mb-1.5 block text-[12.5px] font-semibold text-muted">Email</span>
            <input className={input} type="email" autoComplete="email" inputMode="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="mb-4 block"><span className="mb-1.5 block text-[12.5px] font-semibold text-muted">Password</span>
            <span className="relative block">
              <input className={`${input} pr-11`} type={show ? "text" : "password"} autoComplete={mode === "up" ? "new-password" : "current-password"}
                placeholder={mode === "up" ? "At least 8 characters" : "Your password"} value={pw} onChange={(e) => setPw(e.target.value)} />
              <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}
                className="absolute right-1 top-1 grid size-10 place-items-center rounded-lg text-muted hover:text-ink">
                <Icon name={show ? "eyeoff" : "eye"} size={17} />
              </button>
            </span></label>
          {mode === "up" && (
            <label className="mb-4 block"><span className="mb-1.5 block text-[12.5px] font-semibold text-muted">Confirm password</span>
              <input className={input} type={show ? "text" : "password"} autoComplete="new-password" placeholder="Repeat your password"
                value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
          )}
          {mode === "up" && (
            <div className="-mt-1 mb-4 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Password requirements</p>
              <PwMeter pw={pw} confirm={pw2} min={8} />
            </div>
          )}

          <button className="btn btn-primary btn-lg btn-wide" disabled={busy || !online || (mode === "up" && !passwordValid(pw, pw2))}>
            {busy ? "Please wait…" : mode === "up" ? "Create account" : "Sign in"}
          </button>
          {!online && <p className="mt-3 text-[13px] text-danger">You're offline — connect to the internet to sign in.</p>}
          <p role="status" className={`mt-3.5 min-h-[22px] text-[13px] ${note.kind === "err" ? "text-danger" : note.kind === "ok" ? "text-ink" : "text-muted"}`}>{note.text}</p>

          <div className="flex items-center justify-between text-[13px]">
            <button type="button" className="link-btn" onClick={() => { setMode(mode === "in" ? "up" : "in"); setNote({ text: "" }); setPw2(""); }}>
              {mode === "in" ? "Create an account" : "I already have an account"}
            </button>
            {mode === "in" && <button type="button" className="link-btn" onClick={forgot}>Forgot password?</button>}
          </div>

        </form>

        <p className="mt-7 w-full max-w-[380px] text-center text-[12.5px] leading-relaxed text-faint">
          By creating an account or signing in, you agree to our{" "}
          <Link to="/terms" className="underline underline-offset-4 transition hover:text-muted">Terms of Service</Link>
          {" "}and{" "}
          <Link to="/privacy" className="underline underline-offset-4 transition hover:text-muted">Privacy Policy</Link>.
        </p>
      </section>
    </div>
  );
}
