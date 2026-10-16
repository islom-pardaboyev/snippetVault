// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { extensionsFor, isLiveEditor, noteCharCount } from "../RichNote";

/**
 * Opening a snippet builds the note editor while rendering, and Tiptap arms a 1 ms timer that
 * tears that instance down again unless the component managed to commit in time
 * (`EditorInstanceManager.scheduleDestroy`). When the timer wins — a slow or interrupted render,
 * which is why it showed up on phones — `Editor.destroy()` empties the instance (`schema` and
 * `commandManager` become null) and the *next* render is handed that same dead instance back
 * through `useEditorState`. Reading it raised
 * `Cannot read properties of null (reading 'nodes')` from inside `editor.getText()`.
 *
 * These cover both halves of the guard: telling a live editor from a destroyed one, and the
 * character count surviving a render that arrives after the editor is gone.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let editors: Editor[] = [];
let roots: Root[] = [];

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots = [];
  for (const editor of editors) editor.destroy();
  editors = [];
  document.body.innerHTML = "";
});

const editorWith = (content: string) => {
  const editor = new Editor({ extensions: extensionsFor(""), content });
  editors.push(editor);
  return editor;
};

/** The note footer's counter, going through the same hook the real editor uses. */
function CharacterCount({ editor }: { editor: Editor | null }) {
  const chars = useEditorState({ editor, selector: ({ editor: e }) => noteCharCount(e) });
  return <span>{chars}</span>;
}

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(node); });
  return { host, root };
}

describe("telling a live editor from a destroyed one", () => {
  it("accepts a live editor and rejects one that has been destroyed", () => {
    const editor = editorWith("<p>x</p>");
    expect(isLiveEditor(editor)).toBe(true);

    editor.destroy();

    expect(isLiveEditor(editor)).toBe(false);
    // The count is the read that used to throw; it must simply read as empty now.
    expect(noteCharCount(editor)).toBe(0);
  });

  it("treats a missing editor as nothing to read", () => {
    expect(isLiveEditor(null)).toBe(false);
    expect(isLiveEditor(undefined)).toBe(false);
    expect(noteCharCount(null)).toBe(0);
    expect(noteCharCount(undefined)).toBe(0);
  });
});

describe("rendering a note whose editor is taken away", () => {
  it("counts a live editor's characters", async () => {
    const { host } = await render(<CharacterCount editor={editorWith("<p>hello</p>")} />);
    expect(host.textContent).toBe("5");
  });

  it("falls back to 0 instead of throwing when the editor is destroyed mid-life", async () => {
    const editor = editorWith("<p>hello</p>");
    const { host, root } = await render(<CharacterCount editor={editor} />);
    expect(host.textContent).toBe("5");

    // Tiptap's teardown timer firing: the store still reports the instance the render saw.
    editor.destroy();
    await act(async () => { root.render(<CharacterCount editor={editor} />); });

    expect(host.textContent).toBe("0");
  });

  it("renders before the editor exists at all", async () => {
    const { host } = await render(<CharacterCount editor={null} />);
    expect(host.textContent).toBe("0");
  });
});
