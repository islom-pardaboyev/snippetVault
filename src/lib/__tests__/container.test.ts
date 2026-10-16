import { describe, expect, it } from "vitest";
import { packBytes, unpackBytes } from "../container";

/**
 * The container is what makes hosted vault images possible: it smuggles ciphertext through an
 * image host as the pixels of a valid PNG. The tests below check the two promises that matter —
 * exact round trips, and survival of the one transform hosts are known to apply (widening the
 * colour type).
 */

const SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Incompressible test payload. Chunked because `getRandomValues` caps at 64 KiB per call. */
function bytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  for (let at = 0; at < n; at += 65_536) crypto.getRandomValues(out.subarray(at, Math.min(at + 65_536, n)));
  return out;
}

describe("packBytes / unpackBytes", () => {
  it("starts with the PNG signature", async () => {
    const png = await packBytes(new Uint8Array([1, 2, 3]));
    expect([...png.slice(0, 8)]).toEqual([...SIG]);
    expect(new TextDecoder().decode(png.slice(12, 16))).toBe("IHDR");
  });

  it("round-trips payloads of every shape, including row boundaries", async () => {
    // 2048 is the container's pixel-per-row value, so sizes either side of it are the interesting ones.
    for (const n of [0, 1, 2, 2047, 2048, 2049, 4096, 4112, 100_000]) {
      const data = bytes(n);
      await expect(unpackBytes(await packBytes(data))).resolves.toEqual(data);
    }
  });

  it("keeps the file close to the payload size (random ciphertext does not compress)", async () => {
    const data = bytes(64 * 1024);
    const png = await packBytes(data);
    // Only the 4-byte length header, one filter byte per 2048 pixels and the zlib/chunk framing.
    expect(png.length).toBeLessThan(data.length + 4096);
  });

  it("survives a host widening the image to RGB or RGBA", async () => {
    const data = bytes(9000);
    const png = await packBytes(data);
    for (const channels of [3, 4]) {
      const widened = await widen(png, channels);
      await expect(unpackBytes(widened)).resolves.toEqual(data);
    }
  });

  it("survives a host recompressing the IDAT stream losslessly", async () => {
    const data = bytes(50_000);
    const png = await packBytes(data);
    const { ihdr, idat } = parse(png);
    const rebuilt = assemble(ihdr, await deflate(await inflate(idat)));
    await expect(unpackBytes(rebuilt)).resolves.toEqual(data);
  });

  it("rejects a file that isn't a PNG", async () => {
    await expect(unpackBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).rejects.toThrow("not-a-png");
    await expect(unpackBytes(new Uint8Array(4))).rejects.toThrow("not-a-png");
  });

  it("rejects a PNG whose pixels were resampled by a resize", async () => {
    const png = await packBytes(bytes(9000));
    const { ihdr, idat } = parse(png);
    // Halving the width re-slices the same IDAT rows, so row lengths no longer match the filter stream.
    const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
    view.setUint32(0, view.getUint32(0) / 2);
    await expect(unpackBytes(assemble(ihdr, idat))).rejects.toThrow();
  });

  it("rejects a PNG with the payload bytes removed", async () => {
    const png = await packBytes(bytes(3000));
    const { ihdr, idat } = parse(png);
    await expect(unpackBytes(assemble(ihdr, idat.slice(0, 4)))).rejects.toThrow();
  });
});

/* ------------------------------------------------------------- test helpers */

const readU32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pump(new CompressionStream("deflate"), bytes);
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pump(new DecompressionStream("deflate"), bytes);
}

/** Drive a compression stream to completion; errors reject the returned promise, never escape. */
async function pump(
  stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> },
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const done = new Response(stream.readable).arrayBuffer();
  void done.catch(() => undefined);
  const w = stream.writable.getWriter();
  try {
    await w.write(new Uint8Array(bytes));
    await w.close();
  } catch { /* surfaced by `done` below */ }
  return new Uint8Array(await done);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunkOf(type: string, data: Uint8Array): Uint8Array {
  const body = concat([new TextEncoder().encode(type), data]);
  const head = new DataView(new Uint8Array(4).buffer);
  head.setUint32(0, data.length);
  const tail = new DataView(new Uint8Array(4).buffer);
  tail.setUint32(0, crc32(body));
  return concat([new Uint8Array(head.buffer), body, new Uint8Array(tail.buffer)]);
}

/** Split a container PNG into its IHDR and IDAT (the only two chunks the format uses). */
function parse(png: Uint8Array): { ihdr: Uint8Array; idat: Uint8Array } {
  const ihdr = png.slice(16, 29);
  let pos = 8;
  const idat: Uint8Array[] = [];
  while (pos + 12 <= png.length) {
    const len = readU32(png, pos);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    if (type === "IDAT") idat.push(png.slice(pos + 8, pos + 8 + len));
    if (type === "IEND") break;
    pos += 12 + len;
  }
  return { ihdr, idat: concat(idat) };
}

function assemble(ihdr: Uint8Array, idat: Uint8Array, colorType = 0): Uint8Array {
  const withType = Uint8Array.from(ihdr);
  withType[9] = colorType;
  return concat([SIG, chunkOf("IHDR", withType), chunkOf("IDAT", idat), chunkOf("IEND", new Uint8Array(0))]);
}

/** Repaint a greyscale container as `channels` equal bytes per pixel — what hosts do on upload. */
async function widen(png: Uint8Array, channels: number): Promise<Uint8Array> {
  const { ihdr, idat } = parse(png);
  const width = readU32(ihdr, 0);
  const height = readU32(ihdr, 4);
  const raw = await inflate(idat);
  const out = new Uint8Array(height * (1 + width * channels));
  for (let y = 0; y < height; y++) {
    const src = y * (1 + width);
    const dst = y * (1 + width * channels);
    out[dst] = raw[src]; // filters are written as None, so they pass through unchanged
    for (let x = 0; x < width; x++) {
      const v = raw[src + 1 + x];
      for (let c = 0; c < channels; c++) out[dst + 1 + x * channels + c] = v;
    }
  }
  return assemble(ihdr, await deflate(out), channels === 3 ? 2 : 6);
}
