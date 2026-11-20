import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  type Sealed, type VaultKdf, fromBase64, openBytes, openText, sealBytes, sealText, sha256, toBase64,
} from "./crypto";
import { packBytes, unpackBytes } from "./container";
import { deleteHostedImage, fetchBlob, hasImgbb, uploadPng } from "./imgbb";
import type { Snippet, SnippetImage } from "./types";

/**
 * The private Vault — a self-contained, encrypted copy of chosen snippets.
 *
 *   users/{uid}/meta/vault                    → {@link VaultMeta}: KDF params + the sealed data key
 *   users/{uid}/vault/{itemId}                → {@link VaultItem}: the sealed payload
 *   users/{uid}/vault/{itemId}/images/{imgId} → {@link VaultImage}: a sealed image
 *   users/{uid}/vaultImages/{imgId}           → {@link VaultGalleryImage}: a sealed gallery image
 *
 * Nothing here is readable without the passphrase: titles, code, notes, tags, group, images
 * and versions all live inside AES-GCM ciphertext. See docs/vault-and-app-lock-plan.md.
 */

export interface VaultMeta {
  v: 1;
  kdf: VaultKdf;
  /** base64(iv || ciphertext) — the 256-bit data key, sealed by the passphrase-derived key. */
  wrapped_dek: string;
  /** A second copy of the data key, sealed by the one-time recovery key (or null). */
  recovery_wrapped_dek: string | null;
  created_at: string;
  updated_at: string;
}

/** Everything sensitive about a snippet, kept as one encrypted JSON blob. */
export interface VaultPayload {
  title: string;
  language: string;
  description: string;
  notes?: string;
  tags: string[];
  code: string;
  group?: string;
  favorite: boolean;
}

export interface VaultItem {
  id: string;
  enc: Sealed;
  image_count: number;
  /** Optional: items written before audio existed lack it (and Firestore rejects `undefined`). */
  audio_count?: number;
  created_at: string;
  updated_at: string;
}

export interface VaultImage {
  id: string;
  /**
   * Which plaintext layout the ciphertext uses (see {@link sealImage}). Absent means format 1,
   * the layout written before the byte container existed — those records still open untouched.
   */
  fmt?: 2;
  /**
   * The image sealed inline in Firestore (base64 iv + ciphertext). Present for images that
   * were never hosted — or whose host failed verification, so we fell back to storing them here.
   */
  enc?: Sealed;
  /**
   * Where the ciphertext actually lives when it is too big (or too many) for Firestore:
   * a pointer to the blob on imgbb. Only ever set *after* the upload was downloaded back and
   * matched byte-for-byte, so `remote` is never written for a file the host silently altered.
   */
  remote?: VaultImageRemote;
}

/** Plaintext metadata about a hosted blob. The URL is opaque; `iv`/`sha`/`bytes` are not secret. */
export interface VaultImageRemote {
  url: string;
  /** base64 GCM IV — needed to decrypt, useless without the vault key. */
  iv: string;
  /** base64 SHA-256 of the ciphertext we uploaded, to detect a corrupted copy on read. */
  sha: string;
  /** Byte length of the ciphertext (an integrity cross-check). */
  bytes: number;
  /** Owner-only link to delete the file from imgbb (imgbb has no delete API). */
  delete_url: string | null;
}

/**
 * A standalone image in the vault's private gallery — sealed exactly like {@link VaultImage}
 * (inline `enc` or a verified imgbb `remote` pointer), but belonging to no snippet.
 * `created_at` is the one plaintext field; it only exists so the grid can be sorted.
 */
export interface VaultGalleryImage extends VaultImage {
  created_at: string;
}

/** A decrypted item, shaped like the fields the UI needs. */
export type VaultEntry = VaultPayload & {
  id: string;
  image_count: number;
  audio_count: number;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------- pure (unit-tested) */

export function payloadOf(s: Snippet): VaultPayload {
  return {
    title: s.title,
    language: s.language,
    description: s.description ?? "",
    ...(s.notes ? { notes: s.notes } : {}),
    tags: s.tags ?? [],
    code: s.code,
    ...(s.group ? { group: s.group } : {}),
    favorite: s.favorite,
  };
}

/** Rebuild a normal (plaintext) snippet from a decrypted entry. */
export function snippetOf(e: VaultEntry): Snippet {
  return {
    id: e.id,
    title: e.title,
    language: e.language,
    description: e.description,
    favorite: e.favorite,
    tags: e.tags,
    ...(e.notes ? { notes: e.notes } : {}),
    ...(e.group ? { group: e.group } : {}),
    code: e.code,
    image_count: e.image_count,
    created_at: e.created_at,
    updated_at: e.updated_at,
  };
}

/** Seal a snippet's sensitive fields; the id is bound in as additional authenticated data. */
export function sealPayload(key: CryptoKey, itemId: string, payload: VaultPayload): Promise<Sealed> {
  return sealText(key, JSON.stringify(payload), itemId);
}

export async function openPayload(key: CryptoKey, item: VaultItem): Promise<VaultPayload> {
  return JSON.parse(await openText(key, item.enc, item.id)) as VaultPayload;
}

/* -------------------------------------------------------- sealed image bytes */

/**
 * A vault image is encrypted as `u32be(headerLen) || utf8(header) || imageBytes`.
 *
 * Format 1 — the first version shipped — encrypted `JSON.stringify(SnippetImage)`, which buries
 * the picture inside a base64 data URL. base64 is ~33% larger than the bytes it carries, and the
 * *ciphertext* is what gets uploaded to imgbb and pointed at from Firestore, so that third was
 * paid on every stored and every transferred byte — on data that was about to become unreadable
 * anyway. Format 2 keeps the metadata as a small JSON header and encrypts the image bytes
 * themselves, which is ~25% smaller for the same picture.
 *
 * A record with no `fmt` is format 1 and still opens, so nothing needs migrating.
 */
interface ImageHeader {
  v: 2;
  id: string;
  w: number;
  h: number;
  /** The data URL's original length, carried through so a restore is byte-identical. */
  size: number;
  created_at: string;
  /** Taken off the data URL prefix, so the rebuilt one is identical. */
  mime: string;
}

const DATA_URL = /^data:([^;,]+);base64,([\s\S]*)$/;

const u32be = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

const readU32be = (b: Uint8Array, at: number) =>
  ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

/** `SnippetImage` → the bytes to encrypt, or `null` when `data` isn't a base64 data URL. */
export function packImage(image: SnippetImage): Uint8Array<ArrayBuffer> | null {
  const m = DATA_URL.exec(image.data);
  if (!m) return null;
  const header = new TextEncoder().encode(JSON.stringify({
    v: 2, id: image.id, w: image.w, h: image.h, size: image.size,
    created_at: image.created_at, mime: m[1],
  } satisfies ImageHeader));
  const bytes = fromBase64(m[2]);
  const out = new Uint8Array(4 + header.length + bytes.length);
  out.set(u32be(header.length), 0);
  out.set(header, 4);
  out.set(bytes, 4 + header.length);
  return out;
}

/** The exact inverse of {@link packImage}. */
export function unpackImage(plain: Uint8Array<ArrayBuffer>): SnippetImage {
  const at = 4 + readU32be(plain, 0);
  const h = JSON.parse(new TextDecoder().decode(plain.subarray(4, at))) as ImageHeader;
  return {
    id: h.id,
    data: `data:${h.mime};base64,${toBase64(plain.subarray(at))}`,
    w: h.w,
    h: h.h,
    size: h.size,
    created_at: h.created_at,
  };
}

/**
 * Seal an image for the vault, and say which format it went out in.
 *
 * Format 2 whenever the picture is a base64 data URL — which is every image the app produces —
 * and quietly format 1 otherwise, so an unexpected value can never fail a whole move.
 */
export async function sealImage(key: CryptoKey, image: SnippetImage): Promise<{ enc: Sealed; fmt?: 2 }> {
  const packed = packImage(image);
  return packed
    ? { enc: await sealBytes(key, packed, image.id), fmt: 2 }
    : { enc: await sealText(key, JSON.stringify(image), image.id) };
}

/** Decrypt an image plaintext in whichever format it was written. */
function decodeImage(plain: Uint8Array<ArrayBuffer>, fmt: 2 | undefined): SnippetImage {
  return fmt === 2 ? unpackImage(plain) : JSON.parse(new TextDecoder().decode(plain)) as SnippetImage;
}

/** Open an image that was sealed **inline** in Firestore. */
export async function openImage(key: CryptoKey, image: VaultImage): Promise<SnippetImage> {
  if (!image.enc) throw new Error("no-inline-image");
  return decodeImage(await openBytes(key, image.enc, image.id), image.fmt);
}

/**
 * Seal an image and hand it to whatever storage can afford to keep it.
 *
 * With an imgbb key configured the ciphertext is wrapped in a PNG, uploaded, then **downloaded
 * straight back and compared** — we only record the pointer once the bytes provably survived the
 * round trip. If the host is unavailable, out of quota or mangles the file, we simply keep the
 * image inline: the caller always gets a usable {@link VaultImage}, never a lost picture.
 *
 * The Firestore document for a hosted image is ~300 bytes instead of ~700 KB, which is what makes
 * "unlimited images" possible inside Firestore's 1 MiB document and free-tier storage limits.
 */
export async function sealForVault(key: CryptoKey, image: SnippetImage): Promise<VaultImage> {
  const { enc, fmt } = await sealImage(key, image);
  if (!hasImgbb()) return { id: image.id, fmt, enc };

  try {
    const ct = fromBase64(enc.ct);
    const sha = await sha256(ct);
    const { url, delete_url } = await uploadPng(await packBytes(ct), image.id);
    // Verify before trusting: unpack the pixels we get back and hash them.
    const round = await unpackBytes(await fetchBlob(url));
    if ((await sha256(round)) !== sha) throw new Error("host-changed-the-bytes");
    return { id: image.id, fmt, remote: { url, iv: enc.iv, sha, bytes: ct.length, delete_url } };
  } catch {
    return { id: image.id, fmt, enc };
  }
}

/** Read an image back, from wherever {@link sealForVault} left it, and verify it first. */
export async function openVaultImage(key: CryptoKey, image: VaultImage): Promise<SnippetImage> {
  if (!image.remote) return openImage(key, image);
  const { url, iv, sha, bytes } = image.remote;
  const raw = await unpackBytes(await fetchBlob(url));
  if (raw.length !== bytes || (await sha256(raw)) !== sha) throw new Error("hosted-image-unavailable");
  const plain = await openBytes(key, { v: 1, iv, ct: toBase64(raw) }, image.id);
  return decodeImage(plain, image.fmt);
}

/** Build the encrypted document for a snippet about to be moved into the vault. */
export async function makeVaultItem(key: CryptoKey, snippet: Snippet): Promise<VaultItem> {
  const payload = payloadOf(snippet);
  return {
    id: snippet.id,
    enc: await sealPayload(key, snippet.id, payload),
    image_count: snippet.image_count ?? 0,
    created_at: snippet.created_at,
    updated_at: snippet.updated_at,
  };
}

/** Turn a decrypted payload back into a {@link VaultEntry}. */
export const entryOf = (item: VaultItem, payload: VaultPayload): VaultEntry => ({
  ...payload,
  id: item.id,
  image_count: item.image_count,
  audio_count: item.audio_count ?? 0,
  created_at: item.created_at,
  updated_at: item.updated_at,
});

/* ------------------------------------------------------------------- meta */

const metaDoc = (uid: string) => doc(db, "users", uid, "meta", "vault");
const itemsCol = (uid: string) => collection(db, "users", uid, "vault");
const itemDoc = (uid: string, id: string) => doc(db, "users", uid, "vault", id);
const imagesCol = (uid: string, id: string) => collection(db, "users", uid, "vault", id, "images");
const imageDoc = (uid: string, id: string, imageId: string) => doc(db, "users", uid, "vault", id, "images", imageId);
const galleryCol = (uid: string) => collection(db, "users", uid, "vaultImages");
const galleryDoc = (uid: string, imageId: string) => doc(db, "users", uid, "vaultImages", imageId);

export async function getVaultMeta(uid: string): Promise<VaultMeta | null> {
  const snap = await getDoc(metaDoc(uid));
  return snap.exists() ? (snap.data() as VaultMeta) : null;
}

export async function putVaultMeta(uid: string, meta: VaultMeta): Promise<void> {
  await setDoc(metaDoc(uid), meta);
}

/* ------------------------------------------------------------------ items */

export function watchVaultItems(uid: string, cb: (items: VaultItem[]) => void, onError?: () => void): () => void {
  return onSnapshot(
    query(itemsCol(uid), orderBy("created_at")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VaultItem, "id">) }))),
    () => onError?.(),
  );
}

export async function putVaultItem(uid: string, item: VaultItem): Promise<void> {
  const { id, ...data } = item;
  await setDoc(itemDoc(uid, id), data);
}

/**
 * Best-effort removal of the hosted (imgbb) ciphertext behind image records. The Firestore
 * pointers are already gone by the time this runs, so a failure here costs only third-party
 * storage quota — never readability: what sits at the far end is AES-GCM ciphertext.
 * Callers don't wait on the host per image; all requests fire in parallel and are settled.
 */
export async function purgeHosted(images: Omit<VaultImage, "id">[]): Promise<void> {
  const urls = images.map((im) => im.remote?.delete_url).filter((u): u is string => !!u);
  if (!urls.length) return;
  await Promise.allSettled(urls.map((u) => deleteHostedImage(u)));
}

export async function deleteVaultItem(uid: string, id: string): Promise<void> {
  const snap = await getDocs(imagesCol(uid, id));
  const images = snap.docs.map((d) => d.data() as Omit<VaultImage, "id">);
  // Audio records have the same `remote` shape; read inline (not via vault-audio.ts, which imports this file).
  const audioSnap = await getDocs(collection(db, "users", uid, "vault", id, "audio"));
  const audio = audioSnap.docs.map((d) => d.data() as Omit<VaultImage, "id">);
  // The records the user sees go first; then the blobs behind them, best effort. This one
  // function is what moves *out* of the vault (the plaintext was already restored to
  // Firestore by the caller) and what deletes it outright — both must drop the host copy.
  await Promise.all([...snap.docs, ...audioSnap.docs].map((d) => deleteDoc(d.ref)));
  await deleteDoc(itemDoc(uid, id));
  await purgeHosted([...images, ...audio]);
}

/* ----------------------------------------------------------------- images */

export async function listVaultImages(uid: string, id: string): Promise<VaultImage[]> {
  const snap = await getDocs(query(imagesCol(uid, id), orderBy("__name__")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VaultImage, "id">) }));
}

export async function putVaultImage(uid: string, id: string, image: VaultImage): Promise<void> {
  const { id: imageId, ...data } = image;
  await setDoc(imageDoc(uid, id, imageId), data);
}

export async function deleteVaultImage(uid: string, id: string, imageId: string): Promise<void> {
  const ref = imageDoc(uid, id, imageId);
  const snap = await getDoc(ref);
  await deleteDoc(ref);
  if (snap.exists()) await purgeHosted([snap.data() as Omit<VaultImage, "id">]);
}

/* ------------------------------------------------- standalone gallery */

/**
 * The vault gallery: sealed images that belong to no snippet (the `/vault` Images section).
 * Same seal → host → verify → purge pipeline as item images; `created_at` merely sorts it.
 * Newest first — a gallery reads better that way than the item list's chronological order.
 */
export function watchGalleryImages(
  uid: string, cb: (images: VaultGalleryImage[]) => void, onError?: () => void,
): () => void {
  return onSnapshot(
    query(galleryCol(uid), orderBy("created_at", "desc")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VaultGalleryImage, "id">) }))),
    () => onError?.(),
  );
}

export async function putGalleryImage(uid: string, image: VaultGalleryImage): Promise<void> {
  const { id, ...data } = image;
  await setDoc(galleryDoc(uid, id), data);
}

export async function deleteGalleryImage(uid: string, imageId: string): Promise<void> {
  const ref = galleryDoc(uid, imageId);
  const snap = await getDoc(ref);
  // Record first, then the blob behind it — same order (and same best-effort contract) as
  // deleting an item image: an imgbb hiccup strands ciphertext, never a readable picture.
  await deleteDoc(ref);
  if (snap.exists()) await purgeHosted([snap.data() as Omit<VaultGalleryImage, "id">]);
}

/* --------------------------------------------- plaintext side of a move */

export async function readSnippetImages(uid: string, snippetId: string): Promise<SnippetImage[]> {
  const snap = await getDocs(query(collection(db, "users", uid, "snippets", snippetId, "images"), orderBy("created_at")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SnippetImage, "id">) }));
}

export async function writeSnippetImage(uid: string, snippetId: string, image: SnippetImage): Promise<void> {
  const { id, ...data } = image;
  await setDoc(doc(db, "users", uid, "snippets", snippetId, "images", id), data);
}

export async function deleteSnippetImages(uid: string, snippetId: string): Promise<void> {
  const snap = await getDocs(collection(db, "users", uid, "snippets", snippetId, "images"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

/**
 * Delete a snippet's version history. Firestore does not cascade a document's sub-collections,
 * so a plaintext `versions` sub-collection would outlive the snippet — which would defeat the
 * vault, since the history holds the very code being sealed away.
 */
export async function deleteSnippetVersions(uid: string, snippetId: string): Promise<void> {
  const snap = await getDocs(collection(db, "users", uid, "snippets", snippetId, "versions"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}
