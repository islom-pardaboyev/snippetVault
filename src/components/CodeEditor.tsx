import { useEffect, useRef } from "react";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, placeholder as cmPlaceholder, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";

async function languageExt(lang: string): Promise<Extension> {
  switch (lang) {
    case "JavaScript": return (await import("@codemirror/lang-javascript")).javascript();
    case "TypeScript": return (await import("@codemirror/lang-javascript")).javascript({ typescript: true });
    case "Python": return (await import("@codemirror/lang-python")).python();
    case "SQL": return (await import("@codemirror/lang-sql")).sql();
    case "CSS": return (await import("@codemirror/lang-css")).css();
    case "HTML": return (await import("@codemirror/lang-html")).html();
    case "JSON": return (await import("@codemirror/lang-json")).json();
    case "Markdown": return (await import("@codemirror/lang-markdown")).markdown();
    case "Go": return (await import("@codemirror/lang-go")).go();
    case "Rust": return (await import("@codemirror/lang-rust")).rust();
    case "Java": return (await import("@codemirror/lang-java")).java();
    case "C++": return (await import("@codemirror/lang-cpp")).cpp();
    case "PHP": return (await import("@codemirror/lang-php")).php();
    case "Shell":
    case "Terminal": return StreamLanguage.define((await import("@codemirror/legacy-modes/mode/shell")).shell);
    default: return [];
  }
}

/* colours come from the same CSS variables as the read-only highlighter */
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier, t.definitionKeyword], color: "var(--t-kw)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--t-str)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--t-num)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: "var(--t-fn)" },
  { tag: [t.propertyName, t.attributeName], color: "var(--t-prop)" },
  { tag: [t.tagName, t.angleBracket], color: "var(--t-tag)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--t-type)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--t-com)", fontStyle: "italic" },
  { tag: t.invalid, color: "#ff6b6b" },
]);

const theme = EditorView.theme({
  "&": { maxWidth: "100%", backgroundColor: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: "10px", fontSize: "13.5px" },
  "&.cm-focused": { outline: "none", borderColor: "var(--accent)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.7", minHeight: "340px", maxHeight: "70vh", overflow: "auto" },
  ".cm-content": { caretColor: "var(--accent)", padding: "10px 0" },
  ".cm-line": { padding: "0 14px" },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--faint)", border: "none", paddingLeft: "6px" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 6%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--muted)" },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": { backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent) !important" },
  ".cm-matchingBracket": { backgroundColor: "color-mix(in srgb, var(--accent) 30%, transparent)", outline: "none" },
  ".cm-placeholder": { color: "var(--faint)" },
});

interface Props {
  value: string;
  onChange(v: string): void;
  language: string;
  placeholder?: string;
  onSubmit?(): void;
}

/** CodeMirror 6 editor: indent, bracket matching/closing, undo history, per-language syntax. */
export default function CodeEditor({ value, onChange, language, placeholder, onSubmit }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const lang = useRef(new Compartment());
  const cbs = useRef({ onChange, onSubmit });
  cbs.current = { onChange, onSubmit };

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          keymap.of([
            { key: "Mod-Shift-Enter", run: () => { window.dispatchEvent(new Event("sv:run")); return true; } },
            { key: "Mod-Enter", run: () => { cbs.current.onSubmit?.(); return true; } },
          ]),
          lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(),
          history(), indentOnInput(), bracketMatching(), closeBrackets(),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          syntaxHighlighting(highlight), theme,
          placeholder ? cmPlaceholder(placeholder) : [],
          lang.current.of([]),
          EditorView.contentAttributes.of({ "aria-label": "Code", spellcheck: "false", autocapitalize: "off", autocorrect: "off" }),
          EditorView.updateListener.of((u) => { if (u.docChanged) cbs.current.onChange(u.state.doc.toString()); }),
        ],
      }),
    });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    languageExt(language).then((ext) => {
      if (!cancelled) view.current?.dispatch({ effects: lang.current.reconfigure(ext) });
    });
    return () => { cancelled = true; };
  }, [language]);

  // external changes (e.g. form hydrated after the snippet arrived)
  useEffect(() => {
    const v = view.current;
    if (v && value !== v.state.doc.toString()) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className="min-w-0 max-w-full" />;
}
