import { useState } from "react";
import { Icon } from "./Icon";
import { NoteView, RichNoteEditor, type NoteImageSource } from "./RichNote";
import { hasNoteText } from "../lib/note";
import type { Snippet } from "../lib/types";

/** A private, optional note on a snippet: an explanation the owner writes for themselves. */
export function NotesSection({ snippet, onSave, images, onAddImage }: {
  snippet: Snippet;
  onSave(s: Snippet): void;
  /** The snippet's images — a note can show them, by reference. */
  images?: NoteImageSource[];
  onAddImage?(file: File): Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [html, setHtml] = useState(snippet.notes ?? "");

  const start = () => { setHtml(snippet.notes ?? ""); setEditing(true); };
  const save = () => {
    onSave({ ...snippet, notes: html, updated_at: new Date().toISOString() });
    setEditing(false);
  };
  const has = hasNoteText(snippet.notes);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[.1em] text-faint">Notes</h2>
        <span className="text-[12.5px] text-faint">· only you can see this</span>
        {!editing && (
          <button className="btn btn-ghost !h-7 !px-2 ml-auto" onClick={start}>
            <Icon name={has ? "edit" : "plus"} size={15} /> {has ? "Edit" : "Add note"}
          </button>
        )}
      </div>

      {editing ? (
        <div onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditing(false); } }}>
          <RichNoteEditor value={html} onChange={setHtml} defaultLang={snippet.language} images={images} onAddImage={onAddImage} autoFocus />
          <div className="mt-2 flex items-center justify-end gap-2.5">
            <span className="mr-auto text-[12.5px] text-faint">Optional · private to you</span>
            <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save}><Icon name="check" size={16} /> Save note</button>
          </div>
        </div>
      ) : has ? (
        <div className="rounded-card border border-line bg-surface px-4 py-3.5">
          <NoteView html={snippet.notes} images={images} />
        </div>
      ) : (
        <button
          className="w-full rounded-card border border-dashed border-line bg-transparent px-4 py-5 text-[13.5px] text-muted transition hover:border-line-strong hover:text-ink"
          onClick={start}
        >
          <Icon name="edit" size={15} className="mr-1.5 inline align-[-2px]" />
          Write a private note — headings, checklists, screenshots and highlighted code blocks
        </button>
      )}
    </section>
  );
}
