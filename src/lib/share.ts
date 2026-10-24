import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, orderBy, query, setDoc, updateDoc, Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Snippet } from "./types";

/**
 * Read-only sharing.
 *
 * A share is a *copy* of your snippets written outside your private vault so that
 * anyone with the (unguessable) link can read it without signing in:
 *
 *   shares/{token}                                  → metadata
 *   shares/{token}/snippets/{snippetId}             → one shared snippet
 *   shares/{token}/snippets/{snippetId}/images/{id} → its images (base64)
 *
 * Your vault rules stay untouched; revoking a share deletes these documents.
 */

export interface ShareMeta {
  owner_id: string;
  owner_name: string;
  kind: "snippet" | "group";
  title: string;
  group?: string;
  created_at: string;
  expires_at: string | null;
  /**
   * The same instant as `expires_at`, but as a Firestore timestamp so the security rules can
   * compare it against the server clock. Always written by this app: a share that never expires
   * stores a far-future timestamp rather than null, because the rules cannot compare a timestamp
   * to null (that would be a type error and lock the link). Older shares may lack the field, which
   * the rules read as the same far-future default.
   */
  expires_at_ts?: Timestamp;
  /** How many times the public link has been opened (best-effort). */
  views?: number;
}

interface SharedImage { id: string; data: string; w: number; h: number; }

export interface SharedSnippet {
  id: string;
  title: string;
  language: string;
  description: string;
  notes: string;
  tags: string[];
  code: string;
  order: number;
  images: SharedImage[];
}

export interface ShareBundle { token: string; meta: ShareMeta; snippets: SharedSnippet[]; }

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Written for a share that never expires, so the rules always compare timestamp to timestamp. */
const NEVER = new Date("9999-12-31T00:00:00.000Z");

/** 24-char, cryptographically random, URL-safe id (~142 bits). */
function newShareToken(): string {
  const out: string[] = [];
  while (out.length < 24) {
    const bytes = new Uint8Array(24 - out.length);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      // 248 is the largest multiple of 62 below 256. Rejecting the top 8 values keeps every
      // character equally likely; a plain `b % 62` would make the first 8 slightly more common.
      if (b >= 248) continue;
      out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join("");
}

/** Absolute, shareable URL for a token. */
export const shareUrl = (token: string) => `${window.location.origin}/share/${token}`;

interface Owner { uid: string; name: string; }

/**
 * Create (or refresh) a share for one snippet or a whole group.
 * Passing `token` overwrites the existing share so its link stays the same.
 */
export async function createShare(
  owner: Owner,
  opts: { token?: string; kind: "snippet" | "group"; title: string; group?: string; snippets: Snippet[]; expires_at?: string | null },
): Promise<string> {
  const token = opts.token || newShareToken();
  // Keep the original creation date and view count when refreshing a link.
  const prev = opts.token ? await getShareMeta(opts.token) : null;
  const expiresAt = opts.expires_at ?? null;
  await setDoc(doc(db, "shares", token), {
    owner_id: owner.uid,
    owner_name: owner.name,
    kind: opts.kind,
    title: opts.title,
    group: opts.group ?? "",
    created_at: prev?.created_at ?? new Date().toISOString(),
    expires_at: expiresAt,
    // The rules can only compare timestamps, not ISO strings, so the server gets its own copy.
    // A never-expiring share gets a far-future timestamp, never null — see ShareMeta.expires_at_ts.
    expires_at_ts: Timestamp.fromDate(expiresAt ? new Date(expiresAt) : NEVER),
    views: prev?.views ?? 0,
  } satisfies ShareMeta);

  // Clear any previous content first so the refresh is exact (no orphaned snippets/images).
  await clearShareContent(token);

  for (let i = 0; i < opts.snippets.length; i++) {
    const s = opts.snippets[i];
    await setDoc(doc(db, "shares", token, "snippets", s.id), {
      title: s.title,
      language: s.language,
      description: s.description ?? "",
      notes: s.notes ?? "",
      tags: s.tags ?? [],
      code: s.code,
      order: i,
    });
    // Copy the owner's images (readable by the owner) into the share.
    const imgs = await getDocs(query(collection(db, "users", owner.uid, "snippets", s.id, "images"), orderBy("created_at")));
    for (const d of imgs.docs) {
      const v = d.data() as { data: string; w: number; h: number };
      await setDoc(doc(db, "shares", token, "snippets", s.id, "images", d.id), { data: v.data, w: v.w, h: v.h });
    }
  }
  return token;
}

/** Read a share. Returns null when it is missing, expired, or revoked. */
export async function getShare(token: string): Promise<ShareBundle | null> {
  try {
    const metaSnap = await getDoc(doc(db, "shares", token));
    if (!metaSnap.exists()) return null;
    const meta = metaSnap.data() as ShareMeta;
    // Belt and braces: the rules already refuse an expired share, but check here too.
    if (meta.expires_at && new Date(meta.expires_at).getTime() < Date.now()) return null;

    const snSnap = await getDocs(collection(db, "shares", token, "snippets"));
    const snippets: SharedSnippet[] = [];
    for (const d of snSnap.docs) {
      const v = d.data() as Omit<SharedSnippet, "id" | "images">;
      const imgSnap = await getDocs(collection(db, "shares", token, "snippets", d.id, "images"));
      snippets.push({
        id: d.id,
        title: v.title,
        language: v.language,
        description: v.description ?? "",
        notes: v.notes ?? "",
        tags: v.tags ?? [],
        code: v.code,
        order: v.order ?? 0,
        images: imgSnap.docs.map((im) => ({ id: im.id, ...(im.data() as Omit<SharedImage, "id">) })),
      });
    }
    snippets.sort((a, b) => a.order - b.order);
    return { token, meta, snippets };
  } catch {
    // An expired share is refused by the rules, which surfaces as permission-denied —
    // the caller just sees "not found", the same as a revoked or mistyped link.
    return null;
  }
}

/** Read a share's metadata only (no snippets). Returns null when missing, expired or unreadable. */
export async function getShareMeta(token: string): Promise<ShareMeta | null> {
  try {
    const snap = await getDoc(doc(db, "shares", token));
    return snap.exists() ? (snap.data() as ShareMeta) : null;
  } catch {
    return null;
  }
}

/** Fire-and-forget view counter bump. Silently no-ops when blocked. */
export async function bumpShareViews(token: string): Promise<void> {
  try {
    await setDoc(doc(db, "shares", token), { views: increment(1) }, { merge: true });
  } catch {
    try { await updateDoc(doc(db, "shares", token), { views: increment(1) }); } catch { /* offline or rules */ }
  }
}

/** Turn a "time to live" in hours into an absolute ISO expiry (null = never). */
export function expiresAtFromTtl(hours: number | null): string | null {
  if (!hours) return null;
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

export const EXPIRY_OPTIONS: { value: string; label: string; hours: number | null }[] = [
  { value: "never", label: "Never expires", hours: null },
  { value: "1h", label: "Expires in 1 hour", hours: 1 },
  { value: "1d", label: "Expires in 1 day", hours: 24 },
  { value: "7d", label: "Expires in 7 days", hours: 24 * 7 },
  { value: "30d", label: "Expires in 30 days", hours: 24 * 30 },
];

/** Short, human expiry label, e.g. "expires in 6 days" / "expired". */
export function expiryLabel(iso: string | null | undefined): string {
  if (!iso) return "never expires";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `expires in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `expires in ${hrs} hour${hrs > 1 ? "s" : ""}`;
  const days = Math.round(hrs / 24);
  return `expires in ${days} day${days > 1 ? "s" : ""}`;
}

/** Delete a share and everything under it. */
export async function revokeShare(token: string): Promise<void> {
  await clearShareContent(token);
  await deleteDoc(doc(db, "shares", token));
}

async function clearShareContent(token: string): Promise<void> {
  const sn = await getDocs(collection(db, "shares", token, "snippets"));
  for (const d of sn.docs) {
    const imgs = await getDocs(collection(db, "shares", token, "snippets", d.id, "images"));
    for (const im of imgs.docs) await deleteDoc(im.ref);
    await deleteDoc(d.ref);
  }
}
