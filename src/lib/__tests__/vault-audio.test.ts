import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveKek, newKdfParams } from "../crypto";
import {
  AUDIO_MAX_BYTES, type AudioInfo, checkAudioFile, openAudioBytes, openAudioInfo, sealAudio,
} from "../vault-audio";

/** Hosted-audio path against a fake imgbb. Never call the real host from tests. */

const host = vi.hoisted(() => ({
  online: true,
  mangle: false,
  hasKey: true,
  files: new Map<string, number[]>(),
}));

vi.mock("../imgbb", () => ({
  hasImgbb: () => host.hasKey,
  uploadPng: async (bytes: Uint8Array, name: string) => {
    if (!host.online) throw new Error("host-offline");
    const stored = Uint8Array.from(bytes);
    if (host.mangle && stored.length > 80) stored[64] ^= 0xff;
    host.files.set(`https://img.test/${name}.png`, [...stored]);
    return { url: `https://img.test/${name}.png`, delete_url: null };
  },
  fetchBlob: async (url: string) => {
    const bytes = host.files.get(url);
    if (!bytes) throw new Error("404");
    return Uint8Array.from(bytes);
  },
  deleteHostedImage: async () => true,
}));

const INFO: AudioInfo = {
  name: "memo.mp3", mime: "audio/mpeg", size: 2000, duration: 12.5, created_at: "2026-01-01T00:00:00.000Z",
};
const bytes = () => Uint8Array.from({ length: 2000 }, (_, i) => (i * 31 + 7) & 255);
const key = () => deriveKek("test passphrase", newKdfParams(1_000));

beforeEach(() => {
  host.online = true;
  host.mangle = false;
  host.hasKey = true;
  host.files.clear();
});

describe("checkAudioFile", () => {
  it("rejects a non-audio type, an empty file and an oversized file", () => {
    expect(checkAudioFile({ name: "a.mp4", type: "video/mp4", size: 1000 })).toEqual(expect.any(String));
    expect(checkAudioFile({ name: "a.mp3", type: "audio/mpeg", size: 0 })).toEqual(expect.any(String));
    expect(checkAudioFile({ name: "a.mp3", type: "audio/mpeg", size: AUDIO_MAX_BYTES + 1 })).toEqual(expect.any(String));
  });
  it("accepts a valid audio file", () => {
    expect(checkAudioFile({ name: "a.mp3", type: "audio/mpeg", size: 1000 })).toBeNull();
  });
});

describe("hosted vault audio", () => {
  it("round trips bytes and info, storing a pointer only", async () => {
    const k = await key();
    const src = bytes();
    const rec = await sealAudio(k, "aud-1", INFO, src);
    expect(rec.remote.url).toBeTruthy();
    expect(rec.remote.sha).toBeTruthy();
    expect(rec.remote.bytes).toBeGreaterThan(0);
    expect("enc" in rec).toBe(false);
    expect(await openAudioBytes(k, rec)).toEqual(src);
    expect(await openAudioInfo(k, rec)).toEqual(INFO);
  });

  it("rejects when the host mangles the file", async () => {
    host.mangle = true;
    await expect(sealAudio(await key(), "aud-1", INFO, bytes())).rejects.toThrow("audio-host-failed");
  });

  it("rejects when the host is offline", async () => {
    host.online = false;
    await expect(sealAudio(await key(), "aud-1", INFO, bytes())).rejects.toThrow("audio-host-failed");
  });

  it("rejects without an imgbb key", async () => {
    host.hasKey = false;
    await expect(sealAudio(await key(), "aud-1", INFO, bytes())).rejects.toThrow("audio-needs-host");
  });

  it("rejects a hosted file tampered with after upload", async () => {
    const k = await key();
    const rec = await sealAudio(k, "aud-1", INFO, bytes());
    const url = rec.remote.url;
    host.files.set(url, host.files.get(url)!.map((b, i) => (i === 64 ? b ^ 0xff : b)));
    await expect(openAudioBytes(k, rec)).rejects.toThrow("hosted-audio-unavailable");
  });

  it("refuses the wrong key for info", async () => {
    const k = await key();
    const rec = await sealAudio(k, "aud-1", INFO, bytes());
    const wrong = await deriveKek("not the passphrase", newKdfParams(1_000));
    await expect(openAudioInfo(wrong, rec)).rejects.toThrow();
  });
});
