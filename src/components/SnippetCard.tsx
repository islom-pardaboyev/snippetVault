import { useNavigate } from "react-router-dom";
import type { Snippet } from "../lib/types";
import { timeAgo } from "../lib/utils";
import { useCopySnippet } from "../hooks/useCopy";
import { LangIcon } from "./LangIcon";
import { highlightLines } from "../lib/highlight";
import { Icon } from "./Icon";
import { useSnippets } from "../hooks/snippets";

export function StarButton({ s }: { s: Snippet }) {
  const { save } = useSnippets();
  return (
    <button
      aria-label={s.favorite ? "Remove from favourites" : "Add to favourites"} aria-pressed={s.favorite}
      onClick={(e) => { e.stopPropagation(); save({ ...s, favorite: !s.favorite }); }}
      className={`p-1 rounded-lg transition hover:scale-110 ${s.favorite ? "text-[#ffc83d]" : "text-faint hover:text-ink"}`}
    >
      <Icon name="star" fill={s.favorite} />
    </button>
  );
}

export function SnippetCard({ s, index = 0, list = false }: { s: Snippet; index?: number; list?: boolean }) {
  const nav = useNavigate();
  const copy = useCopySnippet();
  const preview = highlightLines(s.code.split("\n").slice(0, 6).join("\n"), s.language);
  const open = () => nav(`/s/${s.id}`);

  return (
    <article
      role="link" tabIndex={0} onClick={open} draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/x-snippet-id", s.id); e.dataTransfer.effectAllowed = "move"; }}
      onKeyDown={(e) => { if (e.key === "Enter") open(); }}
      style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
      className={`group anim-rise relative cursor-pointer rounded-card border border-line bg-surface p-4 transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_18px_40px_-22px_rgba(0,0,0,.6)] ${list ? "flex items-center gap-4 py-3" : "flex flex-col gap-3"}`}
    >
      <div className={list ? "min-w-0 flex-1" : "contents"}>
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
          <LangIcon lang={s.language} size={17} />
          {s.language}
          {!list && <span className="ml-auto"><StarButton s={s} /></span>}
        </div>
        <h3 className="text-[16.5px] font-bold tracking-tight leading-snug">{s.title}</h3>
        {!list && s.description && <p className="-mt-1 text-[13.5px] text-muted line-clamp-2">{s.description}</p>}
        {!list && (
          <pre className="relative max-h-[118px] overflow-hidden rounded-[11px] border border-line bg-bg px-3 py-2.5 font-mono text-[12px] leading-[1.65] after:absolute after:inset-x-0 after:bottom-0 after:h-9 after:bg-gradient-to-b after:from-transparent after:to-bg after:content-['']">
            <code dangerouslySetInnerHTML={{ __html: preview.join("\n") }} />
          </pre>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-faint">
          {s.tags.slice(0, 3).map((t) => <span key={t} className="text-[12.5px] text-muted">#{t}</span>)}
          <span>{timeAgo(s.updated_at)}</span>
          {!list && (
            <button
              onClick={(e) => { e.stopPropagation(); copy(s); }}
              className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 text-[12.5px] font-semibold text-ink opacity-0 translate-y-1 transition group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:translate-y-0"
            >
              <Icon name="copy" size={14} /> Copy
            </button>
          )}
        </div>
      </div>
      {list && <><StarButton s={s} /><Icon name="back" className="rotate-180 text-faint" /></>}
    </article>
  );
}
