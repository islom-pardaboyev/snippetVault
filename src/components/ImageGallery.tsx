import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { MAX_IMAGES } from "../lib/images";

interface GalleryImage { id: string; data: string; w: number; h: number; }

interface Props {
  images: GalleryImage[];
  onAdd?(files: File[]): void;
  onRemove?(id: string): void;
  busy?: boolean;
  hint?: string;
  /** Highest image count allowed. The Vault passes `Infinity` — that's the one unlimited place. */
  max?: number;
}

/** Thumbnail strip with add (button / drag-drop) and a click-to-enlarge lightbox. */
export function ImageGallery({ images, onAdd, onRemove, busy, hint, max = MAX_IMAGES }: Props) {
  const file = useRef<HTMLInputElement>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const unlimited = max === Infinity;

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % images.length));
      else if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + images.length) % images.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length]);

  useEffect(() => { if (open !== null && open >= images.length) setOpen(images.length ? images.length - 1 : null); }, [images.length, open]);

  const canAdd = !!onAdd && (unlimited || images.length < max);
  const cur = open !== null ? images[open] : undefined;

  return (
    <div
      onDragOver={(e) => { if (canAdd && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (canAdd) onAdd?.([...e.dataTransfer.files]); }}
      className={`rounded-card border border-dashed p-3 transition ${over ? "border-accent bg-accent/10" : "border-line-strong"}`}
    >
      <div className="flex flex-wrap gap-3">
        {images.map((im, i) => (
          <div key={im.id} className="group relative size-[112px] overflow-hidden rounded-xl border border-line bg-bg">
            <button type="button" onClick={() => setOpen(i)} className="size-full" aria-label={`Open image ${i + 1}`}>
              <img src={im.data} alt={`Attachment ${i + 1}`} loading="lazy" className="size-full object-cover transition group-hover:scale-105" />
            </button>
            {onRemove && (
              <button type="button" aria-label="Remove image" onClick={() => onRemove(im.id)}
                className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-lg bg-black/65 text-white opacity-0 transition hover:bg-danger group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
                <Icon name="x" size={15} />
              </button>
            )}
          </div>
        ))}
        {busy && <div className="skeleton size-[112px] rounded-xl border border-line" />}
        {canAdd && (
          <button type="button" onClick={() => file.current?.click()}
            className="grid size-[112px] place-items-center rounded-xl border border-line bg-surface text-muted transition hover:border-accent hover:text-ink">
            <span className="grid justify-items-center gap-1 text-[12.5px] font-semibold">
              <Icon name="image" size={22} /> Add image
            </span>
          </button>
        )}
        <input ref={file} type="file" accept="image/*" multiple hidden
          onChange={(e) => { onAdd?.([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>
      <p className="mt-2.5 text-xs text-faint">
        {hint ?? (unlimited
          ? `${images.length} image${images.length === 1 ? "" : "s"} · drop, pick or paste (⌘V) — encrypted here before it's stored.`
          : canAdd
            ? `${images.length}/${max} · drop, pick or paste (⌘V) a screenshot — it's resized & stored with the snippet.`
            : `${images.length}/${max} images`)}
      </p>

      <dialog ref={dlg} onClose={() => setOpen(null)} onClick={(e) => { if (e.target === dlg.current) setOpen(null); }}
        className="m-auto max-h-[94vh] w-[min(1100px,calc(100vw-20px))] overflow-hidden rounded-[20px] border border-line-strong bg-bg p-0 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,.8)]">
        {cur && (
          <div className="relative grid place-items-center bg-black/40 p-3">
            <img src={cur.data} alt="" className="max-h-[84vh] max-w-full rounded-lg object-contain" />
            <div className="absolute right-3 top-3 flex gap-2">
              <a href={cur.data} download={`snippet-image-${(open ?? 0) + 1}.webp`} className="btn !h-9 bg-surface/90" aria-label="Download image"><Icon name="download" size={16} /></a>
              {onRemove && (
                <button className="btn btn-danger !h-9 bg-surface/90" aria-label="Delete image" onClick={() => onRemove(cur.id)}><Icon name="trash" size={16} /></button>
              )}
              <button className="btn !h-9 bg-surface/90" aria-label="Close" onClick={() => setOpen(null)}><Icon name="x" size={16} /></button>
            </div>
            {images.length > 1 && (
              <>
                <button className="btn btn-icon absolute left-3 top-1/2 -translate-y-1/2 bg-surface/90" aria-label="Previous"
                  onClick={() => setOpen((open! - 1 + images.length) % images.length)}><Icon name="back" /></button>
                <button className="btn btn-icon absolute right-3 top-1/2 -translate-y-1/2 bg-surface/90" aria-label="Next"
                  onClick={() => setOpen((open! + 1) % images.length)}><Icon name="back" className="rotate-180" /></button>
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">{(open ?? 0) + 1} / {images.length}</span>
              </>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}
