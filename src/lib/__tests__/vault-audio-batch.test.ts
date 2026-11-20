import { beforeEach, describe, expect, it, vi } from "vitest";
import { MOVE_OUT_AUDIO_ERROR, moveOutBlocker, storeAudioBatch } from "../vault-audio";

const host = vi.hoisted(() => ({ hasKey: true }));

vi.mock("../imgbb", () => ({
  hasImgbb: () => host.hasKey,
  uploadPng: async () => ({ url: "", delete_url: null }),
  fetchBlob: async () => new Uint8Array(),
  deleteHostedImage: async () => true,
}));

const file = (name: string, type = "audio/mpeg", size = 1000) => ({ name, type, size }) as File;

beforeEach(() => { host.hasKey = true; });

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
