import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useSnippets } from "../hooks/snippets";
import { useToast } from "../hooks/ui";

const input = "w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[13.5px] outline-none transition placeholder:text-faint focus:border-accent focus:ring-[3px] focus:ring-accent/20";

/** Pick existing snippets (not already in `group`) and move them into it. */
export function AddToGroupDialog({ open, group, onClose }: { open: boolean; group: string; onClose(): void }) {
  const { snippets, saveMany } = useSnippets();
  const toast = useToast();
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setQ(""); setPicked(new Set()); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return snippets
      .filter((x) => x.group !== group)
      .filter((x) => !s || x.title.toLowerCase().includes(s) || x.language.toLowerCase().includes(s) || (x.group ?? "").toLowerCase().includes(s))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [snippets, group, q]);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const submit = () => {
    if (!picked.size) return;
    const now = new Date().toISOString();
    void saveMany(snippets.filter((x) => picked.has(x.id)).map((x) => ({ ...x, group, updated_at: now })));
    toast(`Added ${picked.size} snippet${picked.size > 1 ? "s" : ""} to ${group}`);
    onClose();
  };

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-auto w-[min(520px,calc(100vw-28px))] overflow-hidden rounded-[22px] border border-line-strong bg-surface p-0 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,.7)]">
      {open && (
        <form className="flex max-h-[86vh] flex-col p-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="folder" size={22} /></div>
          <h2 className="text-xl font-bold tracking-tight">Add existing snippets</h2>
          <p className="mt-1.5 text-sm text-muted">Choose snippets to move into “{group}”.</p>
          <input autoFocus className={`${input} mt-4`} value={q} placeholder="Search snippets…" onChange={(e) => setQ(e.target.value)} />
          <ul className="mt-2 overflow-y-auto rounded-[10px] border border-line" style={{ maxHeight: 320 }}>
            {list.length === 0 && <li className="px-3 py-3 text-[13px] text-faint">{snippets.length ? "No matching snippets." : "No snippets yet."}</li>}
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
          <div className="mt-6 flex justify-end gap-2.5">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!picked.size}>{picked.size ? `Add ${picked.size}` : "Add"}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
