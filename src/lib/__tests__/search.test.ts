import { describe, expect, it } from "vitest";
import { activeFilters, fuzzyIncludes, matchesQuery, parseQuery, toggleToken } from "../search";
import type { Snippet } from "../types";

const snip = (patch: Partial<Snippet> = {}): Snippet => ({
  id: "s1",
  title: "Debounce function",
  language: "TypeScript",
  favorite: false,
  tags: ["utils"],
  description: "Delay a call",
  code: "export function debounce(fn){ return fn; }",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...patch,
});

describe("parseQuery", () => {
  it("splits free terms from operators", () => {
    const p = parseQuery('lang:ts tag:utils is:starred debounce "exact words"');
    expect(p.lang).toBe("ts");
    expect(p.tag).toBe("utils");
    expect(p.starred).toBe(true);
    expect(p.terms).toEqual(["debounce", "exact words"]);
  });

  it("ignores unknown operators as text", () => {
    const p = parseQuery("colour:red");
    expect(p.terms).toEqual(["colour:red"]);
  });

  it("parses before/after dates", () => {
    const p = parseQuery("after:2026-01-01 before:2026-02-01");
    expect(p.after).toBe(Date.parse("2026-01-01"));
    expect(p.before).toBe(Date.parse("2026-02-01"));
  });
});

describe("fuzzyIncludes", () => {
  it("matches substrings, subsequences and one typo", () => {
    expect(fuzzyIncludes("debounce function", "deboun")).toBe(true);
    expect(fuzzyIncludes("debounce function", "dbnc")).toBe(true);   // subsequence
    expect(fuzzyIncludes("debounce function", "debounce")).toBe(true);
    expect(fuzzyIncludes("function", "functoin")).toBe(true);        // transposition
    expect(fuzzyIncludes("function", "zzzz")).toBe(false);
  });
});

describe("scoreSnippet / matchesQuery", () => {
  it("matches a language alias", () => {
    expect(matchesQuery(snip(), parseQuery("lang:ts"))).toBe(true);
    expect(matchesQuery(snip(), parseQuery("lang:python"))).toBe(false);
  });

  it("filters by tag, favourite, notes and share", () => {
    expect(matchesQuery(snip(), parseQuery("tag:utils"))).toBe(true);
    expect(matchesQuery(snip(), parseQuery("is:starred"))).toBe(false);
    expect(matchesQuery(snip({ favorite: true }), parseQuery("is:starred"))).toBe(true);
    expect(matchesQuery(snip({ notes: "private" }), parseQuery("has:notes"))).toBe(true);
    expect(matchesQuery(snip({ share_token: "abc" }), parseQuery("is:shared"))).toBe(true);
  });

  it("matches free text against the code", () => {
    expect(matchesQuery(snip(), parseQuery("debounce"))).toBe(true);
    expect(matchesQuery(snip(), parseQuery("kangaroo"))).toBe(false);
  });

  it("respects before/after windows", () => {
    expect(matchesQuery(snip(), parseQuery("after:2025-12-01"))).toBe(true);
    expect(matchesQuery(snip(), parseQuery("before:2025-12-01"))).toBe(false);
  });

  it("ranks title matches above body matches", () => {
    const title = matchesQuery(snip(), parseQuery("debounce"));
    const body = matchesQuery(snip({ title: "Other", code: "const debounce = 1;" }), parseQuery("debounce"));
    expect(title && body).toBe(true);
  });
});

describe("filter chips", () => {
  it("labels operators for display", () => {
    expect(activeFilters("lang:python tag:api is:starred").map((f) => f.label)).toEqual(["python", "#api", "Starred"]);
  });

  it("toggles a token on and off", () => {
    expect(toggleToken("debounce", "is:starred")).toBe("debounce is:starred");
    expect(toggleToken("debounce is:starred", "is:starred")).toBe("debounce");
  });
});
