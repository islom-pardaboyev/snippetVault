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
};

export default config;
