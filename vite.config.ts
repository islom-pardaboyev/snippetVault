import { createHash } from "node:crypto";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Admin passcode: write it as plain text in .env as ADMIN_PASSCODE. It is hashed here,
 * at build time, so only its SHA-256 is shipped in the site's JavaScript.
 */
function passcodeHash(mode: string): string {
  const env = loadEnv(mode, process.cwd(), "");
  const raw = (env.ADMIN_PASSCODE || "").trim();
  if (!raw) return "";
  return /^[0-9a-f]{64}$/i.test(raw) ? raw.toLowerCase() : createHash("sha256").update(raw).digest("hex");
}

export default defineConfig(({ mode }) => ({
  define: { __ADMIN_HASH__: JSON.stringify(passcodeHash(mode)) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "SnippetVault",
        short_name: "Vault",
        description: "Your private, realtime code snippet vault.",
        theme_color: "#0a0b0d",
        background_color: "#0a0b0d",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        categories: ["developer", "productivity"],
        share_target: { action: "/new", method: "GET", params: { title: "title", text: "text", url: "url" } } as never,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml" },
        ],
        shortcuts: [
          { name: "New snippet", url: "/new", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
          { name: "Favourites", url: "/favorites", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/__\//],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
}));
