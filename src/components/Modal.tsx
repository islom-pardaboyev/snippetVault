import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

interface PromptOpts { title: string; description?: string; label?: string; placeholder?: string; initial?: string; confirmLabel?: string; icon?: IconName; maxLength?: number; }
interface ConfirmOpts { title: string; description?: string; confirmLabel?: string; danger?: boolean; icon?: IconName; }
interface FillOpts { title: string; vars: string[]; confirmLabel?: string; }
interface Ctx {
  prompt(o: PromptOpts): Promise<string | null>;
  confirm(o: ConfirmOpts): Promise<boolean>;
  fill(o: FillOpts): Promise<Record<string, string> | null>;
}

const ModalContext = createContext<Ctx | null>(null);
type State =
  | { kind: "prompt"; opts: PromptOpts; done(v: string | null): void }
  | { kind: "confirm"; opts: ConfirmOpts; done(v: boolean): void }
  | { kind: "fill"; opts: FillOpts; done(v: Record<string, string> | null): void };

const VARS_KEY = "sv:vars";
const loadVars = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(VARS_KEY) ?? "{}"); } catch { return {}; } };

export function ModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [value, setValue] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDialogElement>(null);

  const prompt = useCallback((opts: PromptOpts) => new Promise<string | null>((res) => {
    setValue(opts.initial ?? "");
    setState({ kind: "prompt", opts, done: res });
  }), []);
  const confirm = useCallback((opts: ConfirmOpts) => new Promise<boolean>((res) => {
    setState({ kind: "confirm", opts, done: res });
  }), []);
  const fill = useCallback((opts: FillOpts) => new Promise<Record<string, string> | null>((res) => {
    const saved = loadVars();
    setValues(Object.fromEntries(opts.vars.map((v) => [v, saved[v] ?? ""])));
    setState({ kind: "fill", opts, done: res });
  }), []);
  const ctx = useMemo(() => ({ prompt, confirm, fill }), [prompt, confirm, fill]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (state && !d.open) d.showModal();
    if (!state && d.open) d.close();
  }, [state]);

  const cancel = () => {
    if (!state) return;
    if (state.kind === "confirm") state.done(false);
    else state.done(null);
    setState(null);
  };
  const submit = () => {
    if (!state) return;
    if (state.kind === "prompt") {
      const v = value.trim();
      if (!v) return;
      state.done(v);
    } else if (state.kind === "confirm") state.done(true);
    else {
      try { localStorage.setItem(VARS_KEY, JSON.stringify({ ...loadVars(), ...values })); } catch { /* ignore */ }
      state.done(values);
    }
    setState(null);
  };

  const o = state?.opts as (PromptOpts & ConfirmOpts & FillOpts) | undefined;
  const icon: IconName = (state?.kind !== "fill" ? o?.icon : undefined) ?? (state?.kind === "confirm" ? "trash" : state?.kind === "fill" ? "sparkles" : "folder");
  const danger = state?.kind === "confirm" && state.opts.danger;
  const input = "field";

  return (
    <ModalContext.Provider value={ctx}>
      {children}
      <dialog ref={ref} onCancel={(e) => { e.preventDefault(); cancel(); }}
        onClick={(e) => { if (e.target === ref.current) cancel(); }}
        className="m-auto w-[min(440px,calc(100vw-28px))] overflow-hidden rounded-[22px] border border-line-strong bg-surface p-0 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,.7)]">
        {state && o && (
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="max-h-[86vh] overflow-y-auto p-6">
            <div className={`mb-4 grid size-12 place-items-center rounded-2xl ${danger ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent"}`}>
              <Icon name={icon} size={22} />
            </div>
            <h2 className="text-xl font-bold tracking-tight">{o.title}</h2>
            {state.kind !== "fill" && o.description && <p className="mt-1.5 text-sm text-muted">{o.description}</p>}
            {state.kind === "fill" && <p className="mt-1.5 text-sm text-muted">This snippet is a template. Fill in the values and they'll be copied in place.</p>}

            {state.kind === "prompt" && (
              <label className="mt-4 block">
                {state.opts.label && <span className="mb-1.5 block text-[12.5px] font-semibold text-muted">{state.opts.label}</span>}
                <input autoFocus value={value} maxLength={state.opts.maxLength ?? 60} placeholder={state.opts.placeholder}
                  onChange={(e) => setValue(e.target.value)} className={input} />
              </label>
            )}
            {state.kind === "fill" && (
              <div className="mt-4 grid gap-3.5">
                {state.opts.vars.map((v, i) => (
                  <label key={v} className="block">
                    <span className="mb-1.5 block font-mono text-[12.5px] font-semibold text-muted">{`{{${v}}}`}</span>
                    <input autoFocus={i === 0} value={values[v] ?? ""} placeholder={v}
                      onChange={(e) => setValues((x) => ({ ...x, [v]: e.target.value }))} className={input} />
                  </label>
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button type="button" className="btn" onClick={cancel}>Cancel</button>
              <button type="submit" disabled={state.kind === "prompt" && !value.trim()}
                className={`btn ${danger ? "!border-danger !bg-danger !text-[#1a0b0b]" : "btn-primary"}`}>
                {o.confirmLabel ?? (state.kind === "prompt" ? "Create" : state.kind === "fill" ? "Copy" : "Confirm")}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </ModalContext.Provider>
  );
}

export function useModal() {
  const c = useContext(ModalContext);
  if (!c) throw new Error("ModalProvider missing");
  return c;
}
