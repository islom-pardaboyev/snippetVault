import type { Snippet } from "./types";
import { hasNoteText, noteText } from "./note";

/**
 * Search for the vault.
 *
 * A query is a list of whitespace-separated tokens. Most tokens are free text
 * and are matched fuzzily against a snippet's title, description, tags,
 * language, notes and code. A few `key:value` operators narrow the results:
 *
 *   lang:python   tag:api      group:Frontend
 *   is:starred    is:shared    has:notes     has:images
 *   before:2026-01            after:2026-01-15
 *
 * Quoted phrases ("exact words") are kept together as one token.
 */

export interface ParsedQuery {
  terms: string[];
  lang?: string;
  tag?: string;
  group?: string;
  starred?: boolean;
  shared?: boolean;
  hasNotes?: boolean;
  hasImages?: boolean;
  before?: number;
  after?: number;
}

const TOKEN_RE = /"[^"]*"|\S+/g;

function tokenize(raw: string): string[] {
  return raw.match(TOKEN_RE) ?? [];
}

/** Friendly shorthands so `lang:ts` finds TypeScript. */
const LANG_ALIAS: Record<string, string> = {
  js: "javascript", ts: "typescript", py: "python", rb: "ruby", sh: "shell",
  bash: "shell", zsh: "shell", yml: "yaml", yaml: "yaml", md: "markdown",
  cpp: "c++", cxx: "c++", cs: "c#", csharp: "c#", golang: "go",
  postgres: "sql", psql: "sql", mysql: "sql", jsonc: "json", html5: "html",
};

const unquote = (s: string) => s.replace(/^"|"$/g, "").trim();

export function parseQuery(raw: string): ParsedQuery {
  const p: ParsedQuery = { terms: [] };
  for (const tok of tokenize(raw)) {
    const m = /^([a-z]+):(.*)$/i.exec(tok);
    if (m && m[2].length) {
      const key = m[1].toLowerCase();
      const val = unquote(m[2]);
      if (key === "lang" || key === "language") { p.lang = val; continue; }
      if (key === "tag") { p.tag = val.replace(/^#/, ""); continue; }
      if (key === "group") { p.group = val; continue; }
      if (key === "is" || key === "has") {
        const v = val.toLowerCase();
        if (v === "starred" || v === "fav" || v === "favorite" || v === "favourite") p.starred = true;
        else if (v === "shared") p.shared = true;
        else if (v === "notes") p.hasNotes = true;
        else if (v === "images") p.hasImages = true;
        else p.terms.push(unquote(tok));
        continue;
      }
      if (key === "before") { const t = Date.parse(val); if (!Number.isNaN(t)) p.before = t; continue; }
      if (key === "after") { const t = Date.parse(val); if (!Number.isNaN(t)) p.after = t; continue; }
    }
    const term = unquote(tok);
    if (term) p.terms.push(term);
  }
  return p;
}

const isSubsequence = (needle: string, hay: string): boolean => {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) if (hay[j] === needle[i]) i++;
  return i === needle.length;
};

/** Edit distance ≤ 1, counting one adjacent transposition as a single edit. */
function within1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (i + 1 < la && j + 1 < lb && a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2; }
    else if (la > lb) i++;
    else if (lb > la) j++;
    else { i++; j++; }
    if (++diff > 1) return false;
  }
  if (i < la || j < lb) diff++;
  return diff <= 1;
}

const WORD_RE = /[^a-z0-9_$#+.-]+/;

/** True when `term` occurs in `hay` — as a substring, a subsequence, or one typo away. */
export function fuzzyIncludes(hay: string, term: string): boolean {
  if (!term) return true;
  if (hay.includes(term)) return true;
  if (term.length >= 3 && isSubsequence(term, hay)) return true;
  if (term.length >= 4) {
    for (const w of hay.split(WORD_RE)) {
      if (w && Math.abs(w.length - term.length) <= 1 && within1(term, w)) return true;
    }
  }
  return false;
}

function langMatches(snippetLang: string, q: string): boolean {
  const a = snippetLang.toLowerCase();
  const b = q.toLowerCase();
  if (a === b || a.startsWith(b)) return true;
  return (LANG_ALIAS[b] ?? b) === a;
}

const haystack = (s: Snippet) =>
  `${s.title}\n${s.description}\n${s.tags.join(" ")}\n${s.language}\n${noteText(s.notes)}\n${s.code}`.toLowerCase();

/**
 * Score a snippet against a query. Returns null when it does not match, or a
 * relevance number (higher = better) when it does. An empty query matches all.
 */
export function scoreSnippet(s: Snippet, p: ParsedQuery): number | null {
  if (p.lang && !langMatches(s.language, p.lang)) return null;
  if (p.tag && !s.tags.some((t) => t.toLowerCase() === p.tag!.toLowerCase() || t.toLowerCase().startsWith(p.tag!.toLowerCase()))) return null;
  if (p.group && (s.group ?? "").toLowerCase() !== p.group.toLowerCase()) return null;
  if (p.starred && !s.favorite) return null;
  if (p.shared && !s.share_token) return null;
  if (p.hasNotes && !hasNoteText(s.notes)) return null;
  if (p.hasImages && !((s.image_count ?? 0) > 0)) return null;

  if (p.before || p.after) {
    const t = Date.parse(s.updated_at);
    if (p.before && t >= p.before) return null;
    if (p.after && t < p.after) return null;
  }

  if (!p.terms.length) return 1;

  const title = s.title.toLowerCase();
  const tags = s.tags.map((t) => t.toLowerCase());
  const hay = haystack(s);
  let score = 0;
  for (const term of p.terms) {
    const t = term.toLowerCase();
    const inTitle = fuzzyIncludes(title, t);
    const inTag = tags.some((x) => fuzzyIncludes(x, t));
    if (!inTitle && !inTag && !fuzzyIncludes(hay, t)) return null;
    score += inTitle ? 4 : inTag ? 3 : hay.includes(t) ? 2 : 1;
  }
  return score;
}

export const matchesQuery = (s: Snippet, p: ParsedQuery): boolean => scoreSnippet(s, p) !== null;

/* ---------------- filter chips ---------------- */

export interface FilterChip { token: string; label: string; }

const OPERATORS = new Set(["lang", "language", "tag", "group", "is", "has", "before", "after"]);

function chipLabel(key: string, value: string): string {
  const v = value.toLowerCase();
  if (key === "is" || key === "has") {
    if (v === "starred" || v === "fav" || v === "favorite" || v === "favourite") return "Starred";
    if (v === "shared") return "Shared";
    if (v === "notes") return "Has notes";
    if (v === "images") return "Has images";
    return value;
  }
  if (key === "tag") return `#${value}`;
  if (key === "lang" || key === "language") return value;
  if (key === "group") return `in ${value}`;
  if (key === "before") return `before ${value}`;
  if (key === "after") return `after ${value}`;
  return `${key}:${value}`;
}

/** The operator tokens present in a raw query, ready to render as removable chips. */
export function activeFilters(raw: string): FilterChip[] {
  const out: FilterChip[] = [];
  for (const tok of tokenize(raw)) {
    const m = /^([a-z]+):(.*)$/i.exec(tok);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (!OPERATORS.has(key)) continue;
    const value = unquote(m[2]);
    if (!value) continue;
    out.push({ token: tok, label: chipLabel(key, value) });
  }
  return out;
}

/** Add a token to a query, or remove it when it is already present. */
export function toggleToken(raw: string, token: string): string {
  const toks = tokenize(raw);
  const lower = token.toLowerCase();
  const without = toks.filter((t) => t.toLowerCase() !== lower);
  const next = without.length === toks.length ? [...toks, token] : without;
  return next.join(" ").trim();
}

/* ---------------- recent searches ---------------- */

const RECENT_KEY = "sv:recent-searches";
const MAX_RECENT = 6;

export function recentSearches(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch { return []; }
}

export function pushRecentSearch(raw: string): string[] {
  const q = raw.trim();
  if (q.length < 2) return recentSearches();
  const next = [q, ...recentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function clearRecentSearches(): void {
  try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
}
