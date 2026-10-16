// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppLanding } from "../../hooks/ui";
import { WEB_BYPASS_KEY } from "../../lib/app";

/**
 * The small-screen gate, on a real (jsdom) DOM. The case that matters most is the *negative*
 * one: inside the installed app (standalone display mode, or the TWA's `android-app://`
 * referrer) the landing page must never appear, whatever the viewport says — getting that wrong
 * would hide the app from the app.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

type Gate = { show: boolean; continueOnWeb: () => void };

let roots: Root[] = [];

beforeEach(() => localStorage.clear());

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots = [];
  document.body.innerHTML = "";
});

/** jsdom has no matchMedia; answer only the queries the gate actually asks. */
function setMedia({ narrow = false, standalone = false, coarse = false }) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("display-mode")
      ? standalone
      : query.includes("max-width")
        ? narrow
        : query.includes("pointer")
          ? coarse
          : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const setUA = (ua: string) =>
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
const setReferrer = (referrer: string) =>
  Object.defineProperty(document, "referrer", { value: referrer, configurable: true });

function Probe({ result }: { result: (gate: Gate) => void }) {
  result(useAppLanding());
  return null;
}

/** Mount the hook and return a live reader for its latest value. */
function mountGate(): () => Gate {
  let latest!: Gate;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<Probe result={(g) => { latest = g; }} />));
  return () => latest;
}

describe("useAppLanding", () => {
  it("shows the landing page to a phone in a browser", () => {
    setUA(PHONE_UA); setReferrer(""); setMedia({ narrow: true });
    expect(mountGate()().show).toBe(true);
  });

  it("never shows it inside the installed app (standalone display mode)", () => {
    setUA(PHONE_UA); setReferrer(""); setMedia({ narrow: true, standalone: true });
    expect(mountGate()().show).toBe(false);
  });

  it("never shows it inside the Trusted Web Activity", () => {
    setUA(PHONE_UA); setReferrer("android-app://com.snippetvault.app"); setMedia({ narrow: true });
    expect(mountGate()().show).toBe(false);
  });

  it("leaves large screens alone", () => {
    setUA(PHONE_UA); setReferrer(""); setMedia({ narrow: false });
    expect(mountGate()().show).toBe(false);
  });

  it("leaves a narrowed desktop window alone", () => {
    setUA(DESKTOP_UA); setReferrer(""); setMedia({ narrow: true, coarse: false });
    expect(mountGate()().show).toBe(false);
  });

  it("treats a coarse pointer as a mobile device", () => {
    setUA(DESKTOP_UA); setReferrer(""); setMedia({ narrow: true, coarse: true });
    expect(mountGate()().show).toBe(true);
  });

  it("stops asking after a visitor continues on the web, and remembers it", () => {
    setUA(PHONE_UA); setReferrer(""); setMedia({ narrow: true });
    const gate = mountGate();
    expect(gate().show).toBe(true);
    act(() => gate().continueOnWeb());
    expect(gate().show).toBe(false);
    expect(localStorage.getItem(WEB_BYPASS_KEY)).toBe("1");
  });

  it("honours a previously saved opt-out", () => {
    localStorage.setItem(WEB_BYPASS_KEY, "1");
    setUA(PHONE_UA); setReferrer(""); setMedia({ narrow: true });
    expect(mountGate()().show).toBe(false);
  });
});
