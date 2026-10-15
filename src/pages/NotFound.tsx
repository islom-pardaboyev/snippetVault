import { Link, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";

/** `what` set → rendered inside the app shell (e.g. a deleted snippet). Otherwise full-page 404. */
export function NotFound({ what }: { what?: string }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const inner = (
    <div className="mx-auto w-full max-w-[560px] text-center anim-rise">
      {!what && <div className="mb-2 flex justify-center"><Logo /></div>}
      <div className="my-4 bg-gradient-to-b from-ink from-30% to-ink/10 bg-clip-text text-[clamp(88px,22vw,168px)] font-extrabold leading-[.9] tracking-[-0.07em] text-transparent">
        4<span className="text-accent [-webkit-text-fill-color:var(--accent)]">0</span>4
      </div>
      <h1 className="mb-2.5 text-[clamp(22px,4vw,30px)] font-bold tracking-tight">
        {what ? `That ${what} doesn't exist` : "This page wandered off"}
      </h1>
      <p className="mx-auto mb-6 max-w-[44ch] text-muted">
        {what ? "It may have been deleted, or the link is out of date." : "The link may be broken, or the page was moved. Your snippets are safe."}
      </p>
      <pre className="mb-6 overflow-x-auto rounded-[14px] border border-line-strong bg-surface px-[18px] py-3.5 text-left font-mono text-[13px] leading-[1.8]">
        <span className="text-accent">$</span> vault open <span className="text-muted">{pathname}</span>{"\n"}
        <span className="text-danger">error:</span> <span className="text-muted">no such route (404)</span>{"\n"}
        <span className="text-accent">$</span> <span className="inline-block h-[15px] w-2 translate-y-[2px] bg-accent [animation:blink_1s_steps(1)_infinite]" />
      </pre>
      <div className="flex flex-wrap justify-center gap-2.5">
        <Link to="/" className="btn btn-primary btn-lg"><Icon name="home" /> Back to vault</Link>
        <button className="btn btn-lg" onClick={() => nav(-1)}><Icon name="back" /> Go back</button>
      </div>
    </div>
  );
  if (what) return <div className="py-8">{inner}</div>;
  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(800px_500px_at_50%_-10%,color-mix(in_srgb,var(--accent)_13%,transparent),transparent_65%)] px-5 py-7">
      {inner}
    </div>
  );
}
