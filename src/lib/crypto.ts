/**
 * Client-side cryptography for the private Vault — Web Crypto only, no dependencies.
 *
 * Key hierarchy (see docs/vault-and-app-lock-plan.md):
 *
 *   passphrase --PBKDF2--> KEK (key-encryption key)
 *   KEK --AES-GCM wrap--> sealed DEK (a random 256-bit data-encryption key)
 *   DEK --AES-GCM--> every vault item's contents (title, code, notes, images, versions…)
 *
 * The passphrase and the raw DEK never leave the device: only ciphertext is written to
 * Firestore. Because items are encrypted with the DEK (not the passphrase), changing the
 * passphrase only re-wraps the DEK — no item has to be re-encrypted — and a recovery key
 * can unlock the same DEK.
 */

const KDF_ALGO = "PBKDF2-SHA-256" as const;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const DEK_BYTES = 32;

/** OWASP-recommended PBKDF2-HMAC-SHA-256 work factor. */
export const KDF_ITERATIONS = 600_000;

/** Crockford base32 — no I, L, O or U, so transcription is unambiguous. */
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_BYTES = 20; // 160 bits -> exactly 32 base32 characters

export interface VaultKdf {
  algo: typeof KDF_ALGO;
  iterations: number;
  /** base64 of a random 16-byte salt (not secret). */
  salt: string;
}

/** One encrypted value: a fresh 12-byte IV plus the AES-GCM ciphertext, both base64. */
export interface Sealed {
  v: 1;
  iv: string;
  ct: string;
}

/** What gets stored (in the clear) so a correct passphrase or recovery key can unlock the vault. */
export interface VaultKeyMaterial {
  kdf: VaultKdf;
  /** base64(iv || ciphertext) — the DEK sealed by the passphrase-derived KEK. */
  wrapped_dek: string;
  /** base64(iv || ciphertext) — a second copy of the DEK sealed by the recovery key, or null. */
  recovery_wrapped_dek: string | null;
  /** The one-time recovery key to show the user. Never sent to the server. */
  recovery_key: string | null;
}

/** Thrown when a ciphertext cannot be authenticated (wrong key or tampered data). */
export class DecryptionError extends Error {
  constructor(message = "Could not decrypt — the key is wrong or the data was altered.") {
    super(message);
    this.name = "DecryptionError";
  }
}

/* ------------------------------------------------------------------ bytes */

// Web Crypto's `BufferSource` requires a non-shared `ArrayBuffer`, so these helpers
// are explicit about producing `Uint8Array<ArrayBuffer>`.

export const utf8 = (s: string): Uint8Array<ArrayBuffer> => new Uint8Array(new TextEncoder().encode(s));

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

const CHUNK = 0x8000;
export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Best-effort wipe of sensitive bytes once they are no longer needed. */
function zero(bytes: Uint8Array): void {
  bytes.fill(0);
}

/* -------------------------------------------------------------------- KDF */

export function newKdfParams(iterations: number = KDF_ITERATIONS): VaultKdf {
  return { algo: KDF_ALGO, iterations, salt: toBase64(randomBytes(SALT_BYTES)) };
}

/** Derive the key-encryption key from a passphrase. */
export async function deriveKek(passphrase: string, kdf: VaultKdf): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", utf8(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64(kdf.salt), iterations: kdf.iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/* -------------------------------------------------------------------- DEK */

/** A fresh random data-encryption key (raw bytes, kept only long enough to wrap it). */
export function generateDek(): Uint8Array<ArrayBuffer> {
  return randomBytes(DEK_BYTES);
}

/** Import raw DEK bytes as a non-extractable in-memory key used to encrypt items. */
export async function importDek(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/* ------------------------------------------------------------ seal / open */

/** Encrypt arbitrary bytes with AES-GCM; returns base64(iv || ciphertext). */
export async function wrapBytes(key: CryptoKey, data: Uint8Array<ArrayBuffer>): Promise<string> {
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return toBase64(out);
}

/** Reverse of {@link wrapBytes}; throws {@link DecryptionError} on a bad key or tampering. */
export async function unwrapBytes(key: CryptoKey, sealed: string): Promise<Uint8Array<ArrayBuffer>> {
  const buf = fromBase64(sealed);
  const iv = new Uint8Array(buf.subarray(0, IV_BYTES));
  const ct = new Uint8Array(buf.subarray(IV_BYTES));
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
  } catch {
    throw new DecryptionError();
  }
}

const aadParam = (aad?: string) => (aad ? { additionalData: utf8(aad) } : {});

/** Encrypt arbitrary bytes into a {@link Sealed} blob (optionally bound to an id via `aad`). */
export async function sealBytes(key: CryptoKey, data: Uint8Array<ArrayBuffer>, aad?: string): Promise<Sealed> {
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, ...aadParam(aad) }, key, data));
  return { v: 1, iv: toBase64(iv), ct: toBase64(ct) };
}

/** Decrypt a {@link Sealed} blob back to bytes. Throws {@link DecryptionError} on a bad key or tampering. */
export async function openBytes(key: CryptoKey, sealed: Sealed, aad?: string): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(sealed.iv), ...aadParam(aad) },
      key,
      fromBase64(sealed.ct),
    );
    return new Uint8Array(plain);
  } catch {
    throw new DecryptionError();
  }
}

/** base64 SHA-256 — used to verify a hosted blob survived its image host unchanged. */
export async function sha256(data: Uint8Array<ArrayBuffer>): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}

/** Encrypt a string into a {@link Sealed} blob (optionally bound to an id via `aad`). */
export function sealText(key: CryptoKey, text: string, aad?: string): Promise<Sealed> {
  return sealBytes(key, utf8(text), aad);
}

/** Decrypt a {@link Sealed} blob back to a string. */
export async function openText(key: CryptoKey, sealed: Sealed, aad?: string): Promise<string> {
  return new TextDecoder().decode(await openBytes(key, sealed, aad));
}

/* ---------------------------------------------------- vault key lifecycle */

export interface CreateVaultOptions {
  /** Generate a recovery key (recommended). Default true. */
  withRecovery?: boolean;
  /** Override the PBKDF2 work factor — tests use a small value to stay fast. */
  iterations?: number;
}

/**
 * Set up a new vault: generate a DEK, seal it with a passphrase-derived KEK, and
 * (optionally) seal a second copy with a fresh recovery key. Show `recovery_key` to
 * the user once; store everything else.
 */
export async function createVaultKey(passphrase: string, opts: CreateVaultOptions = {}): Promise<VaultKeyMaterial> {
  const { withRecovery = true, iterations } = opts;
  const raw = generateDek();
  try {
    const kdf = newKdfParams(iterations);
    const kek = await deriveKek(passphrase, kdf);
    const wrapped_dek = await wrapBytes(kek, raw);

    let recovery_key: string | null = null;
    let recovery_wrapped_dek: string | null = null;
    if (withRecovery) {
      recovery_key = generateRecoveryKey();
      const rk = await recoveryKeyToAes(recovery_key);
      recovery_wrapped_dek = await wrapBytes(rk, raw);
    }
    return { kdf, wrapped_dek, recovery_wrapped_dek, recovery_key };
  } finally {
    zero(raw);
  }
}

/** Unlock with the passphrase; returns the in-memory item key. Throws on a wrong passphrase. */
export async function unlockVaultKey(passphrase: string, kdf: VaultKdf, wrapped_dek: string): Promise<CryptoKey> {
  const kek = await deriveKek(passphrase, kdf);
  const raw = await unwrapBytes(kek, wrapped_dek); // throws DecryptionError on a wrong passphrase
  try {
    return await importDek(raw);
  } finally {
    zero(raw);
  }
}

/** Unlock with the one-time recovery key instead of the passphrase. */
export async function unlockVaultKeyWithRecovery(recoveryKey: string, recoveryWrappedDek: string): Promise<CryptoKey> {
  const rk = await recoveryKeyToAes(recoveryKey);
  const raw = await unwrapBytes(rk, recoveryWrappedDek);
  try {
    return await importDek(raw);
  } finally {
    zero(raw);
  }
}

/** Change the passphrase: unwrap the DEK with the old one, re-seal it under a new salt/passphrase. */
export async function changeVaultPassphrase(
  oldPassphrase: string,
  kdf: VaultKdf,
  wrappedDek: string,
  newPassphrase: string,
  opts: { iterations?: number } = {},
): Promise<{ kdf: VaultKdf; wrapped_dek: string }> {
  const oldKek = await deriveKek(oldPassphrase, kdf);
  const raw = await unwrapBytes(oldKek, wrappedDek); // throws on a wrong passphrase
  try {
    const nextKdf = newKdfParams(opts.iterations);
    const nextKek = await deriveKek(newPassphrase, nextKdf);
    return { kdf: nextKdf, wrapped_dek: await wrapBytes(nextKek, raw) };
  } finally {
    zero(raw);
  }
}

/* ------------------------------------------------------------ recovery key */

/** Crockford base32 of `RECOVERY_BYTES` random bytes, grouped for easy transcription. */
export function generateRecoveryKey(): string {
  const chars = encodeB32(randomBytes(RECOVERY_BYTES));
  return chars.match(/.{1,4}/g)!.join("-");
}

/**
 * Normalise a typed recovery key: uppercase, drop separators, and fold the
 * characters Crockford leaves out (I/L -> 1, O -> 0). Returns null if it isn't a
 * valid 32-character key.
 */
export function normalizeRecoveryKey(text: string): string | null {
  const cleaned = text.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  if (cleaned.length !== RECOVERY_BYTES * 8 / 5) return null;
  for (const c of cleaned) if (!B32.includes(c)) return null;
  return cleaned;
}

/** Derive the AES key used to seal the recovery copy of the DEK (high-entropy input, so a plain hash suffices). */
async function recoveryKeyToAes(recoveryKey: string): Promise<CryptoKey> {
  const normalized = normalizeRecoveryKey(recoveryKey);
  if (!normalized) throw new Error("That recovery key doesn't look right.");
  const digest = await crypto.subtle.digest("SHA-256", utf8(normalized));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function encodeB32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
