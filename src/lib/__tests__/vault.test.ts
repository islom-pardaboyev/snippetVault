import { describe, expect, it } from "vitest";
import { importDek, generateDek, DecryptionError, sealText, toBase64 } from "../crypto";
import {
  entryOf,
  makeVaultItem,
  openImage,
  openPayload,
  openVaultImage,
  packImage,
  payloadOf,
  sealImage,
  snippetOf,
  unpackImage,
  type VaultItem,
} from "../vault";
import type { Snippet, SnippetImage } from "../types";

const key = () => importDek(generateDek());

const snip = (patch: Partial<Snippet> = {}): Snippet => ({
  id: "s42",
  title: "Prod database URL",
  language: "Shell",
  favorite: true,
  group: "Secrets",
  tags: ["prod", "env"],
  description: "The connection string",
  notes: "rotate every 90 days",
  code: "postgres://user:pw@host:5432/app",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-02-01T00:00:00.000Z",
  ...patch,
});

const img = (id = "i1"): SnippetImage => ({
  id,
  data: "data:image/webp;base64,AAAA",
  w: 100,
  h: 50,
  size: 24,
  created_at: "2026-01-01T00:00:00.000Z",
});

describe("payload mapping", () => {
  it("round-trips a full snippet through payloadOf/snippetOf", () => {
    const entry = entryOf(
      { id: "s42", enc: { v: 1, iv: "", ct: "" }, image_count: 2, created_at: "a", updated_at: "b" },
      payloadOf(snip()),
    );
    expect(entry.id).toBe("s42");
    expect(entry.image_count).toBe(2);
    const back = snippetOf(entry);
    expect(back.title).toBe("Prod database URL");
    expect(back.code).toContain("postgres://");
    expect(back.notes).toBe("rotate every 90 days");
    expect(back.group).toBe("Secrets");
    expect(back.favorite).toBe(true);
    expect(back.tags).toEqual(["prod", "env"]);
    expect(back.image_count).toBe(2);
  });

  it("omits empty notes and group so the payload stays tidy", () => {
    const p = payloadOf(snip({ notes: undefined, group: undefined }));
    expect("notes" in p).toBe(false);
    expect("group" in p).toBe(false);
    const back = snippetOf(entryOf({ id: "x", enc: { v: 1, iv: "", ct: "" }, image_count: 0, created_at: "a", updated_at: "b" }, p));
    expect(back.notes).toBeUndefined();
    expect(back.group).toBeUndefined();
  });
});

describe("sealed payloads", () => {
  it("seals and reopens a payload", async () => {
    const k = await key();
    const item = await makeVaultItem(k, snip());
    expect(item.id).toBe("s42");
    expect(await openPayload(k, item)).toEqual(payloadOf(snip()));
  });

  it("binds the ciphertext to the item id via AAD", async () => {
    const k = await key();
    const item = await makeVaultItem(k, snip());
    const moved: VaultItem = { ...item, id: "other-id" };
    await expect(openPayload(k, moved)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("cannot be reopened with a different key", async () => {
    const item = await makeVaultItem(await key(), snip());
    await expect(openPayload(await key(), item)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("leaves the sensitive fields out of the plaintext document", async () => {
    const item = await makeVaultItem(await key(), snip());
    const serialized = JSON.stringify(item);
    expect(serialized).not.toContain("postgres://");
    expect(serialized).not.toContain("Prod database URL");
    expect(serialized).not.toContain("Secrets");
    expect(serialized).not.toContain("rotate every 90 days");
  });
});

describe("sealed images", () => {
  it("packImage/unpackImage is an exact inverse", () => {
    const original = img();
    expect(unpackImage(packImage(original)!)).toEqual(original);
  });

  it("refuses to pack a value that is not a base64 data URL", () => {
    expect(packImage({ ...img(), data: "blob:http://localhost/whatever" })).toBeNull();
  });

  it("round-trips a full image record", async () => {
    const k = await key();
    const original = img();
    const { enc, fmt } = await sealImage(k, original);
    expect(fmt).toBe(2);
    expect(await openImage(k, { id: original.id, enc, fmt })).toEqual(original);
  });

  it("preserves the data URL's mime type", async () => {
    const k = await key();
    const png = { ...img(), data: "data:image/png;base64,iVBORw0KGgo=", size: 36 };
    const { enc, fmt } = await sealImage(k, png);
    expect((await openImage(k, { id: png.id, enc, fmt })).data).toBe(png.data);
  });

  it("encrypts the image bytes, not a base64 copy of them", async () => {
    const k = await key();
    // An incompressible payload, well past the point where the JSON header is noise.
    const bytes = new Uint8Array(64 * 1024).map((_, i) => (i * 31 + 7) & 255);
    const big: SnippetImage = { ...img("big"), data: `data:image/webp;base64,${toBase64(bytes)}`, size: 0 };
    const packed = await sealImage(k, big);
    const json = await sealText(k, JSON.stringify(big), big.id);
    // ~25% smaller: the ciphertext carries the bytes themselves, not 4/3 of them.
    expect(packed.fmt).toBe(2);
    expect(packed.enc.ct.length).toBeLessThan(json.ct.length * 0.8);
    expect(await openImage(k, { id: big.id, ...packed })).toEqual(big);
  });

  it("still opens an image sealed in the older base64 format", async () => {
    const k = await key();
    const original = img();
    const legacy = await sealText(k, JSON.stringify(original), original.id);
    await expect(openVaultImage(k, { id: original.id, enc: legacy })).resolves.toEqual(original);
  });

  it("falls back to the old format when data is not a base64 data URL", async () => {
    const k = await key();
    const odd = { ...img(), data: "blob:http://localhost/whatever" };
    const { enc, fmt } = await sealImage(k, odd);
    expect(fmt).toBeUndefined();
    expect(await openImage(k, { id: odd.id, enc, fmt })).toEqual(odd);
  });
});
