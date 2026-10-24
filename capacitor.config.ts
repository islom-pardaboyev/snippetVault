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
    // Android 15+ draws the app edge-to-edge. Capacitor reports the system-bar sizes as CSS
    // variables (--safe-area-inset-top/bottom), and the header and bottom bar use them.
    SystemBars: {
      insetsHandling: "css",
    },
    // Native Google sign-in; the credential is handed to the Firebase JS SDK (see hooks/auth.tsx).
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ["google.com"],
    },
  },
};

export default config;
