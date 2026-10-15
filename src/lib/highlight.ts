/** Tiny dependency-free syntax highlighter. Returns one HTML string per line. */

interface Def {
  kw: string[];
  line?: string;      // regex source for line-comment prefixes
  block?: string;     // regex source for block comments
  ci?: boolean;       // case-insensitive keywords
  hyphen?: boolean;   // identifiers may contain '-'
  props?: boolean;    // word followed by ':' is a property
  keys?: boolean;     // string followed by ':' is a property (JSON)
  types?: boolean;    // Capitalised words are types
  tags?: boolean;     // highlight <tags>
}

const C_LINE = String.raw`\/\/`;
const C_BLOCK = String.raw`\/\*[\s\S]*?\*\/`;

const JS_KW = ["function", "return", "const", "let", "var", "async", "await", "if", "else", "new", "throw", "class", "import", "from", "export", "default", "try", "catch", "finally", "of", "in", "typeof", "this", "for", "while", "switch", "case", "break", "continue", "extends", "true", "false", "null", "undefined", "void", "as"];
const SYNTAX: Record<string, Def> = {
  JavaScript: { kw: JS_KW, line: C_LINE, block: C_BLOCK, types: true },
  TypeScript: { kw: [...JS_KW, "interface", "type", "enum", "implements", "readonly", "private", "public", "string", "number", "boolean", "any", "unknown", "never"], line: C_LINE, block: C_BLOCK, types: true },
  Python: { kw: ["import", "from", "def", "return", "if", "else", "elif", "for", "while", "in", "not", "and", "or", "class", "with", "as", "print", "True", "False", "None", "try", "except", "finally", "lambda", "yield", "pass", "raise", "async", "await"], line: "#", types: true },
  SQL: { kw: ["SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "ON", "GROUP", "BY", "ORDER", "DESC", "ASC", "LIMIT", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "AS", "SUM", "COUNT", "AVG", "MIN", "MAX", "NOW", "INTERVAL", "AND", "OR", "NOT", "NULL", "CREATE", "TABLE", "INDEX", "PRIMARY", "KEY", "WITH", "HAVING", "DISTINCT", "UNION", "IN", "LIKE", "BETWEEN"], line: "--", block: C_BLOCK, ci: true },
  Shell: { kw: ["cd", "ls", "git", "docker", "npm", "pnpm", "yarn", "sudo", "echo", "export", "if", "then", "fi", "else", "for", "do", "done", "while", "curl", "brew", "mkdir", "rm", "cp", "mv", "cat", "grep", "services", "image", "environment", "ports"], line: "#", hyphen: true },
  CSS: { kw: ["important", "var", "calc", "rgba", "rgb", "hsl", "url"], block: C_BLOCK, hyphen: true, props: true },
  HTML: { kw: ["DOCTYPE"], block: String.raw`<!--[\s\S]*?-->`, hyphen: true, tags: true },
  JSON: { kw: ["true", "false", "null"], keys: true },
  Go: { kw: ["package", "import", "func", "return", "var", "const", "type", "struct", "interface", "if", "else", "for", "range", "switch", "case", "go", "defer", "chan", "map", "nil", "true", "false"], line: C_LINE, block: C_BLOCK, types: true },
  Rust: { kw: ["fn", "let", "mut", "pub", "use", "mod", "struct", "enum", "impl", "trait", "match", "if", "else", "for", "while", "loop", "return", "self", "Self", "true", "false", "async", "await", "move"], line: C_LINE, block: C_BLOCK, types: true },
  Java: { kw: ["public", "private", "protected", "class", "interface", "static", "final", "void", "return", "if", "else", "for", "while", "new", "import", "package", "extends", "implements", "try", "catch", "throw", "true", "false", "null"], line: C_LINE, block: C_BLOCK, types: true },
  "C++": { kw: ["int", "char", "void", "return", "if", "else", "for", "while", "class", "struct", "include", "using", "namespace", "const", "auto", "new", "delete", "true", "false", "nullptr"], line: C_LINE, block: C_BLOCK, types: true },
  PHP: { kw: ["function", "return", "if", "else", "foreach", "as", "echo", "class", "public", "private", "new", "namespace", "use", "true", "false", "null"], line: String.raw`\/\/|#`, block: C_BLOCK },
  Markdown: { kw: [] },
  Other: { kw: [], line: String.raw`\/\/|#`, block: C_BLOCK },
};

SYNTAX.Terminal = SYNTAX.Shell;

const STR = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|` + "`(?:[^`\\\\]|\\\\.)*`";
const cache = new Map<string, { re: RegExp; def: Def; kw: Set<string> }>();

function tokenizer(lang: string) {
  let t = cache.get(lang);
  if (t) return t;
  const def = SYNTAX[lang] ?? SYNTAX.Other;
  const com = [def.block, def.line ? `(?:${def.line})[^\\n]*` : ""].filter(Boolean).join("|") || "(?!)";
  const word = def.hyphen ? String.raw`[A-Za-z_$][\w$-]*` : String.raw`[A-Za-z_$][\w$]*`;
  const tag = def.tags ? String.raw`<\/?[A-Za-z][\w:-]*|\/?>` : "(?!)";
  const re = new RegExp(`(${com})|(${STR})|(\\b\\d[\\d_]*(?:\\.\\d+)?\\b)|(${tag})|(${word})`, "g");
  t = { re, def, kw: new Set(def.ci ? def.kw.map((k) => k.toUpperCase()) : def.kw) };
  cache.set(lang, t);
  return t;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (cls: string, text: string) =>
  text.split("\n").map((p) => (p ? `<span class="t-${cls}">${esc(p)}</span>` : "")).join("\n");

export function highlightLines(code: string, lang: string): string[] {
  const { re, def, kw } = tokenizer(lang);
  re.lastIndex = 0;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const next = code.slice(re.lastIndex, re.lastIndex + 4);
    let cls: string | null = null;
    if (m[1]) cls = "com";
    else if (m[2]) cls = def.keys && /^\s*:/.test(next) ? "prop" : "str";
    else if (m[3]) cls = "num";
    else if (m[4]) cls = "tag";
    else if (m[5]) {
      const w = m[5];
      if (kw.has(def.ci ? w.toUpperCase() : w)) cls = "kw";
      else if (next[0] === "(") cls = "fn";
      else if (def.props && /^\s*:/.test(next)) cls = "prop";
      else if (def.types && /^[A-Z][a-z]/.test(w)) cls = "type";
    }
    out += cls ? span(cls, m[0]) : esc(m[0]);
    last = re.lastIndex;
  }
  out += esc(code.slice(last));
  return out.split("\n");
}
