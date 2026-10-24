import { Capacitor } from "@capacitor/core";

/** True inside the installed Android app (Capacitor WebView), false in a browser. */
export const isNativeApp = Capacitor.isNativePlatform();

/** An Android phone or tablet browsing the website, outside the app. */
export const isAndroidBrowser = !isNativeApp && typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

/** Where the Android build is served from the website (copied into `public/`). */
export const ANDROID_APK_URL = "/snippetvault.apk";

/**
 * Flip to true only after a signed APK is copied to `public/snippetvault.apk`. Until then the
 * site's SPA rewrite answers that URL with index.html, so the button would save an HTML page.
 */
export const ANDROID_APK_PUBLISHED = true;
