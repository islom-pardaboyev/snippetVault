import { describe, expect, it } from "vitest";
import { findDuplicateGroups, findSimilar, fingerprint, similarity } from "../similar";
import type { Snippet } from "../types";

const snip = (id: string, code: string, patch: Partial<Snippet> = {}): Snippet => ({
  id,
  title: id,
  language: "TypeScript",
  favorite: false,
  tags: [],
  description: "",
  code,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...patch,
});

const BASE = "export function debounce(fn, wait) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; }";
const REFORMATTED = "export function debounce(fn, wait) {\n  let t;\n  return (...a) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...a), wait);\n  };\n}";
const EDITED = BASE + "\n// note";
const RENAMED = "export function debounce(callback, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay); }; }";

describe("fingerprint", () => {
  it("ignores whitespace and case", () => {
    expect(fingerprint("A  b\nc")).toBe(fingerprint("a b c"));
  });
  it("treats reformatting as identical", () => {
    expect(fingerprint(BASE)).toBe(fingerprint(REFORMATTED));
  });
});

describe("similarity", () => {
  it("scores identical code as 1", () => {
    expect(similarity(BASE, BASE)).toBe(1);
  });
  it("scores a lightly-edited copy highly", () => {
    expect(similarity(BASE, EDITED)).toBeGreaterThan(0.8);
  });
  it("still gives a renamed copy a moderate score", () => {
    expect(similarity(BASE, RENAMED)).toBeGreaterThan(0.4);
  });
  it("scores unrelated code low", () => {
    expect(similarity(BASE, "SELECT id, name FROM users WHERE active = true ORDER BY name")).toBeLessThan(0.2);
  });
});

describe("findSimilar", () => {
  it("finds a lightly-edited duplicate and skips the given id", () => {
    const all = [snip("a", BASE), snip("b", "const unrelated = 1;")];
    const hits = findSimilar(EDITED, all, { excludeId: "b" });
    expect(hits[0]?.snippet.id).toBe("a");
    expect(hits[0]?.score).toBeGreaterThan(0.8);
  });
  it("ignores tiny snippets", () => {
    expect(findSimilar("const x = 1;", [snip("a", "const x = 1;")])).toEqual([]);
  });
});

describe("findDuplicateGroups", () => {
  it("clusters duplicates within a language", () => {
    const all = [
      snip("a", BASE),
      snip("b", REFORMATTED),
      snip("c", "SELECT 1"),
      snip("d", "SELECT 2", { language: "SQL" }),
    ];
    const groups = findDuplicateGroups(all);
    const ids = groups.flatMap((g) => g.items.map((s) => s.id)).sort();
    expect(ids).toEqual(["a", "b"]);
  });
});
