import { describe, expect, it } from "vitest";
import { shouldShowAppLanding } from "../app";

describe("shouldShowAppLanding", () => {
  const phone = { standalone: false, narrowViewport: true, mobileDevice: true };
  const installedApp = { standalone: true, narrowViewport: true, mobileDevice: true };
  const desktop = { standalone: false, narrowViewport: false, mobileDevice: false };
  const narrowDesktopWindow = { standalone: false, narrowViewport: true, mobileDevice: false };
  const tablet = { standalone: false, narrowViewport: false, mobileDevice: true };

  it("shows the landing page to a phone browsing the site", () => {
    expect(shouldShowAppLanding(phone)).toBe(true);
  });

  it("never shows it inside the installed app — this is the mistake that must not happen", () => {
    expect(shouldShowAppLanding(installedApp)).toBe(false);
  });

  it("never shows it on a large screen, phone or not", () => {
    expect(shouldShowAppLanding(desktop)).toBe(false);
    expect(shouldShowAppLanding(tablet)).toBe(false);
  });

  it("ignores a narrowed desktop window", () => {
    expect(shouldShowAppLanding(narrowDesktopWindow)).toBe(false);
  });

  it("honours a visitor's opt-out everywhere", () => {
    expect(shouldShowAppLanding({ ...phone, bypassed: true })).toBe(false);
    expect(shouldShowAppLanding({ ...desktop, bypassed: true })).toBe(false);
    expect(shouldShowAppLanding({ ...installedApp, bypassed: true })).toBe(false);
  });
});
