import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteHostedImage } from "../imgbb";

/**
 * The one unsupported call in the app, exercised against a fake `fetch`:
 * the reverse-engineered imgbb removal request must be shaped exactly like the delete
 * page's own button sends it — and must never throw, hang, or fire for a URL that
 * isn't an ibb.co delete link, because a Firestore delete waits behind it.
 */

const fetchMock = vi.fn();

// Straight from the API docs' sample response.
const DELETE_URL = "https://ibb.co/2ndCYJK/670a7e48ddcb85ac340c717a41047e5c";

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ type: "opaque", ok: false, status: 0 });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deleteHostedImage", () => {
  it("POSTs the reverse-engineered form to ibb.co/json", async () => {
    await expect(deleteHostedImage(DELETE_URL)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ibb.co/json");
    expect(init.method).toBe("POST");
    // no-cors on purpose: ibb.co sends no CORS headers back, but a multipart POST is a
    // "simple" request, so the browser still delivers it — we just can't read the verdict.
    expect(init.mode).toBe("no-cors");
    expect(init.signal).toBeDefined();

    const form = init.body as FormData;
    expect(form.get("pathname")).toBe("/2ndCYJK/670a7e48ddcb85ac340c717a41047e5c");
    expect(form.get("action")).toBe("delete");
    expect(form.get("delete")).toBe("image");
    expect(form.get("from")).toBe("resource");
    expect(form.get("deleting[id]")).toBe("2ndCYJK");
    expect(form.get("deleting[hash]")).toBe("670a7e48ddcb85ac340c717a41047e5c");
  });

  it("tolerates a trailing slash", async () => {
    await expect(deleteHostedImage(`${DELETE_URL}/`)).resolves.toBe(true);
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get("pathname")).toBe("/2ndCYJK/670a7e48ddcb85ac340c717a41047e5c");
  });

  it("refuses anything that is not an https ibb.co delete_url, without a request", async () => {
    for (const bad of [
      "",
      "not a url",
      "https://example.com/2ndCYJK/670a7e48ddcb85ac340c717a41047e5c",
      "http://ibb.co/2ndCYJK/670a7e48ddcb85ac340c717a41047e5c",
      "https://ibb.co/only-one-segment",
      "https://ibb.co/a/b/c",
      "https://evilibb.co/2ndCYJK/670a7e48ddcb85ac340c717a41047e5c",
    ]) {
      expect(await deleteHostedImage(bad), bad).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports failure — but never throws — when the network refuses", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(deleteHostedImage(DELETE_URL)).resolves.toBe(false);
  });
});
