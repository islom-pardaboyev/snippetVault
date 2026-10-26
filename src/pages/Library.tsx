import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useSnippets } from "../hooks/snippets";
import { useVault } from "../hooks/vault";
import { useToast } from "../hooks/ui";
import { SnippetCard } from "../components/SnippetCard";
import { Icon } from "../components/Icon";
import { lineCount, seedSnippets } from "../lib/utils";
import { snippetOf } from "../lib/vault";
import type { Snippet } from "../lib/types";
import { useModal } from "../components/Modal";
import { Select } from "../components/Select";
import { LangIcon } from "../components/LangIcon";
import { GroupEditDialog } from "../components/GroupEditDialog";
import { AddToGroupDialog } from "../components/AddToGroupDialog";
import { useNewGroup } from "../components/NewGroupDialog";
import { SearchChips } from "../components/SearchChips";
import { parseQuery, scoreSnippet, recentSearches, pushRecentSearch, clearRecentSearches } from "../lib/search";

type Sort = "updated" | "created" | "title" | "language" | "size";
const SORTS: [Sort, string][] = [["updated", "Updated"], ["created", "Newest"], ["title", "A → Z"], ["language", "Language"], ["size", "Longest"]];
const pref = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

export function Library({ mode }: { mode: "all" | "favorites" | "lang" | "tag" | "group" }) {
  const { snippets, loaded, saveMany, remove, restore, groupMeta, renameGroup, deleteGroup, updateGroup } = useSnippets();
  const { available: vaultAvailable, status: vaultStatus, entries: vaultEntries, moveGroupIn } = useVault();
  const [editGroup, setEditGroup] = useState(false);
  const [addExisting, setAddExisting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const params = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { confirm } = useModal();
  const [newGroup, newGroupDialog] = useNewGroup();
  const [sort, setSort] = useState<Sort>(() => pref("sv:sort", "updated") as Sort);
  const [view, setView] = useState<"grid" | "list">(() => pref("sv:view", "grid") as "grid" | "list");
  const q = (sp.get("q") ?? "").trim();
  const parsed = useMemo(() => parseQuery(q), [q]);
  const [recent, setRecent] = useState<string[]>(() => recentSearches());
  const lang = mode === "lang" ? params.lang : undefined;
  const tag = mode === "tag" ? params.tag : undefined;
  const group = mode === "group" ? params.group : undefined;
  const [groupBy, setGroupBy] = useState<"none" | "group" | "language">(() => pref("sv:groupby", "none") as "none" | "group" | "language");

  const list = useMemo(() => {
    let l = snippets.slice();
    if (mode === "favorites") l = l.filter((s) => s.favorite);
    if (lang) l = l.filter((s) => s.language === lang);
    if (tag) l = l.filter((s) => s.tags.includes(tag));
    if (group) l = l.filter((s) => s.group === group);
    if (q) {
      const scored = l
        .map((s) => ({ s, score: scoreSnippet(s, parsed) }))
        .filter((x): x is { s: (typeof snippets)[number]; score: number } => x.score !== null);
      l = scored.map((x) => x.s);
      if (parsed.terms.length) return l; // relevance order
    }
    const by: Record<Sort, (a: typeof l[number], b: typeof l[number]) => number> = {
      updated: (a, b) => +new Date(b.updated_at) - +new Date(a.updated_at),
      created: (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
      title: (a, b) => a.title.localeCompare(b.title),
      language: (a, b) => a.language.localeCompare(b.language) || a.title.localeCompare(b.title),
      size: (a, b) => lineCount(b.code) - lineCount(a.code),
    };
    return l.sort(by[sort]);
  }, [snippets, mode, lang, tag, group, q, parsed, sort]);

  const heading = q ? `Results for “${q}”` : mode === "favorites" ? "Favourites" : lang ? lang : tag ? `#${tag}` : group ? group : "All snippets";
  const onSearch = (v: string) => setSp(v ? { q: v } : {}, { replace: true });
  const setP = (k: string, v: string, set: (x: never) => void) => { set(v as never); try { localStorage.setItem(k, v); } catch { /* ignore */ } };
  const sections = useMemo(() => {
    const by = mode === "group" ? "language" : groupBy;
    if (by === "none") return [{ name: "", items: list }];
    const m = new Map<string, typeof list>();
    list.forEach((s) => {
      const k = by === "group" ? s.group || "Ungrouped" : s.language;
      m.set(k, [...(m.get(k) ?? []), s]);
    });
    return [...m.entries()]
      .sort((a, b) => (a[0] === "Ungrouped" ? 1 : b[0] === "Ungrouped" ? -1 : a[0].localeCompare(b[0])))
      .map(([name, items]) => ({ name, items }));
  }, [list, groupBy, mode]);
  // Decrypted vault items are searchable while the vault is unlocked. They appear in their
  // own read-only section — never part of multi-select, delete or group actions.
  const vaultSnippets = useMemo(() => (vaultStatus === "unlocked" ? vaultEntries.map(snippetOf) : []), [vaultEntries, vaultStatus]);
  const showVault = vaultStatus === "unlocked" && !!(q.trim() || lang || tag || group || mode === "favorites");
  const vaultMatches = useMemo(() => {
    if (!showVault) return [];
    let l = vaultSnippets;
    if (mode === "favorites") l = l.filter((s) => s.favorite);
    if (lang) l = l.filter((s) => s.language === lang);
    if (tag) l = l.filter((s) => s.tags.includes(tag));
    if (group) l = l.filter((s) => s.group === group);
    if (q) {
      const scored = l
        .map((s) => ({ s, score: scoreSnippet(s, parsed) }))
        .filter((x): x is { s: Snippet; score: number } => x.score !== null);
      l = scored.sort((a, b) => b.score - a.score).map((x) => x.s);
    } else {
      l = l.slice().sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
    }
    return l;
  }, [showVault, vaultSnippets, mode, lang, tag, group, q, parsed]);

  const exitSelect = () => { setSelecting(false); setPicked(new Set()); };
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allPicked = list.length > 0 && list.every((s) => picked.has(s.id));
  const chosen = list.filter((s) => picked.has(s.id));
  useEffect(() => { exitSelect(); }, [mode, group, lang, tag, q]);
  // remember settled searches (debounced) so they can be re-run from the chips
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => setRecent(pushRecentSearch(q)), 900);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("dialog[open]")) exitSelect(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);
  const deleteChosen = async () => {
    const items = chosen;
    if (!items.length) return;
    const ok = await confirm({ title: `Delete ${items.length} snippet${items.length > 1 ? "s" : ""}?`, description: "They move to the Trash and are deleted for good after 30 days.", confirmLabel: "Move to Trash", danger: true });
    if (!ok) return;
    items.forEach((s) => remove(s.id));
    exitSelect();
    toast(`${items.length} snippet${items.length > 1 ? "s" : ""} moved to Trash`, { action: { label: "Undo", run: () => restore(items.map((x) => x.id)) } });
  };
  const removeFromGroup = () => {
    const now = new Date().toISOString();
    const items = chosen;
    void saveMany(items.map((s) => ({ ...s, group: "", updated_at: now })));
    exitSelect();
    toast(`${items.length} removed from group`, { action: { label: "Undo", run: () => { void saveMany(items); } } });
  };
  const languages = useMemo(() => [...new Set(snippets.map((s) => s.language))], [snippets]);

  return (
    <div className="anim-rise mx-auto max-w-[1240px]">
      {newGroupDialog}
      {group && <AddToGroupDialog open={addExisting} group={group} onClose={() => setAddExisting(false)} />}
      {group && (
        <GroupEditDialog open={editGroup} name={group} meta={groupMeta[group] ?? {}} onClose={() => setEditGroup(false)}
          onSave={(n, m) => {
            setEditGroup(false);
            if (n !== group) { renameGroup(group, n); updateGroup(n, m); nav(`/group/${encodeURIComponent(n)}`, { replace: true }); }
            else updateGroup(group, m);
            toast("Group updated");
          }} />
      )}
      <div className="mb-5 flex flex-wrap items-end gap-3.5">
        <div>
          <h1 className="flex items-center gap-3 text-[clamp(26px,3.2vw,36px)] font-bold leading-[1.1] tracking-[-0.04em]">
            {group && (groupMeta[group]?.emoji ? <span>{groupMeta[group]?.emoji}</span> : <Icon name="folder" size={30} style={groupMeta[group]?.color ? { color: groupMeta[group]?.color } : undefined} />)}
            {heading}
          </h1>
          <p className="mt-1 text-sm text-muted">{list.length} snippet{list.length === 1 ? "" : "s"}{lang || tag || group ? " · " : ""}
            {(lang || tag || group) && <Link to="/" className="underline underline-offset-4 hover:text-ink">clear filter</Link>}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 md:ml-auto md:w-auto md:flex-row md:items-center">
          {group ? (
            <div className="flex items-center gap-2">
              <button className="btn btn-primary flex-1 md:flex-none" onClick={() => nav(`/new?group=${encodeURIComponent(group)}`)}>
                <Icon name="plus" size={16} /> Add snippet
              </button>
              <button className="btn" onClick={() => setAddExisting(true)}><Icon name="library" size={16} /><span className="hidden sm:inline"> Add existing</span></button>
              <button className="btn" onClick={() => setEditGroup(true)}><Icon name="edit" size={16} /><span className="hidden sm:inline"> Edit</span></button>
              {vaultAvailable && list.length > 0 && (
                <button className="btn" title="Encrypt and move this whole group into the vault" onClick={async () => {
                  if (vaultStatus !== "unlocked") { toast("Unlock your vault first"); nav("/vault"); return; }
                  const ok = await confirm({ title: `Move “${group}” to the vault?`, description: `${list.length} snippet${list.length === 1 ? "" : "s"} will be encrypted and removed from your library.`, confirmLabel: "Move to vault", icon: "lock" });
                  if (!ok) return;
                  const n = await moveGroupIn(group);
                  toast(`Moved ${n} snippet${n === 1 ? "" : "s"} to the vault`);
                  nav("/vault");
                }}><Icon name="lock" size={16} /><span className="hidden sm:inline"> Vault</span></button>
              )}
              <button className="btn btn-danger btn-icon" aria-label="Delete group" onClick={async () => {
                const ok = await confirm({ title: `Delete “${group}”?`, description: "Its snippets are kept — they just won't belong to any group.", confirmLabel: "Delete group", danger: true });
                if (ok) { deleteGroup(group); nav("/", { replace: true }); toast("Group deleted"); }
              }}><Icon name="trash" size={16} /></button>
            </div>
          ) : (
            <button className="btn hidden md:inline-flex" onClick={newGroup}>
              <Icon name="folder" size={16} /> New group
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {list.length > 0 && (selecting ? (
              <>
                <button className="btn" onClick={() => setPicked(allPicked ? new Set() : new Set(list.map((s) => s.id)))}>
                  <Icon name="check" size={16} /> {allPicked ? "Clear all" : "Select all"}
                </button>
                <button className="btn" onClick={exitSelect}>Cancel</button>
              </>
            ) : (
              <button className="btn" onClick={() => setSelecting(true)}><Icon name="list" size={16} /> Select</button>
            ))}
            {mode !== "group" && (
              <Select ariaLabel="Group by" value={groupBy} className="min-w-[150px] flex-1 md:w-[150px] md:flex-none" buttonClass="!px-2.5 text-[13px] md:text-sm"
                onChange={(v) => setP("sv:groupby", v, setGroupBy)}
                options={[{ value: "none", label: "No grouping" }, { value: "group", label: "By group" }, { value: "language", label: "By language" }]} />
            )}
            <Select ariaLabel="Sort" value={sort} align="right" className="min-w-[150px] flex-1 md:w-[150px] md:flex-none" buttonClass="!px-2.5 text-[13px] md:text-sm"
              onChange={(v) => setP("sv:sort", v, setSort)} options={SORTS.map(([value, label]) => ({ value, label }))} />
            <div className="inline-flex shrink-0 gap-0.5 rounded-[11px] border border-line bg-surface-2 p-[3px]">
              {(["grid", "list"] as const).map((v) => (
                <button key={v} aria-label={`${v} view`} aria-pressed={view === v} onClick={() => setP("sv:view", v, setView)}
                  className={`grid h-[30px] min-w-8 place-items-center rounded-lg ${view === v ? "bg-surface-3 text-ink" : "text-muted"}`}>
                  <Icon name={v} size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <SearchChips raw={q} languages={languages} onChange={(next) => onSearch(next)} recent={recent}
        onClearRecent={() => { clearRecentSearches(); setRecent([]); }} />

      {group && (
        <Link to="/groups" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink md:hidden">
          <Icon name="back" size={16} /> All groups
        </Link>
      )}

      {/* language chips (mobile) */}
      {(languages.length > 1 || mode === "favorites") && (
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden [scrollbar-width:none]">
          <Link to="/" className={`chip ${mode === "all" && !lang ? "chip-on" : ""}`}>All</Link>
          <Link to="/favorites" className={`chip ${mode === "favorites" ? "chip-on" : ""}`}><Icon name="star" size={14} />Favourites</Link>
          {languages.map((l) => (
            <Link key={l} to={`/lang/${encodeURIComponent(l)}`} className={`chip ${lang === l ? "chip-on" : ""}`}>
              <LangIcon lang={l} size={14} />{l}
            </Link>
          ))}
        </div>
      )}

      {!loaded ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[210px] rounded-card border border-line" />)}
        </div>
      ) : list.length === 0 && vaultMatches.length === 0 ? (
        <Empty q={q} hasAny={snippets.length > 0} group={group} onExisting={() => setAddExisting(true)} onNew={() => nav(group ? `/new?group=${encodeURIComponent(group)}` : "/new")}
          onExamples={async () => { await saveMany(seedSnippets()); toast("Examples added"); }} />
      ) : (
        <div className="grid gap-8">
          {sections.map((sec) => (
            <section key={sec.name || "all"}>
              {sec.name && (
                <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[.1em] text-faint">
                  {mode !== "group" && groupBy === "group" ? <Icon name="folder" size={15} /> : <LangIcon lang={sec.name} size={16} />} {sec.name}
                  <span className="font-mono text-xs font-medium normal-case tracking-normal">{sec.items.length}</span>
                </h2>
              )}
              <div className={view === "grid" ? "grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]" : "grid gap-2.5"}>
                {sec.items.map((s, i) => <SnippetCard key={s.id} s={s} index={i} list={view === "list"} selecting={selecting} picked={picked.has(s.id)} onPick={toggle} />)}
              </div>
            </section>
          ))}
          {vaultMatches.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[.1em] text-accent">
                <Icon name="lock" size={15} /> In your vault
                <span className="font-mono text-xs font-medium normal-case tracking-normal text-faint">{vaultMatches.length}</span>
              </h2>
              <div className={view === "grid" ? "grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]" : "grid gap-2.5"}>
                {vaultMatches.map((s, i) => <SnippetCard key={s.id} s={s} index={i} list={view === "list"} vault to={`/vault/${s.id}`} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {selecting && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
          <div className="anim-rise flex flex-wrap items-center gap-2 rounded-2xl border border-line-strong bg-surface p-2 pl-4 shadow-2xl">
            <span className="text-sm font-semibold">{picked.size} selected</span>
            {group && <button className="btn" disabled={!picked.size} onClick={removeFromGroup}>Remove from group</button>}
            <button className="btn btn-danger" disabled={!picked.size} onClick={deleteChosen}><Icon name="trash" size={16} /> Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ q, hasAny, group, onExisting, onNew, onExamples }: { q: string; hasAny: boolean; group?: string; onExisting(): void; onNew(): void; onExamples(): void }) {
  return (
    <div className="rounded-3xl border border-dashed border-line-strong bg-surface px-5 py-[70px] text-center">
      <div className="mx-auto mb-[18px] grid size-[54px] place-items-center rounded-2xl bg-accent/15 text-accent">
        <Icon name={q ? "search" : "library"} size={26} />
      </div>
      <h2 className="mb-1.5 text-[22px] font-bold tracking-tight">{q ? "Nothing matches that search" : group ? `“${group}” is empty` : hasAny ? "Nothing here yet" : "Your vault is empty"}</h2>
      <p className="mx-auto mb-[22px] max-w-[42ch] text-muted">
        {q ? "Try a different word, or search by tag or language." : group ? "Add Python, JavaScript, HTML, CSS, terminal commands — anything on this topic — and it all lives together here." : "Save the code you keep rewriting. It syncs to every device, even offline."}
      </p>
      <div className="flex flex-wrap justify-center gap-2.5">
        <button className="btn btn-primary btn-lg" onClick={onNew}><Icon name="plus" /> {group ? "Add first snippet" : "New snippet"}</button>
        {group && hasAny && !q && <button className="btn btn-lg" onClick={onExisting}><Icon name="library" /> Add existing snippets</button>}
        {!hasAny && !group && <button className="btn btn-lg" onClick={onExamples}><Icon name="sparkles" /> Add examples</button>}
      </div>
    </div>
  );
}
