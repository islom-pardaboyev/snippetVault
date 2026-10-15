import { useEffect, useMemo, useState } from "react";
import { lazy, Suspense } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useSnippets } from "../hooks/snippets";
const CodeEditor = lazy(() => import("../components/CodeEditor"));
import { useToast } from "../hooks/ui";
import { CodeBlock } from "../components/CodeBlock";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";
import { LangIcon } from "../components/LangIcon";
import { NotFound } from "./NotFound";
import { LANGUAGES, detectLanguage, lineCount, newId, parseTags } from "../lib/utils";
import type { Snippet } from "../lib/types";

export function Editor() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { get, loaded, save, saveVersion, snippets, groups: allGroups } = useSnippets();
  const nav = useNavigate();
  const toast = useToast();
  const existing = id ? get(id) : undefined;
  const loc = useLocation();
  // quick-capture (paste) and Web Share Target both arrive with prefilled content
  const incoming = (loc.state as { code?: string } | null)?.code ?? sp.get("text") ?? sp.get("url") ?? "";
  const incomingTitle = sp.get("title") ?? "";

  const [form, setForm] = useState({ title: incomingTitle, language: (!id && incoming && detectLanguage(incoming)) || "JavaScript", tags: "", group: sp.get("group") ?? "", description: "", code: id ? "" : incoming });
  const [hydrated, setHydrated] = useState(!id);
  const [touchedLang, setTouchedLang] = useState(!!id);
  const [detected, setDetected] = useState<string | null>(null);

  // hydrate once the snippet arrives (snapshots must not wipe in-progress typing)
  useEffect(() => {
    if (id && existing && !hydrated) {
      setForm({ title: existing.title, language: existing.language, tags: existing.tags.join(", "), group: existing.group ?? "", description: existing.description, code: existing.code });
      setHydrated(true);
    }
  }, [id, existing, hydrated]);

  const allTags = useMemo(() => [...new Set(snippets.flatMap((s) => s.tags))].sort(), [snippets]);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onCode = (v: string) => {
    set("code", v);
    if (!touchedLang) {
      const d = detectLanguage(v);
      if (d && d !== form.language) { set("language", d); setDetected(d); }
    }
  };

  const submit = () => {
    if (!form.title.trim()) { toast("Give it a title first", { kind: "err" }); return; }
    const now = new Date().toISOString();
    const s: Snippet = existing
      ? { ...existing, title: form.title.trim(), language: form.language, tags: parseTags(form.tags), group: form.group.trim(), description: form.description.trim(), code: form.code, updated_at: now }
      : { id: newId(), title: form.title.trim(), language: form.language, tags: parseTags(form.tags), group: form.group.trim(), description: form.description.trim(), code: form.code, favorite: false, created_at: now, updated_at: now };
    if (existing && (existing.code !== s.code || existing.title !== s.title || existing.description !== s.description || existing.language !== s.language)) saveVersion(existing);
    save(s);
    toast(existing ? "Saved" : "Snippet added");
    nav(`/s/${s.id}`, { replace: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); }
      else if (e.key === "Escape") nav(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (id && !existing) {
    if (!loaded) return <div className="skeleton mx-auto h-72 max-w-[1240px] rounded-card" />;
    return <NotFound what="snippet" />;
  }

  const input = "w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 outline-none transition placeholder:text-faint focus:border-accent focus:ring-[3px] focus:ring-accent/20";
  const label = "mb-1.5 block text-[12.5px] font-semibold text-muted";

  return (
    <div className="anim-rise mx-auto max-w-[1240px]">
      <button onClick={() => nav(-1)} className="mb-4 inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><Icon name="back" /> Cancel</button>
      <h1 className="mb-6 text-[clamp(26px,3.2vw,36px)] font-bold tracking-[-0.04em]">{existing ? "Edit snippet" : "New snippet"}</h1>

      <div className="grid items-start gap-7 lg:grid-cols-[1.1fr_1fr]">
        <div className="grid gap-4">
          <div className="grid gap-3.5 sm:grid-cols-[1fr_190px]">
            <label><span className={label}>Title</span>
              <input autoFocus={!existing} className={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Debounce function" maxLength={200} /></label>
            <label><span className={label}>Language {detected && <span className="ml-1 text-accent">· detected</span>}</span>
              <Select ariaLabel="Language" value={form.language} className="[&>button]:!h-[46px] [&>button]:!rounded-[10px]"
                onChange={(v) => { set("language", v); setTouchedLang(true); setDetected(null); }}
                options={LANGUAGES.map((l) => ({ value: l, label: l, icon: <LangIcon lang={l} size={20} /> }))} /></label>
          </div>
          <div>
            <span className={label}>Group <span className="font-normal text-faint">(folder)</span></span>
            <Select ariaLabel="Group" value={allGroups.includes(form.group) ? form.group : form.group ? "__custom" : ""}
              className="mb-2" prefix={<Icon name="folder" size={15} className="text-muted" />}
              onChange={(v) => { if (v !== "__custom") set("group", v); }}
              options={[
                { value: "", label: "No group" },
                ...allGroups.map((g) => ({ value: g, label: g })),
                ...(form.group && !allGroups.includes(form.group) ? [{ value: "__custom", label: `${form.group} (new)` }] : []),
              ]} />
            <input className={input} value={form.group} onChange={(e) => set("group", e.target.value)} placeholder="…or type a new group name" maxLength={60} />
          </div>
          <label><span className={label}>Tags <span className="font-normal text-faint">(comma separated)</span></span>
            <input className={input} list="tag-list" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="utils, api" />
            <datalist id="tag-list">{allTags.map((t) => <option key={t} value={t} />)}</datalist></label>
          <label><span className={label}>Notes <span className="font-normal text-faint">(optional)</span></span>
            <input className={input} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What is this for?" /></label>
          <div>
            <span className={label}>Code</span>
            <Suspense fallback={<div className="skeleton h-[340px] rounded-[10px] border border-line" />}>
              <CodeEditor value={form.code} onChange={onCode} language={form.language} onSubmit={submit} placeholder="Paste your code here…  Use {{name}} for template variables." />
            </Suspense>
            <div className="mt-1.5 flex justify-between font-mono text-xs text-faint">
              <span>{lineCount(form.code)} lines · {form.code.length} chars</span><span>Tab indents · ⌘↵ saves · {"{{var}}"} = template</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2.5">
            <button className="btn" onClick={() => nav(-1)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit}><Icon name="check" size={16} /> {existing ? "Save changes" : "Save snippet"}</button>
          </div>
        </div>

        <div className="lg:sticky lg:top-[84px]">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Live preview</div>
          <CodeBlock code={form.code || "// your code appears here"} lang={form.language} title={form.title || "untitled"} />
        </div>
      </div>
    </div>
  );
}
