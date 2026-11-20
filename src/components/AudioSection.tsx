import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { AudioPlayer } from "./AudioPlayer";
import { useModal } from "./Modal";
import { useToast } from "../hooks/ui";
import { useVault, type AudioEntry } from "../hooks/vault";
import { hasImgbb } from "../lib/imgbb";
import { AUDIO_TYPES } from "../lib/vault-audio";

interface Props {
  /** The vault item the audio belongs to, or `null` for the standalone section. */
  itemId: string | null;
  title: string;
  hint?: string;
}

/** Encrypted audio for one vault item, or the standalone "Voice & music" list. */
export function AudioSection({ itemId, title, hint }: Props) {
  const { status, audioGallery, entries, addAudio, removeAudio, loadAudio, openAudioBlob } = useVault();
  const toast = useToast();
  const { confirm } = useModal();
  const file = useRef<HTMLInputElement>(null);
  const [list, setList] = useState<AudioEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const hosted = hasImgbb();

  // What makes a re-load necessary: the standalone list's membership, or the item's own
  // audio_count / updated_at (the standalone loader reads a ref that follows the snapshot).
  const entry = itemId === null ? undefined : entries.find((e) => e.id === itemId);
  const key = itemId === null
    ? audioGallery.map((a) => a.id).join(",")
    : `${entry?.audio_count ?? 0}|${entry?.updated_at ?? ""}`;

  useEffect(() => {
    if (status !== "unlocked") { setList([]); return; }
    let alive = true;
    loadAudio(itemId)
      .then((l) => { if (alive) setList(l); })
      .catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [status, itemId, key, loadAudio]);

  if (status !== "unlocked") return null;

  const canAdd = hosted && !busy;

  const onAdd = async (files: File[]) => {
    if (!canAdd || !files.length) return;
    setBusy(true);
    try {
      const { added, error } = await addAudio(itemId, files);
      if (added) toast(`Added ${added} audio file${added === 1 ? "" : "s"}`);
      if (error) toast(error, { kind: "err" });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't add the audio", { kind: "err" });
    } finally { setBusy(false); }
  };

  const onRemove = async (a: AudioEntry) => {
    const ok = await confirm({
      title: `Delete “${a.info.name}”?`,
      description: "The encrypted record and the ciphertext hosted on imgbb are both removed. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeAudio(itemId, a.id);
      setList((prev) => prev.filter((x) => x.id !== a.id));
    } catch {
      toast("Couldn't delete that audio", { kind: "err" });
    } finally { setBusy(false); }
  };

  return (
    <section className="mt-6">
      <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[.1em] text-faint">
        <Icon name="music" size={15} className="text-accent" />
        {title}{list.length > 0 && <span className="text-muted">· {list.length}</span>}
      </h2>
      <div
        onDragOver={(e) => { if (canAdd && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void onAdd([...e.dataTransfer.files]); }}
        className={`rounded-card border border-dashed p-3 transition ${over ? "border-accent bg-accent/10" : "border-line-strong"}`}
      >
        <div className="grid gap-2.5">
          {list.map((a) => (
            <AudioPlayer key={a.id} info={a.info} busy={busy}
              load={() => openAudioBlob(itemId, a.id)} onRemove={() => void onRemove(a)} />
          ))}
          {busy && <div className="skeleton h-[58px] rounded-xl border border-line" />}
        </div>
        <div className={list.length || busy ? "mt-3" : ""}>
          <button type="button" className="btn" disabled={!canAdd} onClick={() => file.current?.click()}>
            <Icon name="music" size={16} /> Add audio
          </button>
          <input ref={file} type="file" accept={AUDIO_TYPES.join(",")} multiple hidden disabled={!hosted}
            onChange={(e) => { void onAdd([...(e.target.files ?? [])]); e.target.value = ""; }} />
        </div>
        <p className="mt-2.5 text-xs text-faint">
          {!hosted
            ? "Audio needs image hosting. Add `IMB_API` to .env to store audio in the vault."
            : hint ?? "MP3, M4A, OGG, WAV or WebM up to 25 MB · drop or pick — encrypted here before it's hosted."}
        </p>
      </div>
    </section>
  );
}
