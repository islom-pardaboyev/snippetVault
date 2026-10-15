import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
});
