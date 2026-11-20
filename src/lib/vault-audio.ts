import { type Sealed, fromBase64, openBytes, openText, sealBytes, sealText, sha256, toBase64 } from "./crypto";
import { packBytes, unpackBytes } from "./container";
import { fetchBlob, hasImgbb, uploadPng } from "./imgbb";
import type { VaultImageRemote } from "./vault";

/**
 * Encrypted audio for the Vault. Same pipeline as hosted vault images (seal, wrap in a PNG,
 * upload, download, hash-compare), but audio is never stored inline: if it can't be hosted and
 * verified, sealing fails. The descriptive `meta` is sealed separately with AAD `${id}:meta`;
 * the audio bytes are sealed with AAD `id`.
 */

export const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
export const AUDIO_TYPES: readonly string[] = [
  "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm",
];

export interface AudioInfo {
  name: string;
  mime: string;
  size: number;
  /** Seconds; 0 when unknown. */
  duration: number;
  created_at: string;
}

export interface VaultAudio {
  id: string;
  /** {@link AudioInfo} as sealed JSON. */
  meta: Sealed;
  remote: VaultImageRemote;
}

/** `created_at` is the one plaintext field; it only exists so the list can be sorted. */
export interface VaultGalleryAudio extends VaultAudio {
  created_at: string;
}

export function checkAudioFile(file: { name: string; type: string; size: number }): string | null {
  if (!AUDIO_TYPES.includes(file.type)) return "That file is not a supported audio type (MP3, M4A, OGG, WAV or WebM).";
  if (file.size <= 0) return "That audio file is empty.";
  if (file.size > AUDIO_MAX_BYTES) return "That audio file is larger than 25 MB.";
  return null;
}

export async function sealAudio(
  key: CryptoKey, id: string, info: AudioInfo, bytes: Uint8Array<ArrayBuffer>,
): Promise<VaultAudio> {
  if (!hasImgbb()) throw new Error("audio-needs-host");
  const meta = await sealText(key, JSON.stringify(info), `${id}:meta`);
  const enc = await sealBytes(key, bytes, id);
  try {
    const ct = fromBase64(enc.ct);
    const sha = await sha256(ct);
    const { url, delete_url } = await uploadPng(await packBytes(ct), id);
    const round = await unpackBytes(await fetchBlob(url));
    if ((await sha256(round)) !== sha) throw new Error("host-changed-the-bytes");
    return { id, meta, remote: { url, iv: enc.iv, sha, bytes: ct.length, delete_url } };
  } catch {
    throw new Error("audio-host-failed");
  }
}

export async function openAudioInfo(key: CryptoKey, audio: VaultAudio): Promise<AudioInfo> {
  return JSON.parse(await openText(key, audio.meta, `${audio.id}:meta`)) as AudioInfo;
}

export async function openAudioBytes(key: CryptoKey, audio: VaultAudio): Promise<Uint8Array<ArrayBuffer>> {
  const { url, iv, sha, bytes } = audio.remote;
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = await unpackBytes(await fetchBlob(url));
  } catch {
    throw new Error("hosted-audio-unavailable");
  }
  if (raw.length !== bytes || (await sha256(raw)) !== sha) throw new Error("hosted-audio-unavailable");
  return openBytes(key, { v: 1, iv, ct: toBase64(raw) }, audio.id);
}

/** Audio length in seconds, or 0 when the browser can't read it. */
export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    const done = (n: number) => { URL.revokeObjectURL(url); resolve(Number.isFinite(n) && n > 0 ? n : 0); };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(0);
    el.src = url;
  });
}
