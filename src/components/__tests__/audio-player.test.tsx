// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioPlayer } from "../AudioPlayer";
import type { AudioInfo } from "../../lib/vault-audio";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const info = (duration: number): AudioInfo => ({
  name: "memo.mp3", mime: "audio/mpeg", size: 10, duration, created_at: "2026-01-01T00:00:00Z",
});

let root: Root | null = null;
let host: HTMLElement | null = null;

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

async function mount(ui: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(ui); });
  return host;
}

const button = (label: string) =>
  [...host!.querySelectorAll("button")].find((b) => b.textContent?.includes(label) || b.getAttribute("aria-label") === label)!;

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null; host = null;
  vi.restoreAllMocks();
});

describe("AudioPlayer", () => {
  it("shows the file name and a formatted duration", async () => {
    await mount(<AudioPlayer info={info(3725)} load={vi.fn()} />);
    expect(host!.textContent).toContain("memo.mp3");
    expect(host!.textContent).toContain("1:02:05");
    act(() => root!.unmount());
    root = createRoot(host!);
    await act(async () => { root!.render(<AudioPlayer info={info(65)} load={vi.fn()} />); });
    expect(host!.textContent).toContain("1:05");
  });

  it("loads only when play is pressed, and only once", async () => {
    const load = vi.fn().mockResolvedValue(new Blob(["x"], { type: "audio/mpeg" }));
    await mount(<AudioPlayer info={info(65)} load={load} />);
    expect(load).not.toHaveBeenCalled();
    await act(async () => { button("Play").click(); });
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("shows Unavailable when load rejects and Retry loads again", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValue(new Blob(["x"], { type: "audio/mpeg" }));
    await mount(<AudioPlayer info={info(65)} load={load} />);
    await act(async () => { button("Play").click(); });
    await flush();
    expect(host!.textContent).toContain("Unavailable");
    await act(async () => { button("Retry").click(); });
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(host!.textContent).not.toContain("Unavailable");
  });

  it("revokes the object URL on unmount", async () => {
    const load = vi.fn().mockResolvedValue(new Blob(["x"], { type: "audio/mpeg" }));
    await mount(<AudioPlayer info={info(65)} load={load} />);
    await act(async () => { button("Play").click(); });
    await flush();
    act(() => root!.unmount());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
    root = createRoot(host!);
  });
});
