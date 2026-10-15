import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { useSnippets } from "../hooks/snippets";
import { useTheme } from "../hooks/ui";
import { LangIcon } from "./LangIcon";

interface Item { id: string; label: string; sub?: string; icon?: IconName; lang?: string; run(): void; section: "Actions" | "Snippets"; }

export function CommandPalette({ open, onClose, onSettings }: { open: boolean; onClose(): void; onSettings(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const { snippets } = useSnippets();
  const { toggle: toggleTheme } = useTheme();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); setQ(""); setIdx(0); setTimeout(() => input.current?.focus(), 0); }
    if (!open && d.open) d.close();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (p: string) => () => nav(p);
    const actions: Item[] = [
      { id: "a-new", section: "Actions", label: "New snippet", icon: "plus", run: go("/new") },
      { id: "a-lib", section: "Actions", label: "All snippets", icon: "library", run: go("/") },
      { id: "a-fav", section: "Actions", label: "Favourites", icon: "star", run: go("/favorites") },
      { id: "a-ins", section: "Actions", label: "Insights", icon: "chart", run: go("/insights") },
      { id: "a-theme", section: "Actions", label: "Toggle light / dark  (D)", icon: "sun", run: toggleTheme },
      { id: "a-set", section: "Actions", label: "Settings", icon: "sliders", run: onSettings },
    ];
    const needle = q.trim().toLowerCase();
    const list = snippets
      .filter((s) => !needle || `${s.title} ${s.language} ${s.tags.join(" ")} ${s.description} ${s.code}`.toLowerCase().includes(needle))
      .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
      .slice(0, 8)
      .map<Item>((s) => ({ id: s.id, section: "Snippets", label: s.title, sub: s.language, lang: s.language, run: go(`/s/${s.id}`) }));
    const acts = needle ? actions.filter((a) => a.label.toLowerCase().includes(needle)) : actions;
    return [...acts, ...list];
  }, [q, snippets, nav, toggleTheme, onSettings]);

  useEffect(() => setIdx(0), [q]);

  const run = (it?: Item) => { if (!it) return; onClose(); setTimeout(it.run, 0); };

  let lastSection = "";
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-auto mt-[12vh] w-[min(620px,calc(100vw-28px))] max-h-[min(86vh,760px)] flex-col overflow-hidden rounded-[20px] border border-line-strong bg-surface p-0 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,.7)] open:flex">
      <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search snippets or run a command…"
        aria-label="Command palette"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); run(items[idx]); }
        }}
        className="border-0 border-b border-line bg-transparent px-6 py-[18px] text-[17px] text-ink outline-none placeholder:text-faint" />
      <div className="max-h-[52vh] overflow-y-auto p-2" role="listbox">
        {items.length === 0 && <div className="p-7 text-center text-muted">No matches for “{q}”.</div>}
        {items.map((it, i) => {
          const head = it.section !== lastSection ? (lastSection = it.section) : null;
          return (
            <div key={it.id}>
              {head && <div className="px-3 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[.1em] text-faint">{head}</div>}
              <button role="option" aria-selected={i === idx} onMouseMove={() => setIdx(i)} onClick={() => run(it)}
                className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left ${i === idx ? "bg-accent/15" : ""}`}>
                {it.icon ? <Icon name={it.icon} className="text-muted" /> : <LangIcon lang={it.lang ?? "Other"} size={18} />}
                <span className="flex-1 truncate font-medium">{it.label}</span>
                {it.sub && <span className="text-xs text-faint">{it.sub}</span>}
              </button>
            </div>
          );
        })}
      </div>
    </dialog>
  );
}
