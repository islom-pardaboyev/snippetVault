import { describe, expect, it } from "vitest";
import { ANDROID_APP_URL, APK_URL, shouldShowAppLanding } from "../app";

describe("android app links", () => {
  it("offers a working install target rather than an empty href", () => {
    expect(APK_URL).toBe("/snippetvault.apk");
    expect(ANDROID_APP_URL).not.toBe("");
    expect(ANDROID_APP_URL.startsWith("/") || /^https:\/\//.test(ANDROID_APP_URL)).toBe(true);
  });
});

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
