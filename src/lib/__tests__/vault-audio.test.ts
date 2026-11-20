import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveKek, newKdfParams, openBytes, sealBytes } from "../crypto";
import { packBytes, unpackBytes } from "../container";
import {
  AUDIO_MAX_BYTES, type AudioInfo, canonicalAudioType, checkAudioFile, openAudioBytes, openAudioInfo,
  readAudioDuration, sealAudio,
} from "../vault-audio";

/** Hosted-audio path against a fake imgbb. Never call the real host from tests. */

const host = vi.hoisted(() => ({
  online: true,
  mangle: false,
  /** When set, the host stores a *valid* PNG whose ciphertext has one flipped byte. */
  alter: false,
  hasKey: true,
  files: new Map<string, number[]>(),
}));

vi.mock("../imgbb", () => ({
  hasImgbb: () => host.hasKey,
  uploadPng: async (bytes: Uint8Array, name: string) => {
    if (!host.online) throw new Error("host-offline");
    let stored = Uint8Array.from(bytes);
    if (host.alter) {
      const { unpackBytes: unpack, packBytes: pack } = await import("../container");
      const ct = await unpack(stored);
      ct[ct.length >> 1] ^= 0xff;
      stored = Uint8Array.from(await pack(ct));
    }
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
  host.alter = false;
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
  it("accepts an empty type when the extension is audio", () => {
    expect(checkAudioFile({ name: "voice.m4a", type: "", size: 1000 })).toBeNull();
    expect(canonicalAudioType({ name: "voice.m4a", type: "" })).toBe("audio/mp4");
    expect(canonicalAudioType({ name: "x.opus", type: "" })).toBe("audio/ogg");
  });
  it("accepts MIME aliases and maps them onto a canonical type", () => {
    expect(checkAudioFile({ name: "a.mp3", type: "audio/mp3", size: 1000 })).toBeNull();
    expect(canonicalAudioType({ name: "a", type: "audio/mp3" })).toBe("audio/mpeg");
    for (const t of ["audio/wave", "audio/vnd.wave", "audio/x-wav"]) {
      expect(checkAudioFile({ name: "a.wav", type: t, size: 1 })).toBeNull();
    }
    expect(canonicalAudioType({ name: "a", type: "audio/wave" })).toBe("audio/wav");
    expect(checkAudioFile({ name: "a", type: "audio/aac", size: 1 })).toBeNull();
    expect(checkAudioFile({ name: "a", type: "audio/opus", size: 1 })).toBeNull();
  });
  it("still rejects video and an empty type with a non-audio extension", () => {
    expect(checkAudioFile({ name: "a.mp4", type: "video/mp4", size: 1000 })).toEqual(expect.any(String));
    expect(checkAudioFile({ name: "notes.txt", type: "", size: 1000 })).toEqual(expect.any(String));
    expect(checkAudioFile({ name: "voice.m4a", type: "video/mp4", size: 1000 })).toEqual(expect.any(String));
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

  it("rejects when the host returns a valid PNG holding altered bytes", async () => {
    host.alter = true;
    await expect(sealAudio(await key(), "aud-1", INFO, bytes())).rejects.toThrow("audio-host-failed");
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

  it("rejects a hosted file tampered with after upload (broken container)", async () => {
    const k = await key();
    const rec = await sealAudio(k, "aud-1", INFO, bytes());
    const url = rec.remote.url;
    host.files.set(url, host.files.get(url)!.map((b, i) => (i === 64 ? b ^ 0xff : b)));
    await expect(openAudioBytes(k, rec)).rejects.toThrow("hosted-audio-unavailable");
  });

  it("rejects a valid PNG with one flipped ciphertext byte through the length/SHA check", async () => {
    const k = await key();
    const rec = await sealAudio(k, "aud-1", INFO, bytes());
    const url = rec.remote.url;
    const ct = await unpackBytes(Uint8Array.from(host.files.get(url)!));
    ct[10] ^= 0x01; // same length, container still valid
    host.files.set(url, [...(await packBytes(ct))]);
    await expect(openAudioBytes(k, rec)).rejects.toThrow("hosted-audio-unavailable");
  });

  it("binds the record id: a swapped id fails to open, info and bytes", async () => {
    const k = await key();
    const rec = await sealAudio(k, "aud-1", INFO, bytes());
    const swapped = { ...rec, id: "other" };
    await expect(openAudioInfo(k, swapped)).rejects.toThrow();
    await expect(openAudioBytes(k, swapped)).rejects.toThrow();
  });

  it("audio sealed under one id does not open under another", async () => {
    const k = await key();
    const enc = await sealBytes(k, bytes(), "aud-1");
    await expect(openBytes(k, enc, "aud-2")).rejects.toThrow();
  });

  it("refuses the wrong key for info", async () => {
    const k = await key();
    const rec = await sealAudio(k, "aud-1", INFO, bytes());
    const wrong = await deriveKek("not the passphrase", newKdfParams(1_000));
    await expect(openAudioInfo(wrong, rec)).rejects.toThrow();
  });
});

describe("readAudioDuration", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  const stubUrl = () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: revoke });
    return revoke;
  };

  it("resolves 0 after the timeout when the element never reports, and cleans up", async () => {
    vi.useFakeTimers();
    const revoke = stubUrl();
    const el = {} as HTMLAudioElement;
    const p = readAudioDuration({} as File, () => el);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toBe(0);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(el.onloadedmetadata).toBeNull();
    expect(el.onerror).toBeNull();
  });

  it("resolves the duration and clears the timer when metadata loads", async () => {
    vi.useFakeTimers();
    const revoke = stubUrl();
    const el = { duration: 12.5 } as HTMLAudioElement;
    const p = readAudioDuration({} as File, () => el);
    el.onloadedmetadata?.(new Event("loadedmetadata"));
    expect(await p).toBe(12.5);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
