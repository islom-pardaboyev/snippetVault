import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSnippets } from "../hooks/snippets";
import { Icon } from "../components/Icon";
import { LangIcon } from "../components/LangIcon";
import { langColor, lineCount, timeAgo } from "../lib/utils";
import { findDuplicateGroups } from "../lib/similar";

export function Insights() {
  const { snippets } = useSnippets();
  const nav = useNavigate();

  const d = useMemo(() => {
    const langs: Record<string, number> = {}, tags: Record<string, number> = {};
    let lines = 0;
    snippets.forEach((s) => {
      langs[s.language] = (langs[s.language] ?? 0) + 1;
      s.tags.forEach((t) => (tags[t] = (tags[t] ?? 0) + 1));
      lines += lineCount(s.code);
    });
    const langList = Object.entries(langs).sort((a, b) => b[1] - a[1]);
    const tagList = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 18);
    const recent = [...snippets].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)).slice(0, 6);
    return { langList, tagList, lines, recent, favs: snippets.filter((s) => s.favorite).length };
  }, [snippets]);

  const dupes = useMemo(() => findDuplicateGroups(snippets), [snippets]);

  if (!snippets.length) {
    return (
      <div className="anim-rise mx-auto max-w-[1240px] rounded-3xl border border-dashed border-line-strong bg-surface px-5 py-[70px] text-center">
        <div className="mx-auto mb-[18px] grid size-[54px] place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="chart" size={26} /></div>
        <h2 className="mb-1.5 text-[22px] font-bold tracking-tight">Insights appear as you save</h2>
        <p className="mx-auto mb-5 max-w-[42ch] text-muted">Add a few snippets and you'll see your languages, tags and activity here.</p>
        <button className="btn btn-primary btn-lg" onClick={() => nav("/new")}><Icon name="plus" /> New snippet</button>
      </div>
    );
  }

  const max = d.langList[0][1];
  const tile = "rounded-card border border-line bg-surface p-5";
  return (
    <div className="anim-rise mx-auto max-w-[1240px]">
      <h1 className="mb-6 text-[clamp(26px,3.2vw,36px)] font-bold tracking-[-0.04em]">Insights</h1>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <div className="rounded-card border border-accent bg-accent p-5 text-accent-ink">
          <b className="block text-[40px] font-bold leading-none tracking-[-0.05em] tabular-nums">{snippets.length}</b>
          <span className="text-[13.5px] opacity-75">snippets saved</span>
        </div>
        {[[d.favs, "favourites"], [d.langList.length, "languages"], [d.lines, "lines of code"]].map(([n, l]) => (
          <div key={l} className={tile}>
            <b className="block text-[40px] font-bold leading-none tracking-[-0.05em] tabular-nums">{n}</b>
            <span className="text-[13.5px] text-muted">{l}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className={tile}>
          <h2 className="mb-4 text-[15px] font-bold">Languages</h2>
          {d.langList.map(([l, n]) => (
            <Link key={l} to={`/lang/${encodeURIComponent(l)}`} className="mb-3 grid grid-cols-[110px_1fr_30px] items-center gap-3 text-[13.5px] sm:grid-cols-[130px_1fr_34px]">
              <span className="flex items-center gap-2 truncate"><LangIcon lang={l} size={16} />{l}</span>
              <span className="h-2.5 overflow-hidden rounded-md bg-surface-3">
                <i className="block h-full w-0 rounded-md [animation:grow_.8s_var(--ease-out-expo)_forwards]" style={{ ["--w" as string]: `${(n / max) * 100}%`, background: langColor(l) }} />
              </span>
              <span className="text-right font-mono text-xs text-muted">{n}</span>
            </Link>
          ))}
        </section>
        <div className="grid gap-4 content-start">
          <section className={tile}>
            <h2 className="mb-4 text-[15px] font-bold">Top tags</h2>
            {d.tagList.length === 0 ? <p className="text-sm text-muted">No tags yet.</p> : (
              <div className="flex flex-wrap gap-2">
                {d.tagList.map(([t, n]) => (
                  <Link key={t} to={`/tag/${encodeURIComponent(t)}`} className="chip">#{t} <span className="font-mono text-faint">{n}</span></Link>
                ))}
              </div>
            )}
          </section>
          <section className={tile}>
            <h2 className="mb-2 text-[15px] font-bold">Recently touched</h2>
            {d.recent.map((s) => (
              <Link key={s.id} to={`/s/${s.id}`} className="flex items-center gap-2.5 rounded-[9px] px-2 py-2 hover:bg-surface-2">
                <LangIcon lang={s.language} size={16} />
                <span className="flex-1 truncate font-medium">{s.title}</span>
                <span className="text-xs text-faint">{timeAgo(s.updated_at)}</span>
              </Link>
            ))}
          </section>
        </div>
      </div>

      {dupes.length > 0 && (
        <section className={`${tile} mt-4`}>
          <div className="mb-1.5 flex items-center gap-2">
            <Icon name="copy" size={16} className="text-[var(--t-kw)]" />
            <h2 className="text-[15px] font-bold">Possible duplicates</h2>
            <span className="font-mono text-xs text-faint">{dupes.length}</span>
          </div>
          <p className="mb-4 text-[13px] text-muted">
            These look like the same code saved more than once. Open one and delete the extras if you like.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {dupes.slice(0, 6).map((g) => (
              <div key={g.id} className="rounded-xl border border-line bg-surface-2 p-1.5">
                {g.items.map((s) => (
                  <Link key={s.id} to={`/s/${s.id}`} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-3">
                    <LangIcon lang={s.language} size={16} />
                    <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                    <span className="shrink-0 text-xs text-faint">{timeAgo(s.updated_at)}</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
