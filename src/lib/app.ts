/**
 * Android app distribution + the small-screen gate.
 *
 * SnippetVault is designed for a large screen. On a *phone's browser* the site shows a landing
 * page inviting the visitor to install the Android app instead; bigger screens get the full web
 * app. The installed app itself (TWA or an added-to-home-screen PWA) always sees the real app —
 * it reports a standalone display mode, so the gate can never hide the app from the app.
 *
 * The policy lives in `shouldShowAppLanding()` and is deliberately side-effect free so it can be
 * unit-tested; `useAppLanding()` in `hooks/ui.tsx` supplies the live browser signals.
 */

/**
 * The signed release APK published alongside the site (kept in `public/`, served from the site's
 * own origin so the download needs no third party). Rebuild it with `bubblewrap build` inside
 * `android/` and copy it here — see SETUP.md → *Small screens*.
 */
export const APK_URL = "/snippetvault.apk";

/** The file a "Download APK" link should save as. */
export const APK_FILE = "SnippetVault.apk";

/**
 * Where "Install the app" sends a phone visitor. Defaults to the APK served by this site, which
 * works today; set VITE_ANDROID_APP_URL to your Play listing once the app is published.
 * (Play listing form: https://play.google.com/store/apps/details?id=com.snippetvault.app)
 */
export const ANDROID_APP_URL =
  (import.meta.env.VITE_ANDROID_APP_URL ?? "").trim() || APK_URL;

/** True while the CTA points at a file to download rather than a store page. */
export const ANDROID_URL_IS_APK = ANDROID_APP_URL.endsWith(".apk");

/** The app is never offered a window narrower than this; at or above it the full site is shown. */
export const LANDING_MIN_WIDTH = 768;

/** Set when a phone visitor chooses to keep using the web app, so we stop asking. */
export const WEB_BYPASS_KEY = "sv:mobile-web";

export type LandingInput = {
  /** The page is running as the installed app (standalone / TWA), not in a browser tab. */
  standalone: boolean;
  /** The viewport is phone-sized: narrower than LANDING_MIN_WIDTH. */
  narrowViewport: boolean;
  /** The device is a phone/tablet, not a desktop window that happens to be narrow. */
  mobileDevice: boolean;
  /** The visitor already dismissed the landing page on this device. */
  bypassed?: boolean;
};

/** Should this visit get the "install the app" landing page instead of the web app? */
export function shouldShowAppLanding({
  standalone,
  narrowViewport,
  mobileDevice,
  bypassed = false,
}: LandingInput): boolean {
  return !standalone && !bypassed && narrowViewport && mobileDevice;
}
