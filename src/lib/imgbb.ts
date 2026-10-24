/**
 * A very small imgbb client — enough to park one encrypted blob and read it back.
 *
 * Used **only** by the Vault, and only after the image has been encrypted on this device
 * (see `container.ts` for how ciphertext is wrapped in a valid PNG before it travels).
 *
 * Honest limitations — the same ones we tell users in the docs:
 *
 *  - The site is client-only, so `IMB_API` is embedded in the JavaScript bundle. Anyone can
 *    read it. Use a key you can rotate, and don't put anything else on that imgbb account.
 *  - imgbb makes no durable-storage promise. Every read is therefore verified against the
 *    SHA-256 we recorded at upload time; a mismatch is reported as "unavailable", never
 *    silently rendered as garbage.
 *  - Free tier: rate limits apply, and a single upload may be up to 32 MB (we are far under).
 *  - There is no documented delete API — only the per-image `delete_url` we store alongside
 *    the pointer. {@link deleteHostedImage} calls the reverse-engineered endpoint best-effort;
 *    a failure there is harmless (the bytes are ciphertext) but leaves a blob on imgbb.
 */

const API = "https://api.imgbb.com/1/upload";
const MAX_UPLOAD = 32 * 1024 * 1024; // imgbb's documented per-file ceiling

/**
 * The injected key. Reads through `typeof` so importing this module outside a Vite build
 * (unit tests, a stray script) doesn't throw a ReferenceError — it just means "no key".
 */
function imgbbKey(): string {
  return typeof __IMGBB_KEY__ === "string" ? __IMGBB_KEY__.trim() : "";
}

/** True when an imgbb key is configured, i.e. hosted (unlimited) vault images are on. */
export const hasImgbb = (): boolean => imgbbKey().length > 0;

export interface HostedImage {
  /** Direct link to the stored file — the bytes themselves, not the plaintext. */
  url: string;
  /** Owner-only link to remove the image from imgbb (no documented delete API — see {@link deleteHostedImage}). */
  delete_url: string | null;
}

/** Upload `bytes` (already a valid PNG) and return where imgbb put it. Throws on any failure. */
export async function uploadPng(
  bytes: Uint8Array<ArrayBuffer>,
  name: string,
  opts: { expiration?: number } = {},
): Promise<HostedImage> {
  const key = imgbbKey();
  if (!key) throw new Error("imgbb-key-missing");
  if (bytes.length > MAX_UPLOAD) throw new Error("imgbb-too-large");

  const form = new FormData();
  form.append("image", new Blob([bytes], { type: "image/png" }), `${name}.png`);
  if (opts.expiration) form.append("expiration", String(Math.max(60, Math.round(opts.expiration))));

  const res = await fetch(`${API}?key=${encodeURIComponent(key)}`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`imgbb-http-${res.status}`);

  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: { url?: string; delete_url?: string };
  } | null;
  const url = json?.data?.url;
  if (!json?.success || !url) throw new Error("imgbb-rejected");

  return { url, delete_url: json.data?.delete_url ?? null };
}

/** Download a hosted file back as raw bytes. `no-store` so we always compare against what we uploaded. */
export async function fetchBlob(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`imgbb-fetch-${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/* ------------------------------------------------------------------ delete */

const DELETE_ENDPOINT = "https://ibb.co/json";
const DELETE_TIMEOUT = 6_000;
/** delete_url looks like `https://ibb.co/<image-id>/<delete-key>`. */
const DELETE_PATH = /^\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)\/?$/;

/**
 * Ask imgbb to permanently remove a hosted file, given its `delete_url`.
 *
 * **This is the one unsupported call we make.** imgbb documents no delete endpoint; the
 * `delete_url` is normally a page a human opens and confirms. The request below reproduces
 * what that page's own button sends (POST /json with the image id and delete key parsed out
 * of the URL) — an arrangement that has worked since the API existed, but that imgbb may
 * change or break without notice, and that returns an **opaque** response (see `no-cors`
 * below), so we cannot even verify the outcome.
 *
 * That is acceptable *because of what is stored there*: never readable content — only the
 * PNG-wrapped AES-GCM ciphertext of a vault image. A failed delete therefore leaks nothing
 * but third-party storage quota; the owner can still reclaim it by visiting the URL, which
 * the app keeps stored in the image record.
 *
 * Resolves `true` when the removal request was **delivered** (not confirmed — it can't be),
 * `false` when it wasn't. Never throws, and never takes longer than a few seconds: deleting
 * a Firestore pointer must not be held hostage by the host.
 */
export async function deleteHostedImage(deleteUrl: string): Promise<boolean> {
  let path: string;
  let id: string;
  let hash: string;
  try {
    const u = new URL(deleteUrl);
    const m = DELETE_PATH.exec(u.pathname);
    if (u.protocol !== "https:" || !/^(www\.)?ibb\.co$/.test(u.hostname) || !m) return false;
    path = u.pathname.replace(/\/$/, "");
    id = m[1];
    hash = m[2];
  } catch {
    return false;
  }

  const form = new FormData();
  form.append("pathname", path);
  form.append("action", "delete");
  form.append("delete", "image");
  form.append("from", "resource");
  form.append("deleting[id]", id);
  form.append("deleting[hash]", hash);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DELETE_TIMEOUT);
  try {
    // `no-cors` is deliberate: the POST body is a "simple" request, so the browser sends it
    // without a preflight even though ibb.co sends no CORS headers back — the deletion still
    // happens server-side; we are just not allowed to read the verdict.
    await fetch(DELETE_ENDPOINT, { method: "POST", body: form, mode: "no-cors", signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
