/** Re-paints favicon, touch icon and the web-app manifest in the user's accent colour. */
let manifestUrl: string | null = null;

function glyphPath(g: CanvasRenderingContext2D, size: number, scale: number) {
  const u = size / 64;
  const p = (x: number, y: number): [number, number] => [(32 + (x - 32) * scale) * u, (32 + (y - 32) * scale) * u];
  g.beginPath();
  let [x, y] = p(26, 20); g.moveTo(x, y);
  [x, y] = p(14, 32); g.lineTo(x, y);
  [x, y] = p(26, 44); g.lineTo(x, y);
  [x, y] = p(38, 20); g.moveTo(x, y);
  [x, y] = p(50, 32); g.lineTo(x, y);
  [x, y] = p(38, 44); g.lineTo(x, y);
}

function iconPng(size: number, accent: string, ink: string, maskable: boolean): string {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return "";
  g.fillStyle = accent;
  if (maskable) g.fillRect(0, 0, size, size);
  else {
    const r = size * 0.25;
    g.beginPath();
    g.moveTo(r, 0); g.arcTo(size, 0, size, size, r); g.arcTo(size, size, 0, size, r);
    g.arcTo(0, size, 0, 0, r); g.arcTo(0, 0, size, 0, r); g.closePath(); g.fill();
  }
  g.strokeStyle = ink;
  g.lineWidth = size * 0.086 * (maskable ? 0.78 : 1);
  g.lineCap = "round"; g.lineJoin = "round";
  glyphPath(g, size, maskable ? 0.62 : 0.8);
  g.stroke();
  return c.toDataURL("image/png");
}

function setLink(rel: string, href: string, type?: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) { el = document.createElement("link"); el.rel = rel; document.head.appendChild(el); }
  if (type) el.type = type;
  el.href = href;
}

export function applyBranding(accent: string, ink: string, themeColor: string) {
  try {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${accent}"/><path d="M26 20 14 32l12 12M38 20l12 12-12 12" fill="none" stroke="${ink}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    setLink("icon", "data:image/svg+xml," + encodeURIComponent(svg), "image/svg+xml");
    setLink("apple-touch-icon", iconPng(180, accent, ink, true));

    const origin = location.origin;
    const manifest = {
      id: "/", name: "SnippetVault", short_name: "Vault",
      description: "Your private, realtime code snippet vault.",
      start_url: origin + "/", scope: origin + "/", display: "standalone",
      background_color: "#0b0c0e", theme_color: themeColor, categories: ["developer", "productivity"],
      icons: [
        { src: iconPng(192, accent, ink, false), sizes: "192x192", type: "image/png" },
        { src: iconPng(512, accent, ink, false), sizes: "512x512", type: "image/png" },
        { src: iconPng(512, accent, ink, true), sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      shortcuts: [
        { name: "New snippet", url: "/new", icons: [{ src: iconPng(192, accent, ink, false), sizes: "192x192", type: "image/png" }] },
        { name: "Favourites", url: "/favorites", icons: [{ src: iconPng(192, accent, ink, false), sizes: "192x192", type: "image/png" }] },
      ],
      share_target: { action: "/new", method: "GET", params: { title: "title", text: "text", url: "url" } },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
    setLink("manifest", url);
    if (manifestUrl) URL.revokeObjectURL(manifestUrl);
    manifestUrl = url;
  } catch { /* branding is cosmetic; never break the app */ }
}
