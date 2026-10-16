import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getShare, bumpShareViews, expiryLabel, type ShareBundle, type SharedSnippet } from "../lib/share";
import { CodeBlock } from "../components/CodeBlock";
import { ImageGallery } from "../components/ImageGallery";
import { LangIcon } from "../components/LangIcon";
import { LogoMark } from "../components/Logo";
import { Icon } from "../components/Icon";
import { CopyMenu } from "../components/CopyMenu";
import { NoteView } from "../components/RichNote";
import { hasNoteText, noteImageIds } from "../lib/note";
import { isPage, timeAgo } from "../lib/utils";

/**
 * Public, read-only view of a shared snippet or group: /share/:token
 *
 * Rendered outside the auth gate and without the app shell — anyone with the
 * link can read it. Shows the code, images, description and notes.
 */
export function Shared() {
  const { token = "" } = useParams();
  const [bundle, setBundle] = useState<ShareBundle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const bumped = useRef(false);

  useEffect(() => {
    let alive = true;
    setState("loading");
    bumped.current = false;
    getShare(token)
      .then((b) => {
        if (!alive) return;
        if (!b) { setState("missing"); return; }
        setBundle(b);
        setState("ready");
        if (!bumped.current) { bumped.current = true; void bumpShareViews(token); }
      })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    document.title = bundle ? `${bundle.meta.title} · SnippetVault` : "SnippetVault";
  }, [bundle]);

  const meta = bundle?.meta;

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[900px] items-center gap-3 px-4 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="text-[15.5px] font-bold tracking-tight">SnippetVault</span>
          </Link>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-semibold text-muted">
            <Icon name="eye" size={14} className="text-faint" /> Read-only
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-4 pb-24 pt-8">
        {state === "loading" && (
          <>
            <div className="skeleton h-9 w-2/3 rounded-lg" />
            <div className="skeleton mt-3 h-4 w-1/3 rounded" />
            <div className="skeleton mt-8 h-64 rounded-card" />
          </>
        )}

        {state === "missing" && (
          <div className="anim-rise mx-auto mt-16 max-w-[46ch] text-center">
            <div className="mx-auto mb-5 grid size-[54px] place-items-center rounded-2xl bg-surface text-muted"><Icon name="link" size={26} /></div>
            <h1 className="text-[22px] font-bold tracking-tight">This link isn’t available</h1>
            <p className="mt-2 text-muted">It may have been revoked, expired, or typed incorrectly.</p>
            <Link to="/" className="btn btn-primary mt-6 inline-flex">Go to SnippetVault</Link>
          </div>
        )}

        {state === "error" && (
          <div className="anim-rise mx-auto mt-16 max-w-[46ch] text-center">
            <div className="mx-auto mb-5 grid size-[54px] place-items-center rounded-2xl bg-surface text-muted"><Icon name="wifioff" size={26} /></div>
            <h1 className="text-[22px] font-bold tracking-tight">Couldn’t load this page</h1>
            <p className="mt-2 text-muted">Check your connection and reload.</p>
            <button className="btn btn-primary mt-6" onClick={() => location.reload()}>Reload</button>
          </div>
        )}

        {state === "ready" && meta && bundle && (
          <div className="anim-rise">
            <div className="mb-7">
              <span className="text-[12.5px] font-bold uppercase tracking-[.12em] text-faint">
                Shared {meta.kind === "group" ? "group" : "snippet"}
              </span>
              <h1 className="mt-1.5 text-[clamp(26px,3.4vw,38px)] font-bold leading-[1.1] tracking-[-0.04em]">{meta.title}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-muted">
                <span>Shared by <b className="font-semibold text-ink">{meta.owner_name}</b></span>
                <span className="text-faint">·</span>
                <span>{timeAgo(meta.created_at)}</span>
                <span className="text-faint">·</span>
                <span>{bundle.snippets.length} snippet{bundle.snippets.length === 1 ? "" : "s"}</span>
                {meta.expires_at && (
                  <>
                    <span className="text-faint">·</span>
                    <span className="inline-flex items-center gap-1"><Icon name="clock" size={14} className="text-faint" /> {expiryLabel(meta.expires_at)}</span>
                  </>
                )}
              </p>
            </div>

            <div className="space-y-10">
              {bundle.snippets.map((s, i) => <SharedItem key={s.id} s={s} index={i} showIndex={meta.kind === "group"} />)}
            </div>

            <div className="mt-14 border-t border-line pt-6 text-center text-[13px] text-faint">
              Shared with <Link to="/" className="font-semibold text-muted hover:text-ink">SnippetVault</Link> · read-only copy
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SharedItem({ s, index, showIndex }: { s: SharedSnippet; index: number; showIndex: boolean }) {
  const images = s.images.map((im) => ({ id: im.id, data: im.data, w: im.w, h: im.h }));
  const page = isPage(s.language);
  // For a page the images live inline in its text, so the gallery only shows the leftovers.
  const used = new Set(noteImageIds(s.notes));
  const gallery = page ? images.filter((im) => !used.has(im.id)) : images;

  return (
    <article className="anim-rise" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {showIndex && <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-[12.5px] font-bold text-muted tabular-nums">{index + 1}</span>}
        <h2 className="min-w-0 flex-1 break-words text-[20px] font-bold tracking-tight">{s.title || "Untitled"}</h2>
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12.5px] font-semibold">
          <LangIcon lang={s.language} size={16} />{s.language}
        </span>
        <CopyMenu snippet={s} />
      </div>

      {s.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[13px] text-muted">
          {s.tags.map((t) => <span key={t}>#{t}</span>)}
        </div>
      )}

      {s.description && <p className="mt-3 max-w-[70ch] break-words text-[15px] text-muted">{s.description}</p>}

      {page ? (
        hasNoteText(s.notes) && (
          <div className="mt-5 rounded-card border border-line bg-surface px-5 py-6 sm:px-7 sm:py-7">
            <NoteView html={s.notes} images={images} className="note-page" />
          </div>
        )
      ) : (
        <>
          {hasNoteText(s.notes) && (
            <div className="mt-4 rounded-card border border-line bg-surface px-4 py-3.5">
              <span className="mb-1 block text-[12px] font-bold uppercase tracking-[.1em] text-faint">Notes</span>
              <NoteView html={s.notes} images={images} />
            </div>
          )}

          <div className="mt-4">
            <CodeBlock code={s.code} lang={s.language} title={s.language} />
          </div>
        </>
      )}

      {gallery.length > 0 && (
        <div className="mt-4">
          <ImageGallery images={gallery} hint={`${gallery.length} image${gallery.length === 1 ? "" : "s"}`} />
        </div>
      )}
    </article>
  );
}
