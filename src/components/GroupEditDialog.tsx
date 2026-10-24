import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import type { GroupMeta } from "../lib/types";

const GROUP_COLORS = ["#c8f542", "#4fe0dc", "#5b9bd5", "#a597ff", "#ff7ab8", "#ff8a65", "#ffc83d", "#9ad5a0"];
const EMOJIS = ["📁", "🐍", "⚛️", "🌐", "🎨", "🗄️", "🖥️", "🧪", "🚀", "📚", "🔧", "⭐"];

export function GroupEditDialog({ open, name, meta, onClose, onSave }: {
  open: boolean; name: string; meta: GroupMeta; onClose(): void; onSave(name: string, meta: GroupMeta): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [n, setN] = useState(name);
  const [color, setColor] = useState(meta.color ?? "");
  const [emoji, setEmoji] = useState(meta.emoji ?? "");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setN(name); setColor(meta.color ?? ""); setEmoji(meta.emoji ?? ""); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open, name, meta.color, meta.emoji]);

  const input = "field";

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-auto w-[min(440px,calc(100vw-28px))] overflow-hidden rounded-[22px] border border-line-strong bg-surface p-0 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,.7)]">
      <form className="p-6" onSubmit={(e) => { e.preventDefault(); if (n.trim()) onSave(n.trim(), { color: color || undefined, emoji: emoji || undefined }); }}>
        <div className="mb-4 grid size-12 place-items-center rounded-2xl text-2xl" style={{ background: `${color || "var(--accent)"}26`, color: color || "var(--accent)" }}>
          {emoji || <Icon name="folder" size={22} />}
        </div>
        <h2 className="text-xl font-bold tracking-tight">Edit group</h2>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-muted">Name</span>
          <input autoFocus className={input} value={n} maxLength={60} onChange={(e) => setN(e.target.value)} />
        </label>

        <div className="mt-4">
          <span className="mb-2 block text-[12.5px] font-semibold text-muted">Colour</span>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" aria-label="No colour" onClick={() => setColor("")}
              className={`grid size-8 place-items-center rounded-full border border-line-strong text-muted ${!color ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""}`}><Icon name="x" size={14} /></button>
            {GROUP_COLORS.map((c) => (
              <button type="button" key={c} aria-label={c} onClick={() => setColor(c)} style={{ background: c }}
                className={`size-8 rounded-full ${color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""}`} />
            ))}
          </div>
        </div>

        <div className="mt-4">
          <span className="mb-2 block text-[12.5px] font-semibold text-muted">Icon</span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-label="Folder icon" onClick={() => setEmoji("")}
              className={`grid size-10 place-items-center rounded-xl border ${!emoji ? "border-accent bg-accent/15" : "border-line"}`}><Icon name="folder" size={18} /></button>
            {EMOJIS.map((em) => (
              <button type="button" key={em} onClick={() => setEmoji(em)}
                className={`grid size-10 place-items-center rounded-xl border text-xl ${emoji === em ? "border-accent bg-accent/15" : "border-line"}`}>{em}</button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!n.trim()}>Save</button>
        </div>
      </form>
    </dialog>
  );
}
