import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native Android shell around the web app. `webDir` is the Vite build; `npm run build`
 * followed by `npx cap sync android` copies it into the Android project.
 */
const config: CapacitorConfig = {
  appId: "com.snippetvault.app",
  appName: "SnippetVault",
  webDir: "dist",
  android: {
    minWebViewVersion: 105,
  },
  plugins: {
    // Android 15+ draws the app edge-to-edge. Let Capacitor pad the WebView natively so the
    // status bar never covers the page, and the bottom bar clears the gesture area.
    SystemBars: {
      insetsHandling: "native",
    },
    // Native Google sign-in; the credential is handed to the Firebase JS SDK (see hooks/auth.tsx).
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ["google.com"],
    },
  },
};

export default config;
