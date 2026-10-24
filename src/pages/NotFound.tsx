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
      <div className="my-4 text-[clamp(88px,22vw,160px)] font-semibold leading-[.9] tracking-[-0.06em] text-line-strong">404</div>
      <h1 className="mb-2.5 text-[clamp(22px,4vw,28px)] font-semibold tracking-[-0.02em]">
        {what ? `That ${what} doesn't exist` : "This page wandered off"}
      </h1>
      <p className="mx-auto mb-6 max-w-[44ch] text-muted">
        {what ? "It may have been deleted, or the link is out of date." : "The link may be broken, or the page was moved. Your snippets are safe."}
      </p>
      <pre className="mb-6 overflow-x-auto rounded-[14px] border border-line-strong bg-surface px-[18px] py-3.5 text-left font-mono text-[13px] leading-[1.8]">
        <span className="text-muted">$</span> vault open <span className="text-muted">{pathname}</span>{"\n"}
        <span className="text-danger">error:</span> <span className="text-muted">no such route (404)</span>{"\n"}
        <span className="text-muted">$</span> <span className="inline-block h-[15px] w-2 translate-y-[2px] bg-ink [animation:blink_1s_steps(1)_infinite]" />
      </pre>
      <div className="flex flex-wrap justify-center gap-2.5">
        <Link to="/" className="btn btn-primary btn-lg"><Icon name="home" /> Back to vault</Link>
        <button className="btn btn-lg" onClick={() => nav(-1)}><Icon name="back" /> Go back</button>
      </div>
    </div>
  );
  if (what) return <div className="py-8">{inner}</div>;
  return (
    <div className="grid min-h-screen place-items-center px-5 py-7">
      {inner}
    </div>
  );
}
