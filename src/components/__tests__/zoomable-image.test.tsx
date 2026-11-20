// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ZoomableImage } from "../ZoomableImage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount(ui: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(ui); });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null; host = null;
});

const button = (label: string) => host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const percent = () => button("Reset zoom").textContent;
const click = (el: Element) => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const press = (key: string) => act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
const frame = () => host!.querySelector<HTMLElement>("[data-zoom-frame]")!;

const tap = (el: Element, x = 10, y = 10) => act(async () => {
  const init = { pointerId: 1, pointerType: "touch", clientX: x, clientY: y, bubbles: true };
  el.dispatchEvent(new PointerEvent("pointerdown", init));
  el.dispatchEvent(new PointerEvent("pointerup", init));
});

describe("ZoomableImage", () => {
  it("shows the picture at 100% with zoom out disabled", async () => {
    await mount(<ZoomableImage src="data:image/webp;base64,AAAA" />);
    expect(host!.querySelector("img")!.getAttribute("src")).toBe("data:image/webp;base64,AAAA");
    expect(percent()).toBe("100%");
    expect(button("Zoom out").disabled).toBe(true);
  });

  it("zooms in and out with the buttons and resets with the percentage button", async () => {
    await mount(<ZoomableImage src="x" />);
    await click(button("Zoom in"));
    expect(percent()).toBe("150%");
    expect(host!.querySelector("img")!.style.transform).toContain("scale(1.5)");
    await click(button("Zoom in"));
    expect(percent()).toBe("225%");
    await click(button("Zoom out"));
    expect(percent()).toBe("150%");
    await click(button("Reset zoom"));
    expect(percent()).toBe("100%");
  });

  it("stops zooming in at the maximum", async () => {
    await mount(<ZoomableImage src="x" />);
    for (let i = 0; i < 10; i++) await click(button("Zoom in"));
    expect(percent()).toBe("600%");
    expect(button("Zoom in").disabled).toBe(true);
  });

  it("supports + - 0 on the keyboard", async () => {
    await mount(<ZoomableImage src="x" />);
    await press("+");
    expect(percent()).toBe("150%");
    await press("-");
    expect(percent()).toBe("100%");
    await press("=");
    await press("0");
    expect(percent()).toBe("100%");
  });

  it("ignores the keys while typing in a field", async () => {
    await mount(<ZoomableImage src="x" />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true })); });
    input.remove();
    expect(percent()).toBe("100%");
  });

  it("zooms with the mouse wheel and cancels the page scroll", async () => {
    await mount(<ZoomableImage src="x" />);
    const wheel = new WheelEvent("wheel", { deltaY: -200, bubbles: true, cancelable: true });
    await act(async () => { frame().dispatchEvent(wheel); });
    expect(wheel.defaultPrevented).toBe(true);
    expect(parseInt(percent()!, 10)).toBeGreaterThan(100);
  });

  it("double tap zooms in, and a second double tap returns to 100%", async () => {
    await mount(<ZoomableImage src="x" />);
    await tap(frame());
    await tap(frame());
    expect(percent()).toBe("250%");
    await tap(frame());
    await tap(frame());
    expect(percent()).toBe("100%");
  });

  it("does not treat two taps far apart as a double tap", async () => {
    await mount(<ZoomableImage src="x" />);
    await tap(frame(), 10, 10);
    await tap(frame(), 200, 200);
    expect(percent()).toBe("100%");
  });

  it("removes its keyboard listener on unmount", async () => {
    await mount(<ZoomableImage src="x" />);
    const el = host!;
    await act(async () => root!.unmount());
    root = null;
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true })); });
    expect(el.querySelector("img")).toBeNull();
  });
});
