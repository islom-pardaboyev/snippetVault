/**
 * A byte container: hides arbitrary bytes inside a *valid, lossless* PNG.
 *
 * The vault's hosted images are encrypted before they leave the device, so the bytes we need to
 * park on an image host are random ciphertext — not a picture. Image hosts (imgbb) only accept
 * real images, so we lay the bytes out as the pixels of an 8-bit greyscale PNG. The result is a
 * perfectly normal PNG that happens to carry our payload; nothing is ever displayed from it.
 *
 * Why a PNG: it is lossless, so a host that re-compresses the file (zlib) is harmless — the pixels
 * come back identical. A transform that *changes* pixels (resize, JPEG re-encode) is detected by
 * the caller with a SHA-256 check, so a corrupted blob is never mistaken for good data.
 */

const SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Pixels per row. Keeps the image squat (wide, few rows) for typical ~0.5 MB payloads. */
const WIDTH = 2048;

/* --------------------------------------------------------------- utils */

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

function u32be(n: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

const readU32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (CRC_TABLE = t);
}

function crc32(bytes: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const body = concat([new TextEncoder().encode(type), data]);
  return concat([u32be(data.length), body, u32be(crc32(body))]);
}

async function through(
  stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> },
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  // Start draining first, and mark the promise handled up-front: a corrupt compressed stream
  // rejects on BOTH sides, and an unobserved rejection there would escape as a test-runner error.
  const done = new Response(stream.readable).arrayBuffer();
  void done.catch(() => undefined);
  const writer = stream.writable.getWriter();
  try {
    await writer.write(data);
    await writer.close();
  } catch { /* surfaced by `done` below */ }
  return new Uint8Array(await done);
}

const deflate = (data: Uint8Array<ArrayBuffer>) => through(new CompressionStream("deflate"), data);
const inflate = (data: Uint8Array<ArrayBuffer>) => through(new DecompressionStream("deflate"), data);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/* ------------------------------------------------------------ pack / unpack */

/**
 * Wrap `data` in a lossless greyscale PNG.
 *
 * The pixels (row-major, one byte per pixel) are `u32be(data.length) || data`, zero-padded to a
 * whole number of rows. Keeping the length *inside* the pixels makes {@link unpackBytes} an exact
 * inverse of this function no matter how many rows of padding were needed — and nothing can strip
 * it, because it lives in the mandatory IDAT stream rather than in a chunk a host might drop.
 */
export async function packBytes(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const payload = concat([u32be(data.length), data]);
  const width = Math.min(WIDTH, Math.max(1, payload.length));
  const height = Math.max(1, Math.ceil(payload.length / width));
  const raw = new Uint8Array(height * (1 + width));
  for (let y = 0; y < height; y++) {
    const at = y * (1 + width);
    raw[at] = 0; // filter: None
    raw.set(payload.subarray(y * width, Math.min((y + 1) * width, payload.length)), at + 1);
  }
  const ihdr = concat([u32be(width), u32be(height), new Uint8Array([8, 0, 0, 0, 0])]);
  return concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array(0))]);
}

/**
 * Reverse of {@link packBytes}: the exact bytes that were wrapped in.
 *
 * Returns one byte per pixel (channel 0), tolerating a host that widened the image to RGB/RGBA
 * (all channels equal) by reading only the first channel. A file the host resized, re-encoded or
 * truncated fails loudly rather than returning garbage.
 */
export async function unpackBytes(png: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (png.length < 8) throw new Error("not-a-png");
  for (let i = 0; i < 8; i++) if (png[i] !== SIG[i]) throw new Error("not-a-png");

  let width = 0, height = 0, depth = 0, color = 0, interlace = 0;
  const idat: Uint8Array[] = [];
  let pos = 8;
  while (pos + 12 <= png.length) {
    const len = readU32(png, pos);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = readU32(data, 0); height = readU32(data, 4); depth = data[8]; color = data[9]; interlace = data[12]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }

  if (depth !== 8) throw new Error("unsupported-png");
  if (interlace !== 0) throw new Error("interlaced-png");
  const channels = color === 0 ? 1 : color === 2 ? 3 : color === 4 ? 2 : color === 6 ? 4 : 0;
  if (!channels || width < 1 || height < 1) throw new Error("unsupported-png");

  const raw = await inflate(concat(idat));
  const rowBytes = width * channels;
  const out = new Uint8Array(width * height);
  const prev = new Uint8Array(rowBytes);
  const cur = new Uint8Array(rowBytes);
  let rp = 0, op = 0;
  for (let y = 0; y < height; y++) {
    if (rp >= raw.length) throw new Error("truncated-png");
    const filter = raw[rp++];
    if (rp + rowBytes > raw.length) throw new Error("truncated-png");
    cur.set(raw.subarray(rp, rp + rowBytes)); rp += rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = cur[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      else if (filter !== 0) throw new Error("bad-filter");
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) out[op++] = cur[x * channels];
    prev.set(cur);
  }

  if (out.length < 4) throw new Error("truncated-png");
  const len = readU32(out, 0);
  if (out.length - 4 < len) throw new Error("truncated-png");
  const data = new Uint8Array(len);
  data.set(out.subarray(4, 4 + len));
  return data;
}
