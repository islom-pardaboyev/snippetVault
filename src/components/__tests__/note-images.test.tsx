// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { extensionsFor, NoteView, RichNoteEditor } from "../RichNote";
import { ModalProvider } from "../Modal";

/**
 * Notes with images, on a real (jsdom) DOM. These cover the two things that would otherwise only
 * show up on someone else's screen: whether stored markup survives a round trip (an image that
 * fails to parse is an image lost on the next save) and whether an id actually resolves into a
 * picture when the note is rendered.
 *
 * Both shapes are checked — `NoteView` is the read-only render used by the detail, vault and
 * public share pages, and it shares its extensions with the editor.
 */

const SHOT = { id: "shot-1", data: "data:image/png;base64,AAAA", w: 800, h: 600 };
const NOTE = `<p>Before</p><img alt="" data-image-id="shot-1"><p>After</p>`;
const ONLY = '<img alt="" data-image-id="shot-1">';
const SHOWN = '[data-image-id="shot-1"] img';

// React only flushes effect-driven re-renders synchronously inside an `act` it knows about.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let editor: Editor | null = null;
let roots: Root[] = [];

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots = [];
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

/** Parse stored HTML into a note document and serialise it straight back. */
const roundTrip = (html: string) => {
  editor = new Editor({ extensions: extensionsFor(""), content: html });
  return editor.getHTML();
};

/** Render into a detached host, letting React flush effects and the editor's own node views. */
async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(<ModalProvider>{node}</ModalProvider>); });
  return host;
}

/** Re-render the same root — "the page finished loading the images a moment later". */
const rerender = (root: Root, node: React.ReactNode) =>
  act(async () => { root.render(<ModalProvider>{node}</ModalProvider>); });

describe("a note's markup", () => {
  it("keeps an image reference, and the text around it, through a round trip", () => {
    expect(roundTrip(NOTE)).toBe(NOTE);
  });

  it("keeps a note that is nothing but an image", () => {
    expect(roundTrip(ONLY)).toBe(ONLY);
  });

  it("keeps headings, checklists and code blocks alongside images", () => {
    const html = '<h2>How it looks</h2><img alt="" data-image-id="shot-1">'
      + '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>fix the padding</p></div></li></ul>'
      + '<pre><code class="language-css">.card { gap: 8px }</code></pre>';
    const once = roundTrip(html);
    expect(once).toContain('<img alt="" data-image-id="shot-1">');
    expect(once).toContain('data-type="taskItem"');
    expect(once).toContain('<code class="language-css">.card { gap: 8px }</code>');
    expect(roundTrip(once)).toBe(once); // saving a second time changes nothing
  });

  it("drops an <img> that isn't one of the snippet's images", () => {
    expect(roundTrip('<p>see</p><img src="https://example.com/x.png">')).toBe("<p>see</p>");
  });
});

describe("rendering a note", () => {
  it("shows the snippet's image, resolved from its id", async () => {
    const host = await render(<NoteView html={NOTE} images={[SHOT]} />);
    const img = host.querySelector<HTMLImageElement>(SHOWN);
    expect(img?.getAttribute("src")).toBe(SHOT.data);
    expect(img?.width).toBe(800);
    expect(host.textContent).toContain("Before");
    expect(host.textContent).toContain("After");
  });

  it("shows a note that is only an image", async () => {
    const host = await render(<NoteView html={ONLY} images={[SHOT]} />);
    expect(host.querySelector<HTMLImageElement>("img")?.getAttribute("src")).toBe(SHOT.data);
  });

  it("picks the image up when the page loads it after the first paint", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => { root.render(<ModalProvider><NoteView html={NOTE} /></ModalProvider>); });
    expect(host.querySelector(".note-img-missing")).not.toBeNull();

    await rerender(root, <NoteView html={NOTE} images={[SHOT]} />);
    expect(host.querySelector<HTMLImageElement>(SHOWN)?.getAttribute("src")).toBe(SHOT.data);
  });

  it("says so, instead of breaking, when the image isn't there", async () => {
    const host = await render(<NoteView html={NOTE} />);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector(".note-img-missing")?.textContent).toContain("Image unavailable");
    expect(host.textContent).toContain("Before"); // the rest of the note still reads
  });

  it("renders the editor's own images the same way", async () => {
    const host = await render(<RichNoteEditor value={NOTE} onChange={() => {}} images={[SHOT]} />);
    expect(host.querySelector<HTMLImageElement>(SHOWN)?.getAttribute("src")).toBe(SHOT.data);
  });

  it("offers the snippet's images in the toolbar, and a way to add one", async () => {
    const host = await render(<RichNoteEditor value="" onChange={() => {}} images={[SHOT]} onAddImage={async () => null} />);
    expect(host.querySelector('[aria-label="Insert image"]')).not.toBeNull();
    expect(host.querySelector('input[type="file"]')).not.toBeNull();
  });

  it("keeps to the note's own tools when the snippet has no images", async () => {
    const host = await render(<RichNoteEditor value="" onChange={() => {}} />);
    expect(host.querySelector('[aria-label="Insert image"]')).toBeNull();
  });
});
