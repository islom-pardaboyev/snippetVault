import { highlightLines } from "./highlight";

/**
 * Renders a snippet to a PNG on a canvas, using the app's current theme colours
 * and the same highlighter as the UI. No third-party dependencies.
 */

export interface CodeImageOptions {
  code: string;
  lang: string;
  title?: string;
  lineNumbers?: boolean;
  maxLines?: number;
  scale?: number;
}

interface Segment { text: string; cls?: string; }

const MONO = '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace';

/** Turn a line of highlighter HTML into ordered, coloured text segments. */
function parseLine(html: string): Segment[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  const out: Segment[] = [];
  if (!root) return out;
  const walk = (node: Node, cls?: string) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const text = n.textContent ?? "";
        if (text) out.push({ text, cls });
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as Element;
        const m = /t-([a-z]+)/.exec(el.getAttribute("class") ?? "");
        walk(el, m ? m[1] : cls);
      }
    });
  };
  walk(root);
  return out;
}

function palette() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--bg", "#0c0c0d"),
    surface: v("--surface", "#131315"),
    line: v("--line", "#242428"),
    muted: v("--muted", "#8e8e96"),
    faint: v("--faint", "#5d5d65"),
    ink: v("--text", "#ededee"),
    accent: v("--accent", "#ededee"),
    tok: {
      kw: v("--t-kw", "#b9a6e6"), str: v("--t-str", "#9fc79b"), num: v("--t-num", "#dcae78"),
      fn: v("--t-fn", "#93b4e6"), com: v("--t-com", "#5d5d65"), prop: v("--t-prop", "#93b4e6"),
      tag: v("--t-tag", "#e69a9a"), type: v("--t-type", "#dccb97"),
    } as Record<string, string>,
  };
}

export async function renderSnippetPng(opts: CodeImageOptions): Promise<Blob> {
  const scale = opts.scale ?? 2;
  const maxLines = opts.maxLines ?? 200;
  const showNums = opts.lineNumbers ?? true;
  const p = palette();

  const lines = highlightLines(opts.code.replace(/\n$/, ""), opts.lang);
  const truncated = lines.length > maxLines ? lines.length - maxLines : 0;
  const shown = truncated ? lines.slice(0, maxLines) : lines;

  const fontSize = 13;
  const lineHeight = 21;
  const padX = 22;
  const padY = 18;
  const titleH = 40;
  const numW = showNums ? 34 : 0;

  try { await document.fonts.load(`${fontSize}px ${MONO}`); } catch { /* fall back */ }
  try { await document.fonts.ready; } catch { /* ignore */ }

  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `${fontSize}px ${MONO}`;

  const parsed = shown.map((l) => parseLine(l));
  let contentW = 0;
  for (const segs of parsed) {
    let w = 0;
    for (const s of segs) w += measure.measureText(s.text).width;
    if (w > contentW) contentW = w;
  }

  const width = Math.min(Math.max(360, Math.ceil(contentW) + numW + padX * 2), 1600);
  const height = titleH + padY * 2 + shown.length * lineHeight + (truncated ? lineHeight + 6 : 0);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.textBaseline = "middle";
  ctx.font = `${fontSize}px ${MONO}`;

  // background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, width, height);

  // title bar
  ctx.fillStyle = p.surface;
  ctx.fillRect(0, 0, width, titleH);
  ctx.fillStyle = p.line;
  ctx.fillRect(0, titleH - 1, width, 1);

  const dot = (cx: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, titleH / 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
  };
  dot(padX + 2, "#ff5f57");
  dot(padX + 18, "#febc2e");
  dot(padX + 34, "#28c840");

  ctx.textAlign = "left";
  ctx.fillStyle = p.muted;
  ctx.font = `600 ${fontSize}px ${MONO}`;
  const title = opts.title || opts.lang || "snippet";
  const titleX = padX + 54;
  const watermark = "SnippetVault";
  ctx.font = `600 12px ${MONO}`;
  const wmW = ctx.measureText(watermark).width;
  ctx.font = `600 ${fontSize}px ${MONO}`;
  const maxTitleW = width - titleX - wmW - padX - 16;
  let t = title;
  while (t.length > 1 && ctx.measureText(t).width > maxTitleW) t = t.slice(0, -1);
  if (t !== title) t = t.slice(0, -1) + "…";
  ctx.fillText(t, titleX, titleH / 2 + 1);

  ctx.font = `600 12px ${MONO}`;
  ctx.fillStyle = p.faint;
  ctx.textAlign = "right";
  ctx.fillText(watermark, width - padX, titleH / 2 + 1);
  ctx.textAlign = "left";

  // code
  const startY = titleH + padY + lineHeight / 2;
  const digits = String(lines.length).length;
  for (let i = 0; i < parsed.length; i++) {
    const y = startY + i * lineHeight;
    if (showNums) {
      ctx.fillStyle = p.faint;
      ctx.font = `${fontSize}px ${MONO}`;
      ctx.textAlign = "right";
      ctx.fillText(String(i + 1).padStart(digits, " "), padX + numW - 14, y);
      ctx.textAlign = "left";
    }
    let x = padX + numW;
    for (const seg of parsed[i]) {
      ctx.fillStyle = seg.cls ? (p.tok[seg.cls] ?? p.ink) : p.ink;
      ctx.font = seg.cls === "com" ? `italic ${fontSize}px ${MONO}` : `${fontSize}px ${MONO}`;
      ctx.fillText(seg.text, x, y);
      x += ctx.measureText(seg.text).width;
    }
  }

  if (truncated) {
    const y = startY + parsed.length * lineHeight + 3;
    ctx.fillStyle = p.faint;
    ctx.font = `${fontSize}px ${MONO}`;
    ctx.fillText(`… ${truncated} more line${truncated > 1 ? "s" : ""}`, padX + numW, y);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not render the image."))), "image/png");
  });
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Best-effort: copy a PNG to the clipboard (needs HTTPS + a Chromium/Firefox browser). */
export async function copyImage(blob: Blob): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
