/**
 * Notes are rich text. `Snippet.notes` holds the HTML the Tiptap editor in
 * `components/RichNote.tsx` produces — headings, lists, quotes and highlighted code blocks.
 *
 * Two rules keep this safe and dependency-free:
 *
 *  - `noteToHtml()` is the **only** thing ever handed to the editor, and it escapes anything that
 *    is not already markup. Notes written before the rich editor existed are plain text, and are
 *    turned into paragraphs here rather than being lost to HTML whitespace collapsing.
 *  - `noteText()` is for search, previews and emptiness checks. It strips tags and is **never**
 *    rendered — the editor renders notes, and it only ever builds nodes it knows.
 */

/** Plain-text ceiling for a note, counted by the editor's character count. */
export const MAX_NOTE_CHARS = 20_000;

/** Ceiling for the stored HTML, applied when importing a file (markup needs headroom over text). */
export const MAX_NOTE_HTML = 200_000;

/**
 * Does this look like markup rather than the plain-text notes written before the rich editor?
 * Only used to choose a conversion, never to decide whether something is safe to render. An
 * image reference counts as markup; a plain-text note that merely mentions `<img>` does not.
 */
const BLOCK_TAG = /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|pre|code|strong|em|u|s|br|hr|a|span|div)\b|<img\b[^>]*\bdata-image-id=/i;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const UNESCAPE: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

const unescapeHtml = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => UNESCAPE[m]);

/**
 * A note as the editor should read it: html passes through, plain text becomes paragraphs
 * (a blank line starts a new one, a single newline is a line break).
 */
export function noteToHtml(raw: string | undefined): string {
  const s = raw ?? "";
  if (!s.trim()) return "";
  if (BLOCK_TAG.test(s)) return s;
  return s
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * The readable text of a note — for search, and for asking "is there anything here?".
 * Do not render the result as markup; use the editor for that.
 */
export function noteText(raw: string | undefined): string {
  const s = raw ?? "";
  if (!s.trim()) return "";
  if (!BLOCK_TAG.test(s)) return s.trim();
  return unescapeHtml(
    s
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|h[1-6]|li|blockquote|pre|div|ul|ol)>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Images in a note are **references**, never the bytes themselves: the note stores the id of an
 * image the snippet already owns (`<img data-image-id="…">`). That keeps one copy of every
 * picture, keeps the app's existing rules (five per snippet; unlimited and encrypted in the
 * vault), and keeps share links working, because a share copies the snippet's images under the
 * same ids.
 *
 * The ids are opaque to this module — `components/RichNote.tsx` is what resolves them against the
 * images a page loaded, and shows a placeholder for any that aren't there (deleted, or still
 * encrypted).
 */
export function noteImageIds(raw: string | undefined): string[] {
  const s = raw ?? "";
  if (!s.includes("data-image-id")) return [];
  const re = /<img\b[^>]*\bdata-image-id="([^"]*)"/gi;
  const ids: string[] = [];
  for (let m = re.exec(s); m; m = re.exec(s)) if (m[1] && !ids.includes(m[1])) ids.push(m[1]);
  return ids;
}

/** True when a note has anything to show — text or an image. An empty editor stores `<p></p>`. */
export const hasNoteText = (raw: string | undefined): boolean => !isNoteEmpty(raw);

/** A node that carries meaning with no words of its own — a divider (an image is handled above). */
const NON_TEXT_BLOCK = /<hr\b/i;

/**
 * True only when there is genuinely nothing in the note. An empty editor stores `<p></p>`, and a
 * list or checklist with no items filled in also reads as empty — but a divider is content on its
 * own, so a page holding just one must not be silently thrown away.
 */
export function isNoteEmpty(raw: string | undefined): boolean {
  const s = raw ?? "";
  if (noteImageIds(s).length) return false;
  if (noteText(s) !== "") return false;
  return !NON_TEXT_BLOCK.test(s);
}

/**
 * The note a snippet keeps after one of its images is deleted: every reference to that id is
 * dropped, so a deleted picture never lingers as an "unavailable" placeholder. Text untouched.
 */
export function dropNoteImage(raw: string | undefined, id: string): string {
  const s = raw ?? "";
  if (!s.includes("data-image-id")) return s;
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return s.replace(new RegExp(`<img\\b[^>]*\\bdata-image-id="${esc}"[^>]*>`, "gi"), "");
}

/**
 * The app's language names → highlight.js grammar ids, for the code blocks inside a note.
 * Undefined means "let the highlighter guess", which is what `Other` and unset languages get.
 */
const HLJS: Record<string, string> = {
  JavaScript: "javascript",
  TypeScript: "typescript",
  Python: "python",
  SQL: "sql",
  Terminal: "bash",
  Shell: "bash",
  CSS: "css",
  HTML: "xml",
  JSON: "json",
  Go: "go",
  Rust: "rust",
  Java: "java",
  "C++": "cpp",
  PHP: "php",
  Markdown: "markdown",
};

export const noteLang = (lang: string | null | undefined): string | undefined =>
  lang ? HLJS[lang] : undefined;
