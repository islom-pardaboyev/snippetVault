import type { Snippet } from "./types";
import { MAX_NOTE_HTML, noteText, noteToHtml } from "./note";

/**
 * A "page" is a snippet whose content is rich text instead of code. It is chosen from the same
 * language menu as everything else (it replaced the old catch-all "Other" entry), but when it is
 * picked the code editor gives way to the full note editor, and the detail and share pages render
 * the page instead of a code block. The content lives in `Snippet.notes`; `code` stays empty.
 */
export const PAGE_LANG = "Page";

export const LANGUAGES = [
  "JavaScript", "TypeScript", "Python", "SQL", "Terminal", "Shell", "CSS", "HTML",
  "JSON", "Go", "Rust", "Java", "C++", "PHP", "Markdown", "Page",
] as const;

export const LANG_COLOR: Record<string, string> = {
  JavaScript: "#f7df1e", TypeScript: "#3b82f6", Python: "#5b9bd5", SQL: "#e38c00",
  Shell: "#4eaa25", Terminal: "#3ddc84", CSS: "#4d8bff", HTML: "#e34c26", JSON: "#b8bec7", Go: "#00add8",
  Rust: "#dea584", Java: "#f89820", "C++": "#f34b7d", PHP: "#8892bf", Markdown: "#8b949e",
  Other: "#8c919b", Page: "#8c919b",
};

export const langColor = (l: string) => LANG_COLOR[l] ?? LANG_COLOR.Other;

/** True when a language marks a page — rich text instead of code. */
export const isPage = (lang: string) => lang === PAGE_LANG;

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (m < 60) return `${m} min ago`;
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  if (d < 30) return `${d} day${d > 1 ? "s" : ""} ago`;
  const mo = Math.floor(d / 30);
  return `${mo} month${mo > 1 ? "s" : ""} ago`;
}

export const newId = () => "s" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

export const parseTags = (s: string) =>
  Array.from(new Set(s.split(",").map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean)));

export const lineCount = (code: string) => (code ? code.split("\n").length : 0);

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

const EXT: Record<string, string> = {
  JavaScript: "js", TypeScript: "ts", Python: "py", SQL: "sql", Terminal: "sh", Shell: "sh", CSS: "css", HTML: "html",
  JSON: "json", Go: "go", Rust: "rs", Java: "java", "C++": "cpp", PHP: "php", Markdown: "md", Other: "txt", Page: "txt",
};

export function downloadFile(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const snippetFilename = (s: Snippet) =>
  (s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "snippet") + "." + (EXT[s.language] ?? "txt");

/** The minimal shape needed to render or copy a snippet (a page carries its text in `notes`). */
export interface CodeLike { code: string; language: string; title: string; notes?: string; }

export function toMarkdown(s: CodeLike) {
  // A page has no code fence — its readable text is what gets copied.
  if (isPage(s.language)) return noteText(s.notes).trim() || s.title;
  return "```" + s.language.toLowerCase() + "\n" + s.code + "\n```";
}

/** Escape text for safe use inside HTML. Matches the escaping in `lib/note.ts`. */
export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** A `<pre><code>` block, ready to paste into a blog or chat that takes HTML (a page keeps its HTML). */
export function toHtml(s: CodeLike) {
  if (isPage(s.language)) return noteToHtml(s.notes);
  return `<pre><code class="language-${s.language.toLowerCase()}">${escapeHtml(s.code)}</code></pre>`;
}

/** The title followed by the code in markdown fences (or by the page's text). */
export function titleAndCode(s: CodeLike) {
  if (isPage(s.language)) return `${titleSlug(s, " ")}\n\n${noteText(s.notes).trim()}`;
  return `${titleSlug(s, " ")}\n\n${toMarkdown(s)}`;
}

const titleSlug = (s: CodeLike, sep: string) => s.title.trim() || sep.trim() || "Untitled";

/** Best-effort language guess for pasted code. */
export function detectLanguage(code: string): string | null {
  const c = code.trim();
  if (c.length < 8) return null;
  if (/^[\[{]/.test(c)) { try { JSON.parse(c); return "JSON"; } catch { /* not json */ } }
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|WITH)\b/i.test(c)) return "SQL";
  if (/^<!DOCTYPE|<html|<div|<\/?(main|section|header|body)\b/i.test(c)) return "HTML";
  if (/^#!\/bin\/(ba)?sh|^\s*(git|docker|npm|pnpm|yarn|sudo|curl|cd|ls|brew)\s/m.test(c)) return "Shell";
  if (/^package \w+|\bfunc \w+\(|:= /m.test(c)) return "Go";
  if (/\bfn \w+\(|let mut |\bimpl\b|println!/.test(c)) return "Rust";
  if (/^\s*(def |class \w+(\(.*\))?:|import \w+$|from \w+ import)/m.test(c) || /\bprint\(/.test(c) && !/;\s*$/m.test(c)) return "Python";
  if (/:\s*(string|number|boolean|void)\b|\binterface \w+|\btype \w+ =|<\w+>\(/.test(c)) return "TypeScript";
  if (/\b(const|let|var|function)\b|=>|console\.log/.test(c)) return "JavaScript";
  if (/^\s*[.#]?[\w-]+(\s*[>+~]\s*[\w.#-]+)*\s*\{[^}]*:[^}]*\}/m.test(c)) return "CSS";
  if (/^#{1,3} \w|^\s*[-*] \w/m.test(c)) return "Markdown";
  return null;
}

export function exportJson(snippets: Snippet[]) {
  downloadFile(
    `snippetvault-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ app: "snippetvault", version: 2, exported_at: new Date().toISOString(), snippets }, null, 2),
    "application/json",
  );
}

/** Validate an imported file; returns clean snippets (never trusts shape). */
export function parseImport(text: string): Snippet[] {
  const raw = JSON.parse(text);
  const arr: unknown[] = Array.isArray(raw) ? raw : Array.isArray(raw?.snippets) ? raw.snippets : [];
  const now = new Date().toISOString();
  const out: Snippet[] = [];
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.title !== "string" || typeof o.code !== "string") continue;
    const snippet: Snippet = {
      id: typeof o.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : newId(),
      title: o.title.slice(0, 200),
      code: o.code,
      language: typeof o.language === "string" ? o.language : "Other",
      description: typeof o.description === "string" ? o.description : "",
      favorite: o.favorite === true,
      tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === "string").slice(0, 30) : [],
      created_at: typeof o.created_at === "string" ? o.created_at : now,
      updated_at: typeof o.updated_at === "string" ? o.updated_at : now,
    };
    if (typeof o.notes === "string" && o.notes.trim()) snippet.notes = o.notes.slice(0, MAX_NOTE_HTML);
    out.push(snippet);
  }
  return out;
}

const GROUPS: Record<string, string> = {
  s1: "Frontend", s2: "Frontend", s10: "Frontend", s7: "Frontend", s9: "Frontend",
  s3: "Data", s5: "Data", s4: "Backend", s6: "DevOps", s8: "DevOps",
};

export function seedSnippets(): Snippet[] {
  const now = Date.now();
  const d = (n: number) => new Date(now - n * 86400000).toISOString();
  const mk = (id: string, title: string, language: string, tags: string[], description: string, code: string, days: number, favorite = false, notes = "", share = ""): Snippet =>
    ({ id, title, language, tags, description, code, favorite, group: GROUPS[id] ?? "", ...(notes ? { notes } : {}), ...(share ? { share_token: share } : {}), created_at: d(days), updated_at: d(days) });
  return [
    mk("s1", "Debounce function", "JavaScript", ["utils", "performance"], "Delay a function until after N milliseconds of silence. Great for search inputs.",
      "function debounce(fn, ms) {\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), ms);\n  };\n}", 2, true, "`timer` lives in a closure, so every debounce() call gets its own independent timer.\n\nTune ms to the input: ~200ms for local filtering, ~400ms before a network request.", "demoShareLink01"),
    mk("s2", "Typed fetch helper", "TypeScript", ["api", "utils"], "Generic JSON fetch that throws on non-2xx responses.",
      "async function getJSON<T>(url: string): Promise<T> {\n  const res = await fetch(url);\n  if (!res.ok) throw new Error(`HTTP ${res.status}`);\n  return res.json() as Promise<T>;\n}", 5, false, "Throws on non-2xx so callers can try/catch instead of checking res.ok at every call site.\nThe <T> parameter is only a cast — validate the shape if the API is untrusted."),
    mk("s3", "Read a CSV with pandas", "Python", ["data"], "Load a CSV, parse dates, and preview the first rows.",
      "import pandas as pd\n\ndf = pd.read_csv('sales.csv', parse_dates=['date'])\nprint(df.head())\nprint(df.describe())", 9),
    mk("s4", "Minimal Flask route", "Python", ["web", "api"], "The smallest possible JSON endpoint.",
      "from flask import Flask, jsonify\n\napp = Flask(__name__)\n\n@app.get('/health')\ndef health():\n    return jsonify(status='ok')", 12),
    mk("s5", "Top 10 customers by revenue", "SQL", ["analytics"], "Group orders by customer and take the biggest spenders.",
      "SELECT c.name,\n       SUM(o.total) AS revenue\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nWHERE o.created_at >= NOW() - INTERVAL '30 days'\nGROUP BY c.name\nORDER BY revenue DESC\nLIMIT 10;", 3, true),
    mk("s6", "Undo last commit (keep changes)", "Shell", ["git"], "Moves HEAD back one commit but leaves your files untouched.",
      "git reset --soft HEAD~1\n# your changes stay staged, ready to re-commit", 1),
    mk("s7", "Center a div (modern)", "CSS", ["layout"], "Grid-based centering, no flexbox needed.",
      ".center {\n  display: grid;\n  place-items: center;\n  min-height: 100vh;\n}", 20),
    mk("s8", "Postgres in docker compose", "Shell", ["devops", "config"], "A small Postgres service with a healthcheck.",
      "services:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: secret\n    ports:\n      - '5432:5432'", 15),
    mk("s9", "Semantic HTML page shell", "HTML", ["layout"], "Boilerplate with header, main and footer landmarks.",
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>Page</title>\n  </head>\n  <body>\n    <header></header>\n    <main></main>\n    <footer></footer>\n  </body>\n</html>", 30),
    mk("s10", "useLocalStorage hook", "TypeScript", ["react", "hooks"], "State that persists in localStorage and survives reloads.",
      "function useLocalStorage<T>(key: string, initial: T) {\n  const [value, setValue] = useState<T>(() => {\n    const raw = localStorage.getItem(key);\n    return raw ? (JSON.parse(raw) as T) : initial;\n  });\n  useEffect(() => {\n    localStorage.setItem(key, JSON.stringify(value));\n  }, [key, value]);\n  return [value, setValue] as const;\n}", 4, true),
    // A "Page" is prose, not code — its content lives in `notes`. Pick it from the language menu.
    mk("s11", "Release notes — v2.0", "Page", ["notes", "release"], "A written page (not code): headings, lists and quotes all work.",
      "", 0, false,
      "<h1>Release notes — v2.0</h1><p>The vault update is here. A short summary of what changed and what to try first.</p><h2>Highlights</h2><ul><li><p><strong>Encrypted vault</strong> — AES-256-GCM, opened with your own passphrase.</p></li><li><p><strong>Rich notes</strong> — headings, checklists, quotes and images.</p></li><li><p><strong>Pages</strong> — write prose instead of code, and share it like any snippet.</p></li></ul><h2>How to try it</h2><ol><li><p>Pick <em>Page</em> from the language menu when you create a snippet.</p></li><li><p>Write freely — the code editor steps aside.</p></li><li><p>Share it; the page renders as a full page for anyone with the link.</p></li></ol><blockquote><p>Tip: the language menu still remembers older snippets that used <em>Other</em>.</p></blockquote>"),
  ];
}

/* ---------- template variables: {{name}} ---------- */
const VAR_RE = /\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}/g;

export function templateVars(code: string): string[] {
  return [...new Set([...code.matchAll(VAR_RE)].map((m) => m[1]))];
}
export function fillTemplate(code: string, values: Record<string, string>): string {
  return code.replace(VAR_RE, (whole, name: string) => (name in values ? values[name] : whole));
}

/** Rough line-level diff summary between two texts. */
export function diffStats(a: string, b: string) {
  const A = a.split("\n"), B = b.split("\n");
  const countA = new Map<string, number>();
  A.forEach((l) => countA.set(l, (countA.get(l) ?? 0) + 1));
  let same = 0;
  B.forEach((l) => { const c = countA.get(l) ?? 0; if (c > 0) { same++; countA.set(l, c - 1); } });
  return { added: B.length - same, removed: A.length - same };
}
