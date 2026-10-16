import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveKek, newKdfParams } from "../crypto";
import type { SnippetImage } from "../types";
import { openVaultImage, sealForVault, type VaultImage } from "../vault";

/**
 * The hosted-image path, exercised end to end against a fake imgbb:
 * seal → pack as PNG → upload → download → verify → (only then) store the pointer.
 *
 * The host is mocked at the module boundary, so no test here can reach the network or the
 * real API key, and we can make it misbehave on purpose.
 *
 * NOTE: never call `imgbb` for real here — `hasImgbb()` is true whenever `IMB_API` is in `.env`.
 */

const host = vi.hoisted(() => ({
  online: true,
  /** Corrupt every file after it is "stored", the way a host that re-encodes does. */
  mangle: false,
  files: new Map<string, number[]>(),
}));

vi.mock("../imgbb", () => ({
  imgbbKey: () => "test-key",
  hasImgbb: () => true,
  uploadPng: async (bytes: Uint8Array, name: string) => {
    if (!host.online) throw new Error("host-offline");
    const stored = Uint8Array.from(bytes);
    // Byte 64 sits inside the IDAT stream (signature 8 + IHDR 25 + IDAT framing 8 = 41).
    if (host.mangle && stored.length > 80) stored[64] ^= 0xff;
    host.files.set(`https://img.test/${name}.png`, [...stored]);
    return { url: `https://img.test/${name}.png`, delete_url: null };
  },
  fetchBlob: async (url: string) => {
    const bytes = host.files.get(url);
    if (!bytes) throw new Error("404");
    return Uint8Array.from(bytes);
  },
  deleteHostedImage: async () => true, // never called in this file — only deletes purge
}));

const IMAGE: SnippetImage = {
  id: "img-1",
  data: "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=",
  w: 2,
  h: 1,
  size: 64,
  created_at: "2026-01-01T00:00:00.000Z",
};

/** One throwaway key per test — the salt is random, so a second `key()` would be a different key. */
const key = () => deriveKek("test passphrase", newKdfParams(1_000));

beforeEach(() => {
  host.online = true;
  host.mangle = false;
  host.files.clear();
});

describe("hosted vault images", () => {
  it("stores a pointer, not the ciphertext, and reads it back", async () => {
    const k = await key();
    const record = await sealForVault(k, IMAGE);

    expect(record.remote).toBeDefined();
    expect(record.enc).toBeUndefined(); // the ~700 KB blob must NOT stay in Firestore
    expect(record.remote!.bytes).toBeGreaterThan(0);
    expect(host.files.size).toBe(1);

    await expect(openVaultImage(k, record)).resolves.toEqual(IMAGE);
  });

  it("falls back to inline storage when the host is unavailable", async () => {
    host.online = false;
    const k = await key();
    const record = await sealForVault(k, IMAGE);

    expect(record.remote).toBeUndefined();
    expect(record.enc).toBeDefined();
    expect(host.files.size).toBe(0);
    await expect(openVaultImage(k, record)).resolves.toEqual(IMAGE);
  });

  it("never keeps a pointer to a file the host altered", async () => {
    host.mangle = true;
    const k = await key();
    const record = await sealForVault(k, IMAGE);

    // The upload "succeeded" but the bytes came back wrong — we must land on the safe branch.
    expect(record.remote).toBeUndefined();
    expect(record.enc).toBeDefined();
    await expect(openVaultImage(k, record)).resolves.toEqual(IMAGE);
  });

  it("rejects a hosted image that was tampered with after upload", async () => {
    const k = await key();
    const record = await sealForVault(k, IMAGE);
    const url = record.remote!.url;
    host.files.set(url, host.files.get(url)!.map((b, i) => (i === 64 ? b ^ 0xff : b)));

    await expect(openVaultImage(k, record)).rejects.toThrow();
  });

  it("rejects a hosted image that has gone missing", async () => {
    const k = await key();
    const record = await sealForVault(k, IMAGE);
    host.files.delete(record.remote!.url);
    await expect(openVaultImage(k, record)).rejects.toThrow();
  });

  it("refuses the wrong passphrase, exactly like an inline image", async () => {
    const k = await key();
    const record = await sealForVault(k, IMAGE);
    await expect(openVaultImage(k, record)).resolves.toEqual(IMAGE);
    const wrong = await deriveKek("not the passphrase", newKdfParams(1_000));
    await expect(openVaultImage(wrong, record)).rejects.toThrow();
  });

  it("binds each image to its own id", async () => {
    const k = await key();
    const record: VaultImage = { ...(await sealForVault(k, IMAGE)), id: "other-id" };
    await expect(openVaultImage(k, record)).rejects.toThrow();
  });
});
