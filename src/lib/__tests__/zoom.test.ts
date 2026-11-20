import { describe, expect, it } from "vitest";
import { MAX_SCALE, MIN_SCALE, anchorZoom, clampScale, clampView, type Box, type View } from "../zoom";

/** A 400x300 frame holding an image that is displayed at 400x200. */
const BOX: Box = { cw: 400, ch: 300, w: 400, h: 200 };
const HOME: View = { scale: 1, x: 0, y: 0 };

describe("clampScale", () => {
  it("stays inside the allowed range", () => {
    expect(clampScale(0.2)).toBe(MIN_SCALE);
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(clampScale(2.5)).toBe(2.5);
  });

  it("falls back to the minimum for NaN", () => {
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
  });
});

describe("clampView", () => {
  it("pins the picture to the centre at 1x", () => {
    expect(clampView({ scale: 1, x: 80, y: -40 }, BOX)).toEqual(HOME);
  });

  it("lets a zoomed picture pan only until its edge meets the frame edge", () => {
    // 3x of a 400px-wide image is 1200px: it can move 400px either way inside a 400px frame.
    expect(clampView({ scale: 3, x: 9999, y: 0 }, BOX).x).toBe(400);
    expect(clampView({ scale: 3, x: -9999, y: 0 }, BOX).x).toBe(-400);
    // 3x of a 200px-tall image is 600px in a 300px frame: 150px either way.
    expect(clampView({ scale: 3, x: 0, y: 9999 }, BOX).y).toBe(150);
  });

  it("does not let a picture that is still smaller than the frame drift", () => {
    // 1.2x of 200px is 240px, still shorter than the 300px frame.
    expect(clampView({ scale: 1.2, x: 0, y: 50 }, BOX).y).toBe(0);
  });

  it("clamps an out-of-range scale too", () => {
    expect(clampView({ scale: 50, x: 0, y: 0 }, BOX).scale).toBe(MAX_SCALE);
  });
});

describe("anchorZoom", () => {
  it("keeps the point under the finger fixed when zooming", () => {
    // Zoom from 1x to 2x around a point 100px right of and 50px below the centre.
    const v = anchorZoom(HOME, { x: 100, y: 50 }, { x: 100, y: 50 }, 2, BOX);
    expect(v).toEqual({ scale: 2, x: -100, y: -50 });
  });

  it("returns to the centre when zoomed all the way out", () => {
    const zoomed = anchorZoom(HOME, { x: 100, y: 50 }, { x: 100, y: 50 }, 3, BOX);
    expect(anchorZoom(zoomed, { x: 100, y: 50 }, { x: 100, y: 50 }, 1, BOX)).toEqual(HOME);
  });

  it("pans when the point moves and the scale stays the same", () => {
    const v = anchorZoom({ scale: 2, x: 0, y: 0 }, { x: 0, y: 0 }, { x: 30, y: -20 }, 2, BOX);
    expect(v).toEqual({ scale: 2, x: 30, y: -20 });
  });

  it("keeps panning inside the frame", () => {
    const v = anchorZoom({ scale: 2, x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5000, y: 0 }, 2, BOX);
    expect(v.x).toBe(200);
  });

  it("handles a pinch: zoom and drag together", () => {
    // Fingers start around (50, 0) and move together to (60, 0) while spreading 1.5x.
    const v = anchorZoom({ scale: 2, x: 10, y: 0 }, { x: 50, y: 0 }, { x: 60, y: 0 }, 3, BOX);
    expect(v.scale).toBe(3);
    expect(v.x).toBe(60 - 1.5 * (50 - 10));
  });

  it("ignores a NaN scale instead of poisoning the view", () => {
    const v = anchorZoom(HOME, { x: 0, y: 0 }, { x: 0, y: 0 }, Number.NaN, BOX);
    expect(v).toEqual(HOME);
  });

  it("is safe before layout, when every size is zero", () => {
    const v = anchorZoom(HOME, { x: 10, y: 10 }, { x: 10, y: 10 }, 2, { cw: 0, ch: 0, w: 0, h: 0 });
    expect(v).toEqual({ scale: 2, x: 0, y: 0 });
  });
});
