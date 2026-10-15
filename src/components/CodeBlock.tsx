import { useMemo, type ReactNode } from "react";
import { highlightLines } from "../lib/highlight";

export function CodeLines({ code, lang, wrap = false, max }: { code: string; lang: string; wrap?: boolean; max?: number }) {
  const lines = useMemo(() => {
    const l = highlightLines(code || " ", lang);
    return max ? l.slice(0, max) : l;
  }, [code, lang, max]);
  return (
    <div className={`py-3 overflow-x-auto font-mono text-[13.5px] leading-[1.7] ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`} style={{ tabSize: 2 }}>
      {lines.map((html, i) => (
        <div key={i} className="flex hover:bg-accent/[0.06]">
          <span className="w-[52px] shrink-0 text-right pr-4 text-[12px] text-faint select-none">{i + 1}</span>
          <span className="flex-1 pr-[18px]" dangerouslySetInnerHTML={{ __html: html || " " }} />
        </div>
      ))}
    </div>
  );
}

export function CodeBlock({ code, lang, wrap, title, actions, bare }: { code: string; lang: string; wrap?: boolean; title?: string; actions?: ReactNode; bare?: boolean }) {
  return (
    <div className={`min-w-0 bg-bg ${bare ? "" : "overflow-hidden rounded-card border border-line-strong shadow-[0_18px_40px_-22px_rgba(0,0,0,.6)]"}`}>
      <div className={`flex items-center gap-2 px-3 py-2 bg-surface border-b border-line text-[12.5px] font-semibold text-muted ${bare ? "sticky top-0 z-10" : ""}`}>
        <span className="inline-flex gap-1.5 mr-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-surface-3" /><i className="size-2.5 rounded-full bg-surface-3" /><i className="size-2.5 rounded-full bg-surface-3" />
        </span>
        <span>{title ?? lang}</span>
        <span className="ml-auto flex items-center gap-1.5">{actions}</span>
      </div>
      <CodeLines code={code} lang={lang} wrap={wrap} />
    </div>
  );
}
