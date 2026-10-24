import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import { useSnippets } from "../hooks/snippets";
import { useToast } from "../hooks/ui";

const input = "field";

/** Create-group flow: name + optionally move existing snippets into it. Returns [start, dialogElement]. */
export function useNewGroup(): [() => void, ReactElement] {
  const { snippets, groups, addGroup, saveMany } = useSnippets();
  const toast = useToast();
  const nav = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const start = () => { setName(""); setQ(""); setPicked(new Set()); setOpen(true); };
  const close = () => setOpen(false);

  const trimmed = name.trim().slice(0, 60);
  const exists = groups.some((g) => g.toLowerCase() === trimmed.toLowerCase());

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = [...snippets].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return s ? all.filter((x) => x.title.toLowerCase().includes(s) || x.language.toLowerCase().includes(s) || (x.group ?? "").toLowerCase().includes(s)) : all;
  }, [snippets, q]);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = () => {
    if (!trimmed) return;
    addGroup(trimmed);
    if (picked.size) {
      const now = new Date().toISOString();
      void saveMany(snippets.filter((x) => picked.has(x.id)).map((x) => ({ ...x, group: trimmed, updated_at: now })));
      toast(`Group created with ${picked.size} snippet${picked.size > 1 ? "s" : ""}`);
    }
    close();
    nav(`/group/${encodeURIComponent(trimmed)}`);
  };

  const element = (
    <dialog ref={ref} onClose={close} onClick={(e) => { if (e.target === ref.current) close(); }}
      className="m-auto w-[min(520px,calc(100vw-28px))] overflow-hidden rounded-[22px] border border-line-strong bg-surface p-0 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,.7)]">
      {open && (
        <form className="flex max-h-[86vh] flex-col p-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="mb-4 grid size-12 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="folder" size={22} /></div>
          <h2 className="text-xl font-bold tracking-tight">New group</h2>
          <p className="mt-1.5 text-sm text-muted">A topic folder — optionally move existing snippets into it.</p>

          <label className="mt-4 block shrink-0">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-muted">Group name</span>
            <input autoFocus className={input} value={name} maxLength={60} placeholder="e.g. Sorting algorithms" onChange={(e) => setName(e.target.value)} />
            {exists && <span className="mt-1.5 block text-[12.5px] text-muted">A group with this name exists — selected snippets will be added to it.</span>}
          </label>

          {snippets.length > 0 && (
            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex shrink-0 items-center justify-between">
                <span className="text-[12.5px] font-semibold text-muted">Add existing snippets{picked.size > 0 && ` · ${picked.size} selected`}</span>
                {picked.size > 0 && <button type="button" className="text-[12.5px] text-muted underline underline-offset-4 hover:text-ink" onClick={() => setPicked(new Set())}>Clear</button>}
              </div>
              <input className={`${input} !py-2 text-[13.5px]`} value={q} placeholder="Search snippets…" onChange={(e) => setQ(e.target.value)} />
              <ul className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-[10px] border border-line" style={{ maxHeight: 280 }}>
                {list.length === 0 && <li className="px-3 py-3 text-[13px] text-faint">No matches.</li>}
                {list.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-0 hover:bg-surface-2">
                      <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">{s.title || "Untitled"}</span>
                        <span className="block truncate text-[12px] text-muted">{s.language}{s.group ? ` · in ${s.group}` : ""}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex shrink-0 justify-end gap-2.5">
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!trimmed}>
              {picked.size ? `Create with ${picked.size}` : "Create group"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );

  return [start, element];
}
