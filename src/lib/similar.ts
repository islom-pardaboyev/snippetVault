import type { Snippet } from "./types";

/**
 * Duplicate detection. Two snippets are "similar" when their code shares most
 * of its words (ignoring formatting, comments and whitespace) — enough to catch
 * the same helper re-saved, lightly edited, or reformatted.
 *
 * The score is the Sørensen–Dice overlap of the two word sets, eased by a length
 * ratio so a short snippet never reads as a near-match to a long one.
 */

const norm = (code: string) => code.replace(/\s+/g, " ").trim().toLowerCase();

/** Cheap, stable fingerprint of a snippet's normalized code (for exact matches). */
export function fingerprint(code: string): string {
  const s = norm(code);
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 + c, 2654435761);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${s.length.toString(36)}`;
}

function words(code: string): Set<string> {
  const out = new Set<string>();
  for (const w of norm(code).split(/[^a-z0-9_$]+/)) if (w.length > 1) out.add(w);
  return out;
}

function blend(a: string, b: string, A: Set<string>, B: Set<string>): number {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const dice = (2 * inter) / (A.size + B.size);
  const lenRatio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
  return dice * (0.7 + 0.3 * lenRatio);
}

/** 0 (unrelated) → 1 (identical). */
export function similarity(a: string, b: string): number {
  return blend(a, b, words(a), words(b));
}

export interface DupMatch { snippet: Snippet; score: number; }

/**
 * Existing snippets that look like a re-save of `code`, best match first.
 * Tiny snippets are ignored so a one-liner never reads as a duplicate.
 */
export function findSimilar(
  code: string,
  all: Snippet[],
  opts: { excludeId?: string; threshold?: number; limit?: number } = {},
): DupMatch[] {
  const threshold = opts.threshold ?? 0.8;
  const target = norm(code);
  if (target.length < 40) return [];
  const targetWords = words(code);
  const targetFp = fingerprint(code);
  const out: DupMatch[] = [];
  for (const s of all) {
    if (opts.excludeId && s.id === opts.excludeId) continue;
    if (!s.code || norm(s.code).length < 40) continue;
    const score = fingerprint(s.code) === targetFp ? 1 : blend(code, s.code, targetWords, words(s.code));
    if (score >= threshold) out.push({ snippet: s, score });
  }
  return out.sort((a, b) => b.score - a.score || +new Date(b.snippet.updated_at) - +new Date(a.snippet.updated_at)).slice(0, opts.limit ?? 3);
}

export interface DupGroup { id: string; items: Snippet[]; }

/**
 * Clusters of snippets that look like duplicates of one another (transitively).
 * Comparisons are limited to the same language and to `max` items so a large
 * vault stays fast.
 */
export function findDuplicateGroups(all: Snippet[], threshold = 0.78, max = 500): DupGroup[] {
  const items = all.filter((s) => s.code && norm(s.code).length >= 40).slice(0, max);
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  items.forEach((s) => parent.set(s.id, s.id));

  const prepped = items.map((s) => ({ s, fp: fingerprint(s.code), words: words(s.code), norm: norm(s.code) }));
  for (let i = 0; i < prepped.length; i++) {
    for (let j = i + 1; j < prepped.length; j++) {
      const a = prepped[i], b = prepped[j];
      if (a.s.language !== b.s.language) continue;
      let score: number;
      if (a.fp === b.fp) score = 1;
      else {
        let inter = 0;
        for (const w of a.words) if (b.words.has(w)) inter++;
        const dice = (2 * inter) / (a.words.size + b.words.size);
        const lenRatio = Math.min(a.norm.length, b.norm.length) / Math.max(a.norm.length, b.norm.length);
        score = dice * (0.7 + 0.3 * lenRatio);
      }
      if (score >= threshold) union(a.s.id, b.s.id);
    }
  }

  const groups = new Map<string, Snippet[]>();
  for (const { s } of prepped) {
    const root = find(s.id);
    groups.set(root, [...(groups.get(root) ?? []), s]);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([id, items]) => ({ id, items }));
}
