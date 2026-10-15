import { useEffect, useState } from "react";
import { HistoryDialog } from "../components/HistoryDialog";
import { useCopySnippet } from "../hooks/useCopy";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSnippets } from "../hooks/snippets";
import { useToast } from "../hooks/ui";
import { CodeBlock } from "../components/CodeBlock";
import { SnippetCard, StarButton } from "../components/SnippetCard";
import { Icon } from "../components/Icon";
import { NotFound } from "./NotFound";
import { useModal } from "../components/Modal";
import { useImageActions, useSnippetImages } from "../hooks/images";
import { ImageGallery } from "../components/ImageGallery";
import { RunPanel } from "../components/RunPanel";
import { isRunnable } from "../lib/runner";
import { MAX_IMAGES, compressFiles } from "../lib/images";
import { Select } from "../components/Select";
import { LangIcon } from "../components/LangIcon";
import { copyText, downloadFile, lineCount, newId, snippetFilename, timeAgo, toMarkdown } from "../lib/utils";

export function Detail() {
  const { id = "" } = useParams();
  const { get, loaded, snippets, save, remove, groups: groupNames, addGroup } = useSnippets();
  const nav = useNavigate();
  const toast = useToast();
  const { prompt } = useModal();
  const s = get(id);
  const [wrap, setWrap] = useState(false);
  const [history, setHistory] = useState(false);
  const copySnippet = useCopySnippet();
  const { images, loading: imagesLoading } = useSnippetImages(s ? s.id : null);
  const { add: addImage, remove: removeImage } = useImageActions();
  const [busy, setBusy] = useState(false);

  const addFiles = async (files: File[]) => {
    if (!s || !files.length) return;
    setBusy(true);
    const { ok, error } = await compressFiles(files, MAX_IMAGES - images.length);
    ok.forEach((c) => addImage(s.id, c));
    if (ok.length) save({ ...s, image_count: images.length + ok.length });
    setBusy(false);
    if (error) toast(error, { kind: "err" });
  };
  const removeImg = (imgId: string) => {
    if (!s) return;
    removeImage(s.id, imgId);
    save({ ...s, image_count: Math.max(0, images.length - 1) });
    toast("Image removed");
  };

  const copy = async (text: string, msg: string) => { if (await copyText(text)) toast(msg); };

  const del = () => {
    if (!s) return;
    const backup = s;
    remove(s.id);
    nav("/", { replace: true });
    toast("Snippet deleted", { action: { label: "Undo", run: () => save(backup) }, ms: 6000 });
  };

  useEffect(() => {
    if (!s) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "c") copySnippet(s);
      else if (k === "e") nav(`/s/${s.id}/edit`);
      else if (k === "f") save({ ...s, favorite: !s.favorite });
      else if (k === "r" && isRunnable(s.language)) window.dispatchEvent(new Event("sv:run"));
      else if (k === "escape") nav(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!s) {
    if (!loaded) return <div className="skeleton mx-auto h-72 max-w-[1240px] rounded-card" />;
    return <NotFound what="snippet" />;
  }

  const related = snippets
    .filter((x) => x.id !== s.id && (x.language === s.language || x.tags.some((t) => s.tags.includes(t))))
    .slice(0, 3);

  return (
    <div className="anim-rise mx-auto max-w-[1240px]">
      <button onClick={() => nav("/")} className="mb-4 inline-flex items-center gap-1 font-medium text-muted hover:text-ink">
        <Icon name="back" /> Library
      </button>

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-1">
          <h1 className="mb-2.5 text-[clamp(26px,3.4vw,40px)] font-bold leading-[1.08] tracking-[-0.045em]">{s.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[13.5px] text-muted">
            <Link to={`/lang/${encodeURIComponent(s.language)}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12.5px] font-semibold text-ink">
              <LangIcon lang={s.language} size={16} />{s.language}
            </Link>
            {s.tags.map((t) => <Link key={t} to={`/tag/${encodeURIComponent(t)}`} className="hover:text-ink">#{t}</Link>)}
            <Select ariaLabel="Move to group" value={s.group ?? ""} className="w-[200px]" buttonClass="!h-8 !text-[13px]"
              prefix={<Icon name="folder" size={15} className="text-muted" />}
              options={[
                { value: "", label: "No group" },
                ...groupNames.map((g) => ({ value: g, label: g })),
                { value: "__new", label: "+ New group…" },
              ]}
              onChange={async (v) => {
                let g = v;
                if (v === "__new") {
                  const n = await prompt({ title: "New group", label: "Group name", placeholder: "e.g. Sorting algorithms", confirmLabel: "Create & move" });
                  if (!n) return;
                  addGroup(n); g = n;
                }
                save({ ...s, group: g, updated_at: new Date().toISOString() });
                toast(g ? `Moved to ${g}` : "Removed from group");
              }} />
            <span>updated {timeAgo(s.updated_at)}</span>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto">
          <StarButton s={s} />
          <button className="btn btn-primary flex-1 md:flex-none" onClick={() => copySnippet(s)}><Icon name="copy" size={16} /> Copy</button>
          <button className="btn flex-1 md:flex-none" onClick={() => nav(`/s/${s.id}/edit`)}><Icon name="edit" size={16} /> Edit</button>
          <button className="btn btn-icon" aria-label="Version history" title="Version history" onClick={() => setHistory(true)}><Icon name="clock" size={16} /></button>
          <button className="btn btn-icon" aria-label="Duplicate" title="Duplicate"
            onClick={() => { const n = { ...s, id: newId(), title: s.title + " (copy)", favorite: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; save(n); nav(`/s/${n.id}`); toast("Duplicated"); }}>
            <Icon name="sparkles" size={16} />
          </button>
          <button className="btn btn-icon btn-danger" aria-label="Delete" title="Delete" onClick={del}><Icon name="trash" size={16} /></button>
        </div>
      </div>

      {s.description && <p className="mt-[18px] max-w-[70ch] text-base text-muted">{s.description}</p>}

      <div className="mt-[22px]">
        <CodeBlock code={s.code} lang={s.language} wrap={wrap} title={snippetFilename(s)}
          actions={<>
            <button className={`btn btn-ghost !h-7 !px-2 ${wrap ? "!text-ink" : ""}`} onClick={() => setWrap((w) => !w)} aria-pressed={wrap}><Icon name="wrap" size={15} /></button>
            <button className="btn btn-ghost !h-7 !px-2" onClick={() => copy(toMarkdown(s), "Copied as Markdown!")}>Markdown</button>
            <button className="btn btn-ghost !h-7 !px-2" onClick={() => downloadFile(snippetFilename(s), s.code)}><Icon name="download" size={15} /></button>
          </>}
        />
      </div>

      {isRunnable(s.language) && (
        <div className="mt-4"><RunPanel code={s.code} language={s.language} /></div>
      )}

      {(images.length > 0 || (s.image_count ?? 0) > 0 || imagesLoading) && (
        <div className="mt-6">
          <h2 className="mb-2.5 text-[13px] font-bold uppercase tracking-[.1em] text-faint">Images</h2>
          <ImageGallery images={images} busy={busy || (imagesLoading && images.length === 0)} onAdd={addFiles} onRemove={removeImg} />
        </div>
      )}
      {images.length === 0 && (s.image_count ?? 0) === 0 && !imagesLoading && (
        <div className="mt-4">
          <button className="btn" onClick={() => document.getElementById("detail-add-image")?.click()}><Icon name="image" size={16} /> Add image</button>
          <input id="detail-add-image" type="file" accept="image/*" multiple hidden
            onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          [String(lineCount(s.code)), "lines"],
          [String(s.code.length), "characters"],
          [new Date(s.created_at).toLocaleDateString(undefined, { dateStyle: "medium" }), "created"],
          [s.favorite ? "Yes" : "No", "favourite"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-xl border border-line bg-surface px-3.5 py-3">
            <b className="block text-lg tracking-tight tabular-nums">{v}</b><span className="text-xs text-muted">{l}</span>
          </div>
        ))}
      </div>

      {related.length > 0 && (
        <>
          <h2 className="mb-3.5 mt-10 text-[13px] font-bold uppercase tracking-[.1em] text-faint">Related</h2>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
            {related.map((r, i) => <SnippetCard key={r.id} s={r} index={i} />)}
          </div>
        </>
      )}
      <HistoryDialog snippet={s} open={history} onClose={() => setHistory(false)} />
    </div>
  );
}
