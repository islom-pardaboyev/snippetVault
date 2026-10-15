import { describe, expect, it } from "vitest";
import { detectLanguage, diffStats, fillTemplate, lineCount, parseImport, parseTags, templateVars } from "../utils";
import { inkFor, isHex } from "../color";

describe("parseTags", () => {
  it("lowercases, strips # and de-duplicates", () => {
    expect(parseTags("#React, hooks,react , ,API")).toEqual(["react", "hooks", "api"]);
  });
});

describe("lineCount", () => {
  it("counts lines and treats empty as 0", () => {
    expect(lineCount("")).toBe(0);
    expect(lineCount("a\nb\nc")).toBe(3);
  });
});

describe("detectLanguage", () => {
  it("recognises common languages", () => {
    expect(detectLanguage('{"a": 1, "b": 2}')).toBe("JSON");
    expect(detectLanguage("SELECT * FROM users WHERE id = 1")).toBe("SQL");
    expect(detectLanguage("def hello(name):\n    return name")).toBe("Python");
    expect(detectLanguage("git reset --soft HEAD~1")).toBe("Shell");
  });
  it("returns null for short input", () => {
    expect(detectLanguage("x")).toBeNull();
  });
});

describe("templates", () => {
  it("finds unique variables and fills only the known ones", () => {
    const code = "Hello {{name}}, welcome to {{place}}. Bye {{name}}.";
    expect(templateVars(code).sort()).toEqual(["name", "place"]);
    expect(fillTemplate(code, { name: "Ada" })).toBe("Hello Ada, welcome to {{place}}. Bye Ada.");
  });
});

describe("diffStats", () => {
  it("counts added and removed lines", () => {
    expect(diffStats("a\nb\nc", "a\nc\nd")).toEqual({ added: 1, removed: 1 });
  });
});

describe("parseImport", () => {
  it("accepts a bare array or { snippets } and drops invalid rows", () => {
    const rows = [{ title: "A", code: "x" }, { title: 1, code: "y" }, null];
    expect(parseImport(JSON.stringify(rows))).toHaveLength(1);
    expect(parseImport(JSON.stringify({ snippets: rows }))).toHaveLength(1);
  });
  it("applies safe defaults and rejects unsafe ids", () => {
    const [s] = parseImport(JSON.stringify([{ id: "../evil", title: "T", code: "c" }]));
    expect(s.id).not.toBe("../evil");
    expect(s.language).toBe("Other");
    expect(s.favorite).toBe(false);
    expect(s.tags).toEqual([]);
  });
});

describe("colour helpers", () => {
  it("validates hex", () => {
    expect(isHex("#c8f542")).toBe(true);
    expect(isHex("c8f542")).toBe(false);
  });
  it("picks dark ink on light accents and white on dark", () => {
    expect(inkFor("#c8f542")).toBe("#0b0c0e");
    expect(inkFor("#101820")).toBe("#ffffff");
  });
});
