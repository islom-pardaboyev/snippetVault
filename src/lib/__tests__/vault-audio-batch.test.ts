import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIO_SAVE_ERROR, MOVE_OUT_AUDIO_ERROR, moveOutBlocker, saveOrPurge, storeAudioBatch, type VaultAudio } from "../vault-audio";

const host = vi.hoisted(() => ({ hasKey: true, deleted: [] as string[] }));

vi.mock("../imgbb", () => ({
  hasImgbb: () => host.hasKey,
  uploadPng: async () => ({ url: "", delete_url: null }),
  fetchBlob: async () => new Uint8Array(),
  deleteHostedImage: async (u: string) => { host.deleted.push(u); return true; },
}));

const file = (name: string, type = "audio/mpeg", size = 1000) => ({ name, type, size }) as File;

beforeEach(() => { host.hasKey = true; host.deleted = []; });

describe("storeAudioBatch", () => {
  it("refuses with a message about IMB_API when no host is configured", async () => {
    host.hasKey = false;
    const store = vi.fn();
    const r = await storeAudioBatch([file("a.mp3")], store);
    expect(r.added).toBe(0);
    expect(r.error).toMatch(/IMB_API/);
    expect(store).not.toHaveBeenCalled();
  });

  it("skips invalid files with an error but still stores the valid ones", async () => {
    const stored: string[] = [];
    const r = await storeAudioBatch(
      [file("a.mp3"), file("b.txt", "text/plain"), file("c.mp3")],
      async (f) => { stored.push(f.name); },
    );
    expect(stored).toEqual(["a.mp3", "c.mp3"]);
    expect(r.added).toBe(2);
    expect(r.error).toContain("b.txt");
  });

  it("counts exactly the records written when a later file fails", async () => {
    const r = await storeAudioBatch(
      [file("a.mp3"), file("b.mp3"), file("c.mp3")],
      async (f) => { if (f.name === "b.mp3") throw new Error("audio-host-failed"); },
    );
    expect(r.added).toBe(2);
    expect(r.error).toContain("b.mp3");
  });

  it("returns no error when everything is stored", async () => {
    expect(await storeAudioBatch([file("a.mp3")], async () => {})).toEqual({ added: 1 });
  });

  it("reports when there is nothing to add", async () => {
    const r = await storeAudioBatch([], async () => {});
    expect(r.added).toBe(0);
    expect(r.error).toEqual(expect.any(String));
  });
});

describe("failed saves", () => {
  it("reports a Firestore save failure distinctly from a hosting failure", async () => {
    const r = await storeAudioBatch([file("a.mp3")], async () => { throw new Error("audio-save-failed"); });
    expect(r.error).toContain(AUDIO_SAVE_ERROR);
    expect(r.error).not.toMatch(/encrypted and hosted/);
  });

  it("saveOrPurge deletes the hosted blob when the put fails, and rethrows", async () => {
    const sealed = { id: "a", meta: { iv: "", ct: "" }, remote: { url: "u", iv: "", sha: "", bytes: 1, delete_url: "https://ibb.co/x/y" } } as VaultAudio;
    await expect(saveOrPurge(sealed, async () => { throw new Error("permission-denied"); })).rejects.toThrow("audio-save-failed");
    expect(host.deleted).toEqual(["https://ibb.co/x/y"]);
  });
});

describe("moveOutBlocker", () => {
  it("refuses an item that holds audio", () => {
    expect(moveOutBlocker(2)).toBe(MOVE_OUT_AUDIO_ERROR);
    expect(MOVE_OUT_AUDIO_ERROR).toBe("Remove this item's audio first. Normal snippets can't hold audio.");
  });
  it("allows an item with no audio", () => {
    expect(moveOutBlocker(0)).toBeNull();
    expect(moveOutBlocker(undefined)).toBeNull();
  });
});
