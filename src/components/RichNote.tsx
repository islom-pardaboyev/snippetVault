import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type Editor, type ReactNodeViewProps } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { createLowlight } from "lowlight";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { Icon, type IconName } from "./Icon";
import { Select } from "./Select";
import { useModal } from "./Modal";
import { MAX_NOTE_CHARS, isNoteEmpty, noteLang, noteToHtml } from "../lib/note";
import { LANGUAGES } from "../lib/utils";

/** The images a page has loaded, keyed by id, so note images can be resolved as they render. */
type NoteImageMap = Record<string, { data: string; w: number; h: number }>;

/** What a note image needs to know about a snippet image — compatible with `SnippetImage`. */
export interface NoteImageSource { id: string; data: string; w: number; h: number; }

/** The images the editor/view around this note knows about. Provided by `NoteImages`. */
const NoteImages = createContext<NoteImageMap>({});

/** Put a reference to an already-loaded image at the cursor. */
const insertNoteImage = (editor: Editor, id: string) =>
  editor.chain().focus().insertContent({ type: "noteImage", attrs: { id } }).run();

/**
 * An image inside a note. The node stores the **id** of an image the snippet (or vault item)
 * already owns — see `noteImageIds` in `lib/note.ts` — so a picture added to a note is stored
 * exactly once, obeys the app's existing caps and stays encrypted in the vault. The node view
 * looks the id up in the map the surrounding page provided; an id that resolves to nothing (the
 * image was deleted, or a vault image that hasn't been decrypted yet) renders as a placeholder
 * rather than an empty box, and the note itself is untouched.
 */
const NoteImage = Node.create({
  name: "noteImage",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-image-id"),
        renderHTML: (attrs) => (attrs.id ? { "data-image-id": attrs.id } : {}),
      },
    };
  },
  parseHTML: () => [{ tag: "img[data-image-id]" }],
  renderHTML: ({ HTMLAttributes }) => ["img", mergeAttributes({ alt: "" }, HTMLAttributes)],
  addNodeView: () => ReactNodeViewRenderer(NoteImageView),
});

function NoteImageView({ node }: ReactNodeViewProps) {
  const images = useContext(NoteImages);
  const id = typeof node.attrs.id === "string" ? node.attrs.id : "";
  const img = images[id];
  if (!img) {
    return (
      <NodeViewWrapper className="note-img note-img-gone" data-image-id={id}>
        <span className="note-img-missing"><Icon name="image" size={15} /> Image unavailable</span>
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper className="note-img" data-image-id={id}>
      <img src={img.data} width={img.w} height={img.h} alt="" draggable={false} />
    </NodeViewWrapper>
  );
}

/**
 * Rich notes — one Tiptap document in two shapes: the editor used while writing, and the
 * read-only view used on the detail, vault and public share pages.
 *
 * Notes are stored as the **HTML** this editor produces (`lib/note.ts` explains the round trip,
 * including the plain-text notes written before the editor existed). Both shapes are built from
 * the same extension list, so what you write is exactly what everyone reads — and nothing else is
 * ever rendered: the read view is ProseMirror parsing into its schema, not raw HTML into the DOM.
 *
 * Code blocks are the interesting part. `CodeBlockLowlight` highlights them with highlight.js, so
 * a pasted snippet is coloured even before a language is picked (it auto-detects); the language
 * menu pins it when the guess is wrong. Token colours are the app's own `--t-*` variables, so a
 * code block inside a note looks like a code block everywhere else.
 *
 * Images are the other interesting part: they are references into the snippet's own gallery (see
 * `NoteImage` above), so a page hands its loaded images to the editor or the view and the node
 * view resolves them — which is why `NoteImages` is provided around `<EditorContent>` in both.
 */

/** Only the grammars the app's language list can produce, so the bundle stays honest. */
const lowlight = createLowlight();
lowlight.register({ bash, cpp, css, go, java, javascript, json, markdown, php, python, rust, sql, typescript, xml });

/** A fresh list per call — extensions hold per-editor state, so never share one instance. */
export const extensionsFor = (placeholder: string) => [
  StarterKit.configure({
    codeBlock: false, // replaced by the highlighted one below
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false, // in the editor a click places the cursor; on a read-only page it follows the link
      autolink: true,
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
    },
  }),
  CodeBlockLowlight.configure({ lowlight, enableTabIndentation: true, tabSize: 2 }),
  TaskList,
  TaskItem.configure({ nested: true }),
  NoteImage,
  Placeholder.configure({ placeholder }),
  CharacterCount.configure({ limit: MAX_NOTE_CHARS, mode: "textSize" }),
];

const BLOCKS = [
  { value: "p", label: "Text" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "quote", label: "Quote" },
  { value: "code", label: "Code block" },
];

const CODE_LANGS = [
  { value: "", label: "Auto-detect" },
  ...LANGUAGES.filter((l) => noteLang(l)).map((l) => ({ value: noteLang(l)!, label: l })),
];

const KEY = "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted transition hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-35";
const KEY_ON = "border-accent/40 bg-accent/15 text-ink hover:text-ink";

/** One toolbar toggle. Not a `<form>` submit button — the editor is used inside forms. */
function ToolBtn({ name, label, on, disabled, onClick }: {
  name: IconName; label: string; on?: boolean; disabled?: boolean; onClick(): void;
}) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={on} disabled={disabled}
      className={`${KEY} ${on ? KEY_ON : ""}`} onClick={onClick}>
      <Icon name={name} size={16} />
    </button>
  );
}

function Toolbar({ editor, defaultLang, images, onAddImage }: {
  editor: Editor; defaultLang?: string; images: NoteImageSource[]; onAddImage?(file: File): Promise<string | null>;
}) {
  const { prompt } = useModal();
  const file = useRef<HTMLInputElement>(null);

  const add = async (f: File) => {
    const id = await onAddImage?.(f);
    if (id) insertNoteImage(editor, id);
  };

  const imageOptions = [
    { value: "", label: "Image" },
    ...images.map((im, i) => ({
      value: im.id,
      label: `Image ${i + 1}`,
      hint: `${im.w}×${im.h}`,
      icon: <img src={im.data} alt="" className="size-6 shrink-0 rounded-md border border-line object-cover" />,
    })),
    ...(onAddImage ? [{ value: "__add", label: "Add image…", icon: <Icon name="plus" size={15} className="shrink-0 text-muted" /> }] : []),
  ];
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive("codeBlock") ? "code"
        : e.isActive("blockquote") ? "quote"
        : e.isActive("heading", { level: 1 }) ? "h1"
        : e.isActive("heading", { level: 2 }) ? "h2"
        : e.isActive("heading", { level: 3 }) ? "h3"
        : "p",
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      tasks: e.isActive("taskList"),
      link: e.isActive("link"),
      codeBlock: e.isActive("codeBlock"),
      lang: (e.getAttributes("codeBlock").language as string | undefined) ?? "",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const setBlock = (v: string) => {
    if (v === "code") editor.chain().focus().setCodeBlock({ language: noteLang(defaultLang) ?? "" }).run();
    else if (v === "quote") editor.chain().focus().toggleBlockquote().run();
    else if (v === "p") editor.chain().focus().setParagraph().run();
    else editor.chain().focus().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
  };

  const mark = (name: string) => editor.chain().focus().toggleMark(name).run();

  const addLink = async () => {
    const href = await prompt({
      title: s.link ? "Edit link" : "Add a link",
      label: "URL", placeholder: "https://example.com", icon: "link",
      initial: (editor.getAttributes("link").href as string | undefined) ?? "",
      confirmLabel: "Use link",
    });
    if (href === null) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-line bg-surface px-2 py-1.5">
      <Select ariaLabel="Block type" value={s.block} onChange={setBlock} options={BLOCKS}
        className="w-[118px] shrink-0" buttonClass="!h-8 !rounded-lg !px-2 !text-[13px]" />
      <span className="mx-0.5 h-5 w-px shrink-0 bg-line" aria-hidden="true" />

      <ToolBtn name="bold" label="Bold (⌘B)" on={s.bold} onClick={() => mark("bold")} />
      <ToolBtn name="italic" label="Italic (⌘I)" on={s.italic} onClick={() => mark("italic")} />
      <ToolBtn name="underline" label="Underline (⌘U)" on={s.underline} onClick={() => mark("underline")} />
      <ToolBtn name="strike" label="Strikethrough" on={s.strike} onClick={() => mark("strike")} />
      <ToolBtn name="code" label="Inline code" on={s.code} onClick={() => mark("code")} />
      <span className="mx-0.5 h-5 w-px shrink-0 bg-line" aria-hidden="true" />

      <ToolBtn name="list" label="Bullet list" on={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolBtn name="listOrdered" label="Numbered list" on={s.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolBtn name="checkSquare" label="Checklist" on={s.tasks} onClick={() => editor.chain().focus().toggleTaskList().run()} />
      <ToolBtn name="quote" label="Quote" on={s.block === "quote"} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <ToolBtn name="minus" label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      <ToolBtn name="link" label="Link" on={s.link} onClick={addLink} />

      {(images.length > 0 || onAddImage) && (
        <>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
          <Select ariaLabel="Insert image" value="" options={imageOptions} className="w-[104px] shrink-0"
            buttonClass="!h-8 !rounded-lg !px-2 !text-[13px]" prefix={<Icon name="image" size={15} className="text-muted" />}
            onChange={(v) => { if (v === "__add") file.current?.click(); else if (v) insertNoteImage(editor, v); }} />
          <input ref={file} type="file" accept="image/*" hidden
            onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await add(f); }} />
        </>
      )}

      {s.codeBlock && (
        <>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
          <Select ariaLabel="Code language" value={s.lang} options={CODE_LANGS}
            onChange={(v) => editor.chain().focus().updateAttributes("codeBlock", { language: v }).run()}
            className="w-[132px] shrink-0" buttonClass="!h-8 !rounded-lg !px-2 !text-[13px]" />
        </>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-1">
        <ToolBtn name="undo" label="Undo (⌘Z)" disabled={!s.canUndo} onClick={() => editor.chain().focus().undo().run()} />
        <ToolBtn name="redo" label="Redo (⇧⌘Z)" disabled={!s.canRedo} onClick={() => editor.chain().focus().redo().run()} />
      </span>
    </div>
  );
}

/** The note editor. `value`/`onChange` are HTML; an empty editor reports "" so it stays "no note". */
export function RichNoteEditor({ value, onChange, placeholder, defaultLang, autoFocus, images = [], onAddImage, page = false }: {
  value: string;
  onChange(html: string): void;
  placeholder?: string;
  /** Language used for a new code block — usually the snippet's own. */
  defaultLang?: string;
  autoFocus?: boolean;
  /** The snippet's images, offered in the toolbar and resolved in the note. */
  images?: NoteImageSource[];
  /** Save a file as one of the snippet's images and return its id (null when it didn't fit). */
  onAddImage?(file: File): Promise<string | null>;
  /** Page mode: the editor is the snippet's whole content, so it gets a taller writing surface. */
  page?: boolean;
}) {
  const ph = useMemo(
    () => placeholder ?? (page
      ? "Write your page — headings, lists, images, code blocks, anything you like."
      : "Explain the code to yourself — why it works this way, edge cases, anything you'll want to remember later."),
    [placeholder, page],
  );
  const editor = useEditor({
    extensions: useMemo(() => extensionsFor(ph), [ph]),
    content: noteToHtml(value),
    autofocus: autoFocus,
    editorProps: { attributes: { class: `note-prose note-edit${page ? " note-edit-page" : ""}` } },
    // An empty editor serialises to `<p></p>`; a note is only worth storing once it says something
    // — but a divider on its own is content, so `isNoteEmpty` keeps it.
    onUpdate: ({ editor: e }) => { const html = e.getHTML(); onChange(isNoteEmpty(html) ? "" : html); },
  });

  // A snippet loaded from Firestore arrives after the first render, so adopt it when it does
  // (and only then — never re-set content the user is typing into).
  useEffect(() => {
    if (!editor) return;
    const next = noteToHtml(value);
    if (next && next !== editor.getHTML()) editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, value]);

  const map = useMemo(() => {
    const m: NoteImageMap = {};
    for (const im of images) m[im.id] = { data: im.data, w: im.w, h: im.h };
    return m;
  }, [images]);

  /** Save a dropped or pasted file as one of the snippet's images, then point the note at it. */
  const takeFile = async (file: File) => {
    const id = await onAddImage?.(file);
    if (id) insertNoteImage(editor, id);
  };
  const takeFiles = (files: File[]) => { for (const f of files) void takeFile(f); };
  const imageFiles = (list: FileList | null) => [...(list ?? [])].filter((f) => f.type.startsWith("image/"));

  const onPaste = (e: React.ClipboardEvent) => {
    const files = imageFiles(e.clipboardData.files);
    if (!onAddImage || !files.length) return; // let text paste through untouched
    e.preventDefault();
    e.stopPropagation(); // the page has its own paste-to-attach shortcut; don't add it twice
    takeFiles(files);
  };
  const onDrop = (e: React.DragEvent) => {
    const files = imageFiles(e.dataTransfer.files);
    if (!onAddImage || !files.length) return;
    e.preventDefault();
    e.stopPropagation();
    takeFiles(files);
  };

  const chars = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? e.getText().length : 0),
  }) ?? 0;

  if (!editor) return <div className="skeleton h-[150px] rounded-[10px]" />;

  return (
    <div className="overflow-visible rounded-[10px] border border-line bg-surface-2 transition focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20">
      <Toolbar editor={editor} defaultLang={defaultLang} images={images} onAddImage={onAddImage} />
      {/* Drop or paste a picture anywhere on the note and it joins the snippet's images. */}
      <div onDrop={onDrop} onPaste={onPaste} onDragOver={(e) => { if (onAddImage && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); }}>
        <NoteImages.Provider value={map}>
          <EditorContent editor={editor} />
        </NoteImages.Provider>
      </div>
      <div className="flex justify-between gap-2 border-t border-line px-3 py-1.5 text-[12px] text-faint">
        <span>{page
          ? "Headings, lists, checklists, quotes, images and code — everything is on the toolbar"
          : <>Headings, lists, checklists, quotes and code — <code className="text-[11.5px]">#</code> and <code className="text-[11.5px]">```</code> work as shortcuts</>}</span>
        <span className={chars > MAX_NOTE_CHARS * 0.9 ? "text-danger" : ""}>{chars.toLocaleString()} / {MAX_NOTE_CHARS.toLocaleString()}</span>
      </div>
    </div>
  );
}

/** Read-only render of a stored note. Shows nothing when the note has no text. */
export function NoteView({ html, className = "", images = [] }: { html: string | undefined; className?: string; images?: NoteImageSource[] }) {
  const content = useMemo(() => noteToHtml(html), [html]);
  const extensions = useMemo(() => extensionsFor(""), []);
  const editor = useEditor({
    extensions,
    content,
    editable: false,
    editorProps: { attributes: { class: "note-prose" } },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, content]);

  const map = useMemo(() => {
    const m: NoteImageMap = {};
    for (const im of images) m[im.id] = { data: im.data, w: im.w, h: im.h };
    return m;
  }, [images]);

  if (!content) return null;
  if (!editor) return <div className="skeleton h-16 rounded-[10px]" />;
  return (
    <NoteImages.Provider value={map}>
      <EditorContent editor={editor} className={className} />
    </NoteImages.Provider>
  );
}
