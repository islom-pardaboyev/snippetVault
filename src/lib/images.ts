/**
 * Turns any image file into a small, text-safe base64 data URL.
 *
 * How: decode the file → draw it on a <canvas> at a smaller size → canvas.toDataURL()
 * re-encodes it (WebP/JPEG) and returns "data:image/webp;base64,AAAA…".
 * Compression matters because Firestore documents are limited to 1 MiB and base64 adds ~33%.
 */
export const MAX_IMAGES = 5;
const MAX_DIM = 1280;
const MAX_CHARS = 600_000; // encoded size cap (~450 KB of image)

export interface Compressed { data: string; w: number; h: number; size: number; }

async function decode(file: File): Promise<{ src: CanvasImageSource; w: number; h: number; close(): void }> {
  if ("createImageBitmap" in window) {
    try {
      const b = await createImageBitmap(file);
      return { src: b, w: b.width, h: b.height, close: () => b.close() };
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

async function compressImage(file: File): Promise<Compressed> {
  if (!file.type.startsWith("image/")) throw new Error("not-image");
  const img = await decode(file);
  try {
    let scale = Math.min(1, MAX_DIM / Math.max(img.w, img.h));
    let quality = 0.82;
    for (let i = 0; i < 7; i++) {
      const w = Math.max(1, Math.round(img.w * scale));
      const h = Math.max(1, Math.round(img.h * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      if (!g) throw new Error("no-canvas");
      let data = (g.drawImage(img.src, 0, 0, w, h), c.toDataURL("image/webp", quality));
      if (!data.startsWith("data:image/webp")) {
        // browser can't encode WebP: JPEG on a white background
        g.globalCompositeOperation = "destination-over";
        g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
        data = c.toDataURL("image/jpeg", quality);
      }
      if (data.length <= MAX_CHARS) return { data, w, h, size: data.length };
      quality = Math.max(0.5, quality - 0.08);
      scale *= 0.85;
    }
    throw new Error("too-large");
  } finally {
    img.close();
  }
}

export async function compressFiles(files: File[], slots: number): Promise<{ ok: Compressed[]; error?: string }> {
  const ok: Compressed[] = [];
  let error: string | undefined;
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (files.length && !images.length) return { ok, error: "That isn't an image file." };
  if (slots <= 0) return { ok, error: `Up to ${MAX_IMAGES} images per snippet.` };
  for (const f of images.slice(0, slots)) {
    try { ok.push(await compressImage(f)); }
    catch { error = "Couldn't read one of the images (HEIC or very large?)."; }
  }
  if (images.length > slots) error = `Only ${MAX_IMAGES} images per snippet — extras were skipped.`;
  return { ok, error };
}

/**
 * Compress every image in `files` with **no count cap** — the Vault is the one place that
 * accepts unlimited images (they are encrypted and hosted off-Firestore, see `sealForVault`).
 * Same per-image size ceiling as everywhere else, so nothing can outgrow a document if it has
 * to fall back to inline storage.
 */
export async function compressAll(files: File[]): Promise<{ ok: Compressed[]; error?: string }> {
  const ok: Compressed[] = [];
  let error: string | undefined;
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (files.length && !images.length) return { ok, error: "That isn't an image file." };
  for (const f of images) {
    try { ok.push(await compressImage(f)); }
    catch { error = "Couldn't read one of the images (HEIC or very large?)."; }
  }
  return { ok, error };
}
