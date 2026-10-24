import { Capacitor } from "@capacitor/core";

/** True inside the installed Android app (Capacitor WebView), false in a browser. */
export const isNativeApp = Capacitor.isNativePlatform();

/** An Android phone or tablet browsing the website, outside the app. */
export const isAndroidBrowser = !isNativeApp && typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

/** Where the Android build is served from the website (copied into `public/`). */
export const ANDROID_APK_URL = "/snippetvault.apk";
