import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { CodeLines } from "./CodeBlock";
import { useSnippets } from "../hooks/snippets";
import { useToast } from "../hooks/ui";
import { diffStats, timeAgo } from "../lib/utils";
import type { Snippet, Version } from "../lib/types";

export function HistoryDialog({ snippet, open, onClose }: { snippet: Snippet; open: boolean; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { listVersions, saveVersion, save } = useSnippets();
  const toast = useToast();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setVersions(null); setSel(0);
      listVersions(snippet.id).then(setVersions).catch(() => setVersions([]));
    }
    if (!open && d.open) d.close();
  }, [open, snippet.id, listVersions]);

  const v = versions?.[sel];
  const restore = () => {
    if (!v) return;
    saveVersion(snippet); // keep the current text in history too
    save({ ...snippet, title: v.title, language: v.language, description: v.description, tags: v.tags, code: v.code, updated_at: new Date().toISOString() });
    toast("Version restored");
    onClose();
  };

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-auto h-[min(86vh,720px)] w-[min(920px,calc(100vw-28px))] flex-col overflow-hidden rounded-[22px] border border-line-strong bg-surface p-0 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,.7)] open:flex">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent"><Icon name="clock" size={20} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight tracking-tight">Version history</h2>
          <p className="truncate text-[13px] text-muted">{snippet.title}</p>
        </div>
        <button aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2"><Icon name="x" /></button>
      </div>

      {versions === null ? (
        <div className="grid flex-1 place-items-center text-muted">Loading…</div>
      ) : versions.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div>
            <p className="mb-1 text-lg font-bold">No earlier versions yet</p>
            <p className="max-w-[40ch] text-muted">Every time you save changes, the previous version is kept here so you can go back to it.</p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 md:grid-cols-[260px_1fr]">
          <ul className="max-h-[200px] overflow-y-auto border-b border-line p-2 md:max-h-none md:border-b-0 md:border-r">
            {versions.map((x, i) => {
              const d = diffStats(x.code, snippet.code);
              return (
                <li key={x.vid}>
                  <button onClick={() => setSel(i)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left ${i === sel ? "bg-accent/15" : "hover:bg-surface-2"}`}>
                    <div className="truncate text-sm font-semibold">{x.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      <span>{timeAgo(x.saved_at)}</span>
                      <span className="font-mono text-[var(--t-str)]">+{d.added}</span>
                      <span className="font-mono text-danger">−{d.removed}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[13px] text-muted">
              <span>Saved {new Date(v!.saved_at).toLocaleString()}</span>
              <span className="text-faint">vs. current: <b className="font-mono text-[var(--t-str)]">+{diffStats(v!.code, snippet.code).added}</b> / <b className="font-mono text-danger">−{diffStats(v!.code, snippet.code).removed}</b> lines</span>
              <button className="btn btn-primary ml-auto !h-8" onClick={restore}><Icon name="refresh" size={15} /> Restore</button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-bg">
              <CodeLines code={v!.code} lang={v!.language} />
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
