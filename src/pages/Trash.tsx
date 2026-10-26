import { useNavigate } from "react-router-dom";
import { useSnippets } from "../hooks/snippets";
import { useToast } from "../hooks/ui";
import { useModal } from "../components/Modal";
import { Icon } from "../components/Icon";
import { LangIcon } from "../components/LangIcon";
import { TRASH_DAYS, daysLeft } from "../lib/trash";
import { timeAgo } from "../lib/utils";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function Trash() {
  const { trashed, loaded, restore, purge, emptyTrash } = useSnippets();
  const toast = useToast();
  const nav = useNavigate();
  const { confirm } = useModal();

  const restoreOne = (id: string, title: string) => {
    restore(id);
    toast(`“${title}” restored`, { action: { label: "Open", run: () => nav(`/s/${id}`) } });
  };

  const deleteForever = async (id: string, title: string) => {
    const ok = await confirm({
      title: "Delete forever?",
      description: `“${title}” and its images and history will be removed permanently. This can't be undone.`,
      confirmLabel: "Delete forever",
      danger: true,
    });
    if (!ok) return;
    purge(id);
    toast("Deleted forever");
  };

  const empty = async () => {
    const ok = await confirm({
      title: "Empty the Trash?",
      description: `${plural(trashed.length, "snippet")} will be removed permanently. This can't be undone.`,
      confirmLabel: "Empty Trash",
      danger: true,
    });
    if (!ok) return;
    emptyTrash();
    toast("Trash emptied");
  };

  const restoreAll = () => {
    const ids = trashed.map((s) => s.id);
    restore(ids);
    toast(`${plural(ids.length, "snippet")} restored`);
  };

  return (
    <div className="anim-rise mx-auto max-w-[900px]">
      <div className="mb-6 flex flex-wrap items-end gap-3.5">
        <div>
          <h1 className="text-[clamp(26px,3.2vw,36px)] font-semibold leading-[1.1] tracking-[-0.03em]">Trash</h1>
          <p className="mt-1 text-sm text-muted">
            Deleted snippets stay here for {TRASH_DAYS} days, then they are removed for good.
          </p>
        </div>
        {trashed.length > 0 && (
          <div className="flex w-full gap-2 md:ml-auto md:w-auto">
            {trashed.length > 1 && (
              <button className="btn flex-1 md:flex-none" onClick={restoreAll}><Icon name="undo" size={16} /> Restore all</button>
            )}
            <button className="btn btn-danger flex-1 md:flex-none" onClick={empty}><Icon name="trash" size={16} /> Empty Trash</button>
          </div>
        )}
      </div>

      {!loaded ? (
        <div className="grid gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-[76px] rounded-card border border-line" />)}
        </div>
      ) : trashed.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong bg-surface px-5 py-[70px] text-center">
          <div className="mx-auto mb-[18px] grid size-[54px] place-items-center rounded-2xl bg-accent/15 text-accent">
            <Icon name="trash" size={26} />
          </div>
          <h2 className="mb-1.5 text-[22px] font-semibold tracking-tight">Trash is empty</h2>
          <p className="mx-auto max-w-[42ch] text-muted">
            When you delete a snippet it waits here for {TRASH_DAYS} days, so you can restore it if you change your mind.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2.5">
          {trashed.map((s) => {
            const left = daysLeft(s.deleted_at ?? "");
            return (
              <li key={s.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <LangIcon lang={s.language} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{s.title || "Untitled"}</div>
                    <div className="truncate text-[13px] text-muted">
                      Deleted {timeAgo(s.deleted_at ?? "")} ·{" "}
                      <span className={left <= 3 ? "text-danger" : undefined}>
                        {left === 0 ? "removed today" : `${plural(left, "day")} left`}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn flex-1 sm:flex-none" onClick={() => restoreOne(s.id, s.title)}>
                    <Icon name="undo" size={16} /> Restore
                  </button>
                  <button className="btn btn-danger btn-icon" aria-label={`Delete “${s.title}” forever`}
                    onClick={() => void deleteForever(s.id, s.title)}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
