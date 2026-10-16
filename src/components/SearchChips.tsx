import { Icon, type IconName } from "./Icon";
import { LangIcon } from "./LangIcon";
import { activeFilters, toggleToken } from "../lib/search";

interface Props {
  /** Raw query string (may contain `lang:`, `tag:`, `is:`… operators). */
  raw: string;
  languages: string[];
  onChange(next: string): void;
  recent: string[];
  onClearRecent(): void;
}

/** Filter chips under the library toolbar: active operators, quick filters and recent searches. */
export function SearchChips({ raw, languages, onChange, recent, onClearRecent }: Props) {
  const active = activeFilters(raw);
  const activeTokens = new Set(active.map((f) => f.token.toLowerCase()));

  const quickAll: Array<{ token: string; label: string; icon?: IconName; lang?: string }> = [
    { token: "is:starred", label: "Starred", icon: "star" },
    { token: "is:shared", label: "Shared", icon: "link" },
    { token: "has:notes", label: "Has notes", icon: "edit" },
    ...languages.slice(0, 8).map((l) => ({ token: `lang:${l}`, label: l, lang: l })),
  ];
  const quick = quickAll.filter((q) => !activeTokens.has(q.token.toLowerCase()));

  const showRecent = !raw.trim() && recent.length > 0;
  const hasQuery = raw.trim().length > 0;
  if (!hasQuery && !showRecent) return null;

  return (
    <div className="-mx-1 mb-4 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {showRecent ? (
        <>
          <span className="inline-flex shrink-0 items-center gap-1.5 pl-1 text-[12px] font-semibold text-faint">
            <Icon name="clock" size={14} /> Recent
          </span>
          {recent.map((r) => (
            <button key={r} className="chip" onClick={() => onChange(r)} title={r}>
              <Icon name="search" size={13} />{r}
            </button>
          ))}
          <button className="chip !text-faint" onClick={onClearRecent} title="Clear recent searches">
            <Icon name="x" size={13} /> Clear
          </button>
        </>
      ) : (
        <>
          {active.map((f) => (
            <button key={f.token} className="chip chip-on" onClick={() => onChange(toggleToken(raw, f.token))}
              title={`Remove filter: ${f.token}`}>
              <Icon name="x" size={13} />{f.label}
            </button>
          ))}
          {active.length > 0 && quick.length > 0 && <span className="mx-0.5 h-5 w-px shrink-0 bg-line" aria-hidden />}
          {quick.map((q) => (
            <button key={q.token} className="chip" onClick={() => onChange(toggleToken(raw, q.token))} title={`Add filter: ${q.token}`}>
              {q.lang ? <LangIcon lang={q.lang} size={13} /> : q.icon ? <Icon name={q.icon} size={13} /> : null}
              {q.label}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
