import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSnippets } from "../hooks/snippets";
import { useToast } from "../hooks/ui";
import { useModal } from "../components/Modal";
import { Icon } from "../components/Icon";
import { LangIcon } from "../components/LangIcon";
import { timeAgo } from "../lib/utils";

export function Groups() {
  const { groups, groupMeta, snippets, addGroup, deleteGroups } = useSnippets();
  const { prompt } = useModal();
  const toast = useToast();
  const nav = useNavigate();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  const [withSnippets, setWithSnippets] = useState(false);

  const rows = useMemo(() => groups.map((g) => {
    const items = snippets.filter((s) => s.group === g);
    const langs = [...new Set(items.map((s) => s.language))];
    const last = items.reduce((m, s) => (s.updated_at > m ? s.updated_at : m), "");
    return { name: g, count: items.length, langs, last };
  }), [groups, snippets]);

  const ungrouped = snippets.filter((s) => !s.group).length;
  const pickedCount = picked.size;
  const pickedSnippets = rows.filter((r) => picked.has(r.name)).reduce((n, r) => n + r.count, 0);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (confirm && !d.open) { setWithSnippets(false); d.showModal(); }
    if (!confirm && d.open) d.close();
  }, [confirm]);

  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("dialog[open]")) { setSelecting(false); setPicked(new Set()); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);

  const toggle = (g: string) => setPicked((p) => { const n = new Set(p); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const exit = () => { setSelecting(false); setPicked(new Set()); };
  const allPicked = rows.length > 0 && pickedCount === rows.length;

  const doDelete = () => {
    const names = [...picked];
    deleteGroups(names, withSnippets);
    setConfirm(false);
    exit();
    toast(`${names.length} group${names.length > 1 ? "s" : ""} deleted${withSnippets ? " with their snippets" : ""}`);
  };

  const create = async () => {
    const g = await prompt({ title: "New group", description: "A topic folder — put Python, JavaScript, HTML, CSS and terminal snippets together.", label: "Group name", placeholder: "e.g. Sorting algorithms", confirmLabel: "Create group" });
    if (g) { addGroup(g); nav(`/group/${encodeURIComponent(g)}`); }
  };

  return (
    <div className="anim-rise mx-auto max-w-[1240px]">
      <div className="mb-6 flex flex-wrap items-end gap-3.5">
        <div>
          <h1 className="text-[clamp(26px,3.2vw,36px)] font-bold leading-[1.1] tracking-[-0.04em]">Groups</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length} group{rows.length === 1 ? "" : "s"} · {snippets.length - ungrouped} snippet{snippets.length - ungrouped === 1 ? "" : "s"} grouped
            {ungrouped > 0 && <> · <Link to="/" className="underline underline-offset-4 hover:text-ink">{ungrouped} ungrouped</Link></>}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto">
          {rows.length > 0 && (
            selecting ? (
              <>
                <button className="btn flex-1 md:flex-none" onClick={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.name)))}>
                  <Icon name="check" size={16} /> {allPicked ? "Clear all" : "Select all"}
                </button>
                <button className="btn flex-1 md:flex-none" onClick={exit}>Cancel</button>
              </>
            ) : (
              <button className="btn flex-1 md:flex-none" onClick={() => setSelecting(true)}><Icon name="list" size={16} /> Select</button>
            )
          )}
          {!selecting && <button className="btn btn-primary flex-1 md:flex-none" onClick={create}><Icon name="plus" size={16} /> New group</button>}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong bg-surface px-5 py-[70px] text-center">
          <div className="mx-auto mb-[18px] grid size-[54px] place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="folder" size={26} /></div>
          <h2 className="mb-1.5 text-[22px] font-bold tracking-tight">No groups yet</h2>
          <p className="mx-auto mb-[22px] max-w-[42ch] text-muted">Create a group for a topic and keep its Python, JavaScript, HTML, CSS and terminal snippets together.</p>
          <button className="btn btn-primary btn-lg" onClick={create}><Icon name="plus" /> New group</button>
        </div>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {rows.map((r, i) => {
            const m = groupMeta[r.name] ?? {};
            const on = picked.has(r.name);
            const body = (
              <>
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl text-[22px]"
                    style={{ background: `${m.color ?? "var(--accent)"}26`, color: m.color ?? "var(--accent)" }}>
                    {m.emoji || <Icon name="folder" size={22} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[16.5px] font-bold tracking-tight">{r.name}</h3>
                    <p className="text-[13px] text-muted">{r.count} snippet{r.count === 1 ? "" : "s"}{r.last && ` · ${timeAgo(r.last)}`}</p>
                  </div>
                  {selecting && (
                    <span className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${on ? "border-accent bg-accent text-accent-ink" : "border-line-strong"}`}>
                      {on && <Icon name="check" size={15} />}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex min-h-[22px] items-center gap-1.5">
                  {r.langs.slice(0, 6).map((l) => <LangIcon key={l} lang={l} size={20} />)}
                  {r.langs.length > 6 && <span className="text-xs text-faint">+{r.langs.length - 6}</span>}
                  {r.count === 0 && <span className="text-[13px] text-faint">Empty — add the first snippet</span>}
                </div>
              </>
            );
            const cls = `anim-rise block rounded-card border bg-surface p-4 text-left transition duration-200 ${on ? "border-accent bg-accent/[0.06]" : "border-line hover:-translate-y-0.5 hover:border-line-strong"}`;
            return selecting ? (
              <button key={r.name} type="button" aria-pressed={on} onClick={() => toggle(r.name)} className={cls} style={{ animationDelay: `${Math.min(i, 12) * 28}ms` }}>{body}</button>
            ) : (
              <Link key={r.name} to={`/group/${encodeURIComponent(r.name)}`} className={cls} style={{ animationDelay: `${Math.min(i, 12) * 28}ms` }}>{body}</Link>
            );
          })}
        </div>
      )}

      {/* bulk action bar */}
      {selecting && (
        <div className="anim-rise fixed inset-x-3 bottom-[88px] z-40 mx-auto flex max-w-[560px] items-center gap-3 rounded-2xl border border-line-strong bg-surface p-3 pl-4 shadow-[0_24px_60px_-12px_rgba(0,0,0,.7)] md:bottom-6">
          <span className="flex-1 text-sm font-semibold">{pickedCount ? `${pickedCount} selected` : "Select groups to delete"}</span>
          <button className="btn !border-danger !bg-danger !text-[#1a0b0b] font-bold" disabled={!pickedCount} onClick={() => setConfirm(true)}>
            <Icon name="trash" size={16} /> Delete
          </button>
        </div>
      )}

      <dialog ref={dlg} onClose={() => setConfirm(false)} onClick={(e) => { if (e.target === dlg.current) setConfirm(false); }}
        className="m-auto w-[min(460px,calc(100vw-28px))] overflow-hidden rounded-[22px] border border-line-strong bg-surface p-0 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,.7)]">
        <div className="p-6">
          <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-danger/15 text-danger"><Icon name="trash" size={22} /></div>
          <h2 className="text-xl font-bold tracking-tight">Delete {pickedCount} group{pickedCount === 1 ? "" : "s"}?</h2>
          <p className="mt-1.5 text-sm text-muted">
            {pickedSnippets > 0
              ? `They contain ${pickedSnippets} snippet${pickedSnippets === 1 ? "" : "s"}. By default the snippets are kept and just become ungrouped.`
              : "These groups are empty."}
          </p>
          {pickedSnippets > 0 && (
            <label className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${withSnippets ? "border-danger bg-danger/10" : "border-line"}`}>
              <input type="checkbox" className="mt-1 size-4 accent-[#ff6b6b]" checked={withSnippets} onChange={(e) => setWithSnippets(e.target.checked)} />
              <span>
                <b className="block text-sm">Also delete the {pickedSnippets} snippet{pickedSnippets === 1 ? "" : "s"} inside</b>
                <span className="text-[13px] text-muted">This can't be undone.</span>
              </span>
            </label>
          )}
          <div className="mt-6 flex justify-end gap-2.5">
            <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
            <button className="btn !border-danger !bg-danger !text-[#1a0b0b] font-bold" onClick={doDelete}>
              {withSnippets ? "Delete groups & snippets" : "Delete groups"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
