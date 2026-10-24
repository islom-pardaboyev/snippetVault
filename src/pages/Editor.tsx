import { useEffect, useMemo, useRef, useState } from "react";
import { lazy, Suspense } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useSnippets } from "../hooks/snippets";
import { useImageActions, useSnippetImages } from "../hooks/images";
import { ImageGallery } from "../components/ImageGallery";
import { RichNoteEditor, NoteView } from "../components/RichNote";
import { RunPanel } from "../components/RunPanel";
import { MAX_IMAGES, compressFiles, type Compressed } from "../lib/images";
import { dropNoteImage } from "../lib/note";
const CodeEditor = lazy(() => import("../components/CodeEditor"));
import { useToast } from "../hooks/ui";
import { CodeBlock } from "../components/CodeBlock";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";
import { useModal } from "../components/Modal";
import { LangIcon } from "../components/LangIcon";
import { NotFound } from "./NotFound";
import { LANGUAGES, detectLanguage, isPage, lineCount, newId, parseTags, timeAgo } from "../lib/utils";
import { findSimilar } from "../lib/similar";
import type { Snippet } from "../lib/types";

export function Editor() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { get, loaded, save, saveVersion, snippets, groups: allGroups } = useSnippets();
  const nav = useNavigate();
  const toast = useToast();
  const { prompt, confirm } = useModal();
  const existing = id ? get(id) : undefined;
  const loc = useLocation();
  // quick-capture (paste) and Web Share Target both arrive with prefilled content
  const incoming = (loc.state as { code?: string } | null)?.code ?? sp.get("text") ?? sp.get("url") ?? "";
  const incomingTitle = sp.get("title") ?? "";

  const [form, setForm] = useState({ title: incomingTitle, language: (!id && incoming && detectLanguage(incoming)) || "JavaScript", tags: "", group: sp.get("group") ?? "", description: "", notes: "", code: id ? "" : incoming });
  const [hydrated, setHydrated] = useState(!id);
  const [touchedLang, setTouchedLang] = useState(!!id);
  const [detected, setDetected] = useState<string | null>(null);
  const [dup, setDup] = useState<{ id: string; title: string; score: number; when: string } | null>(null);

  // images: staged locally, written when the snippet is saved (so Cancel discards them)
  const [newId_] = useState(newId);
  const sid = existing?.id ?? id ?? newId_;
  const { images: saved } = useSnippetImages(existing ? existing.id : null);
  const { add: addImage, remove: removeImage } = useImageActions();
  const [staged, setStaged] = useState<(Compressed & { id: string })[]>([]);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const shown = [
    ...saved.filter((i) => !gone.has(i.id)),
    ...staged.map((i) => ({ id: i.id, data: i.data, w: i.w, h: i.h })),
  ];
  /** Live count for the cap check — an async add must not read a stale `shown`. */
  const count = useRef(shown.length);
  count.current = shown.length;

  /** Stage files for the gallery; returns the new image ids (empty when the cap is hit). */
  const addFiles = async (files: File[]) => {
    if (!files.length) return [];
    setBusy(true);
    const { ok, error } = await compressFiles(files, MAX_IMAGES - count.current);
    const added = ok.map((c) => ({ ...c, id: newId() }));
    setStaged((l) => [...l, ...added]);
    setBusy(false);
    if (error) toast(error, { kind: "err" });
    return added.map((a) => a.id);
  };
  const removeImg = (imgId: string) => {
    if (staged.some((s) => s.id === imgId)) setStaged((l) => l.filter((s) => s.id !== imgId));
    else setGone((g) => new Set(g).add(imgId));
    // If the note shows this picture, drop the reference with the picture itself.
    const stripped = dropNoteImage(form.notes, imgId);
    if (stripped !== form.notes) set("notes", stripped);
  };

  // paste a screenshot straight into the editor page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      void addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  // hydrate once the snippet arrives (snapshots must not wipe in-progress typing)
  useEffect(() => {
    if (id && existing && !hydrated) {
      setForm({ title: existing.title, language: existing.language, tags: existing.tags.join(", "), group: existing.group ?? "", description: existing.description, notes: existing.notes ?? "", code: existing.code });
      setHydrated(true);
    }
  }, [id, existing, hydrated]);

  const allTags = useMemo(() => [...new Set(snippets.flatMap((s) => s.tags))].sort(), [snippets]);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  /** A page is a snippet whose content is rich text — the code editor steps aside for it. */
  const page = isPage(form.language);
  // The menu still lists a language a snippet already had, even one no longer offered (e.g. "Other"),
  // so opening an old snippet never shows a blank picker.
  const langOptions = useMemo(() => {
    const base = LANGUAGES.map((l) => ({ value: l as string, label: l as string, icon: <LangIcon lang={l} size={20} /> }));
    if ((LANGUAGES as readonly string[]).includes(form.language)) return base;
    return [{ value: form.language, label: form.language, icon: <LangIcon lang={form.language} size={20} /> }, ...base];
  }, [form.language]);

  const onCode = (v: string) => {
    set("code", v);
    if (!touchedLang) {
      const d = detectLanguage(v);
      if (d && d !== form.language) { set("language", d); setDetected(d); }
    }
  };

  const submit = async () => {
    if (!form.title.trim()) { toast("Give it a title first", { kind: "err" }); return; }
    // warn when this looks like code you already saved (skipped for trivial edits and pages)
    if (!page && form.code.trim() && (!existing || existing.code !== form.code)) {
      const [match] = findSimilar(form.code, snippets, { excludeId: existing?.id, limit: 1 });
      if (match) {
        setDup({ id: match.snippet.id, title: match.snippet.title, score: match.score, when: match.snippet.updated_at });
        const ok = await confirm({
          title: "Possible duplicate",
          description: `You already saved “${match.snippet.title}” — ${Math.round(match.score * 100)}% similar, updated ${timeAgo(match.snippet.updated_at)}. Save another copy anyway?`,
          confirmLabel: "Save anyway", icon: "copy",
        });
        if (!ok) return;
      }
    }
    setDup(null);
    const now = new Date().toISOString();
    const s: Snippet = existing
      ? { ...existing, title: form.title.trim(), language: form.language, tags: parseTags(form.tags), group: form.group.trim(), description: form.description.trim(), notes: form.notes.trim(), code: form.code, updated_at: now }
      : { id: sid, title: form.title.trim(), language: form.language, tags: parseTags(form.tags), group: form.group.trim(), description: form.description.trim(), notes: form.notes.trim(), code: form.code, favorite: false, created_at: now, updated_at: now };
    s.image_count = shown.length;
    // Snapshot the previous state before overwriting it. For a page the content is in `notes`,
    // so a change there is a real change worth keeping in history; for code it stays as before.
    if (existing && (existing.code !== s.code || existing.title !== s.title || existing.description !== s.description
      || existing.language !== s.language || (page && existing.notes !== s.notes))) saveVersion(existing);
    save(s);
    staged.forEach((i) => addImage(sid, i, i.id));
    gone.forEach((g) => removeImage(sid, g));
    toast(existing ? "Saved" : "Snippet added");
    nav(`/s/${s.id}`, { replace: true });
  };

  // Keep the latest `submit` reachable from the (stable) key listener without re-registering it
  // on every keystroke. Registering once with [] is only correct because the handler reads the
  // ref, so it always calls the current `submit`.
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submitRef.current(); }
      // Escape leaves the editor — but not while a dialog (duplicate warning, prompt) is up:
      // that Escape belongs to the dialog, and navigating away would drop the snippet.
      else if (e.key === "Escape" && !document.querySelector("dialog[open]")) nav(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  if (id && !existing) {
    if (!loaded) return <div className="skeleton mx-auto h-72 max-w-[1240px] rounded-card" />;
    return <NotFound what="snippet" />;
  }

  const input = "field";
  const label = "mb-1.5 block text-[12.5px] font-semibold text-muted";

  return (
    <div className="anim-rise mx-auto max-w-[1240px]">
      <button onClick={() => nav(-1)} className="mb-4 inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><Icon name="back" /> Cancel</button>
      <h1 className="mb-6 text-[clamp(26px,3.2vw,36px)] font-bold tracking-[-0.04em]">{existing ? "Edit snippet" : "New snippet"}</h1>

      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <div className="grid gap-3.5 sm:grid-cols-[1fr_190px]">
            <label><span className={label}>Title</span>
              <input autoFocus={!existing} className={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Debounce function" maxLength={200} /></label>
            <label><span className={label}>Language {detected && <span className="ml-1 text-accent">· detected</span>}</span>
              <Select ariaLabel="Language" value={form.language} className="[&>button]:!h-[46px] [&>button]:!rounded-[10px]"
                onChange={(v) => { set("language", v); setTouchedLang(true); setDetected(null); }}
                options={langOptions} /></label>
          </div>
          <div>
            <span className={label}>Group <span className="font-normal text-faint">(folder)</span></span>
            <Select ariaLabel="Group" value={form.group && !allGroups.includes(form.group) ? "__custom" : form.group}
              prefix={<Icon name="folder" size={15} className="text-muted" />}
              onChange={async (v) => {
                if (v === "__custom") return;
                if (v === "__new") {
                  const n = await prompt({ title: "New group", label: "Group name", placeholder: "e.g. Sorting algorithms", confirmLabel: "Use this group" });
                  if (n) set("group", n);
                  return;
                }
                set("group", v);
              }}
              options={[
                { value: "", label: "No group" },
                ...allGroups.map((g) => ({ value: g, label: g })),
                ...(form.group && !allGroups.includes(form.group) ? [{ value: "__custom", label: `${form.group} (new)` }] : []),
                { value: "__new", label: "+ New group…" },
              ]} />
          </div>
          <label><span className={label}>Tags <span className="font-normal text-faint">(comma separated)</span></span>
            <input className={input} list="tag-list" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="utils, api" />
            <datalist id="tag-list">{allTags.map((t) => <option key={t} value={t} />)}</datalist></label>
          <label><span className={label}>Description <span className="font-normal text-faint">(optional)</span></span>
            <input className={input} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Short summary shown under the title" /></label>
          <div className="lg:hidden">
            <span className={label}>Images <span className="font-normal text-faint">(optional)</span></span>
            <ImageGallery images={shown} busy={busy} onAdd={addFiles} onRemove={removeImg} />
          </div>
          {page ? (
            <div onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}>
              <span className={label}>Page <span className="font-normal text-faint">(rich text — this is the whole snippet)</span></span>
              <RichNoteEditor page value={form.notes} onChange={(html) => set("notes", html)} defaultLang={form.language}
                images={shown} onAddImage={async (f) => (await addFiles([f]))[0] ?? null} /></div>
          ) : (
            <>
              <div>
                <span className={label}>Code</span>
                <Suspense fallback={<div className="skeleton h-[340px] rounded-[10px] border border-line" />}>
                  <CodeEditor value={form.code} onChange={onCode} language={form.language} onSubmit={submit} placeholder="Paste your code here…  Use {{name}} for template variables." />
                </Suspense>
                <div className="mt-1.5 flex justify-between font-mono text-xs text-faint">
                  <span>{lineCount(form.code)} lines · {form.code.length} chars</span><span>Tab indents · ⌘↵ saves · {"{{var}}"} = template</span>
                </div>
              </div>
              <RunPanel code={form.code} language={form.language} compact />
              <div onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}>
                <span className={label}>Notes <span className="font-normal text-faint">(optional, private to you)</span></span>
                <RichNoteEditor value={form.notes} onChange={(html) => set("notes", html)} defaultLang={form.language}
                  images={shown} onAddImage={async (f) => (await addFiles([f]))[0] ?? null} /></div>
            </>
          )}
          {dup && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[var(--t-kw)]/40 bg-[var(--t-kw)]/10 px-3.5 py-2.5 text-[13.5px]">
              <Icon name="copy" size={16} className="text-[var(--t-kw)]" />
              <span className="min-w-0 flex-1">
                Looks like <b className="font-semibold">{dup.title}</b> ({Math.round(dup.score * 100)}% similar, {timeAgo(dup.when)}).
              </span>
              <button className="link-btn" onClick={() => nav(`/s/${dup.id}`)}>Open it</button>
              <button className="link-btn" onClick={() => setDup(null)}>Dismiss</button>
            </div>
          )}
          <div className="flex items-center justify-end gap-2.5">
            <button className="btn" onClick={() => nav(-1)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit}><Icon name="check" size={16} /> {existing ? "Save changes" : "Save snippet"}</button>
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-[84px]">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.1em] text-faint">{page ? "Page preview" : "Live preview"}</div>
          {page ? (
            <div className="max-h-[46vh] overflow-auto rounded-card border border-line-strong bg-surface px-5 py-4 shadow-[0_18px_40px_-22px_rgba(0,0,0,.6)]">
              {form.notes
                ? <NoteView html={form.notes} images={shown} className="note-page" />
                : <p className="py-6 text-center text-sm text-faint">Your page will appear here.</p>}
            </div>
          ) : (
            <div className="max-h-[46vh] overflow-auto rounded-card border border-line-strong shadow-[0_18px_40px_-22px_rgba(0,0,0,.6)]">
              <CodeBlock bare code={form.code || "// your code appears here"} lang={form.language} title={form.title || "untitled"} />
            </div>
          )}
          <div className="mt-6 hidden lg:block">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.1em] text-faint">
              <Icon name="image" size={14} /> Images <span className="font-medium normal-case tracking-normal">({shown.length}/{MAX_IMAGES})</span>
            </div>
            <ImageGallery images={shown} busy={busy} onAdd={addFiles} onRemove={removeImg} />
          </div>
        </div>
      </div>
    </div>
  );
}
