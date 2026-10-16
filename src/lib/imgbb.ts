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
 *  - There is no delete API — only the per-image `delete_url` we store alongside the pointer.
 */

const API = "https://api.imgbb.com/1/upload";
const MAX_UPLOAD = 32 * 1024 * 1024; // imgbb's documented per-file ceiling

/**
 * The injected key. Reads through `typeof` so importing this module outside a Vite build
 * (unit tests, a stray script) doesn't throw a ReferenceError — it just means "no key".
 */
export function imgbbKey(): string {
  return typeof __IMGBB_KEY__ === "string" ? __IMGBB_KEY__.trim() : "";
}

/** True when an imgbb key is configured, i.e. hosted (unlimited) vault images are on. */
export const hasImgbb = (): boolean => imgbbKey().length > 0;

export interface HostedImage {
  /** Direct link to the stored file — the bytes themselves, not the plaintext. */
  url: string;
  /** Owner-only link to remove the image from imgbb (there is no delete API). */
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
