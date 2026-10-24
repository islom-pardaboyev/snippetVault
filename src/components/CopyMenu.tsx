import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { useToast } from "../hooks/ui";
import { copyText, isPage, titleAndCode, toHtml, toMarkdown } from "../lib/utils";
import { noteText } from "../lib/note";
import { copyImage, downloadBlob, renderSnippetPng } from "../lib/codeImage";

interface Copyable { code: string; language: string; title: string; notes?: string; }

interface Props {
  snippet: Copyable;
  /** Override the primary "Copy code" action (e.g. to handle template variables). */
  onRawCopy?: () => void;
  compact?: boolean;
  className?: string;
}

const pngName = (title: string) =>
  (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "snippet") + ".png";

/** Split button: copies the code, with a caret that reveals more formats and "save as image". */
export function CopyMenu({ snippet, onRawCopy, compact = false, className = "" }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  const copy = async (text: string, msg: string) => {
    setOpen(false);
    if (await copyText(text)) toast(msg);
    else toast("Couldn't access the clipboard", { kind: "err" });
  };

  const page = isPage(snippet.language);
  const raw = () => { setOpen(false); if (onRawCopy) onRawCopy(); else void copy(page ? noteText(snippet.notes) : snippet.code, "Copied!"); };

  const image = async (mode: "copy" | "download") => {
    setOpen(false);
    setBusy(true);
    try {
      const blob = await renderSnippetPng({ code: snippet.code, lang: snippet.language, title: snippet.title });
      if (mode === "download" || !(await copyImage(blob))) {
        downloadBlob(pngName(snippet.title), blob);
        toast("Image saved");
      } else {
        toast("Image copied");
      }
    } catch {
      toast("Couldn't render the image", { kind: "err" });
    } finally {
      setBusy(false);
    }
  };

  const pad = compact ? "!h-8 !px-3 !text-[13px]" : "";
  const caretPad = compact ? "!h-8 !px-1.5" : "!px-1.5";

  const items: Array<{ icon: IconName; label: string; hint?: string; run(): void }> = [
    { icon: "copy", label: page ? "Copy page text" : "Copy code", hint: "raw", run: raw },
    { icon: "code", label: "Copy as Markdown", run: () => copy(toMarkdown(snippet), "Copied as Markdown") },
    { icon: "code", label: "Copy as HTML", run: () => copy(toHtml(snippet), "Copied as HTML") },
    { icon: "copy", label: page ? "Copy title + page" : "Copy title + code", run: () => copy(titleAndCode(snippet), "Copied with title") },
  ];

  return (
    <div ref={root} className={`relative inline-flex ${className}`}>
      <button type="button" onClick={raw} className={`btn btn-primary grow rounded-r-none ${pad}`}>
        <Icon name="copy" size={16} /> Copy
      </button>
      <button type="button" aria-label="More copy options" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)} disabled={busy}
        className={`btn btn-primary rounded-l-none border-l border-black/15 ${caretPad}`}>
        <Icon name={busy ? "refresh" : "chevron"} size={14} className={busy ? "animate-spin" : ""} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+7px)] z-40 w-[248px] overflow-hidden rounded-[14px] border border-line-strong bg-surface p-1.5 text-left shadow-[0_24px_60px_-16px_rgba(0,0,0,.7)]">
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Copy</div>
          {items.map((it) => (
            <MenuItem key={it.label} icon={it.icon} label={it.label} hint={it.hint} run={it.run} />
          ))}
          {/* A page has no code to render, so the "save as image" tools are for code snippets only. */}
          {!page && (
            <>
              <div className="mx-1.5 my-1.5 border-t border-line" />
              <div className="px-2.5 pb-1 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Image</div>
              <MenuItem icon="image" label="Copy as image" run={() => image("copy")} />
              <MenuItem icon="download" label="Save as image (PNG)" run={() => image("download")} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, hint, run }: { icon: IconName; label: string; hint?: string; run(): void }) {
  return (
    <button type="button" role="menuitem" onClick={run}
      className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink">
      <Icon name={icon} size={16} />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[11px] uppercase tracking-wide text-faint">{hint}</span>}
    </button>
  );
}
