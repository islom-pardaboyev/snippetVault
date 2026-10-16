import { describe, expect, it } from "vitest";
import { MAX_NOTE_CHARS, MAX_NOTE_HTML, dropNoteImage, escapeHtml, hasNoteText, isNoteEmpty, noteImageIds, noteLang, noteText, noteToHtml } from "../note";

describe("escapeHtml", () => {
  it("escapes the five characters that can break out of text", () => {
    expect(escapeHtml(`<img src="x" onerror='y'> & done`)).toBe(
      "&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt; &amp; done",
    );
  });
});

describe("noteToHtml", () => {
  it("returns the editor's own markup untouched", () => {
    const html = "<h2>Retry</h2><p>Use <code>backoff()</code></p><pre><code class=\"language-js\">let x=1</code></pre>";
    expect(noteToHtml(html)).toBe(html);
  });

  it("turns a note written before the rich editor into paragraphs", () => {
    expect(noteToHtml("first line\nsecond line")).toBe("<p>first line<br>second line</p>");
    expect(noteToHtml("one\n\ntwo\n\n\nthree")).toBe("<p>one</p><p>two</p><p>three</p>");
  });

  it("normalises windows line endings", () => {
    expect(noteToHtml("a\r\n\r\nb")).toBe("<p>a</p><p>b</p>");
  });

  it("escapes plain text, so an old note can never become markup", () => {
    expect(noteToHtml("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
    expect(noteToHtml("a < b && c > d")).toBe("<p>a &lt; b &amp;&amp; c &gt; d</p>");
  });

  it("treats blank input as no note at all", () => {
    expect(noteToHtml("")).toBe("");
    expect(noteToHtml("   \n  ")).toBe("");
    expect(noteToHtml(undefined)).toBe("");
  });
});

describe("noteText", () => {
  it("reads an empty editor as empty", () => {
    expect(noteText("<p></p>")).toBe("");
    expect(hasNoteText("<p></p>")).toBe(false);
    expect(hasNoteText("<p><br></p>")).toBe(false);
    expect(hasNoteText(undefined)).toBe(false);
  });

  it("strips markup and keeps the words", () => {
    const html = "<h1>Timer</h1><p>Lives in a <strong>closure</strong>.</p><ul><li>tick</li><li>tock</li></ul>";
    expect(noteText(html)).toBe("Timer\nLives in a closure.\ntick\ntock");
    expect(hasNoteText(html)).toBe(true);
  });

  it("unescapes entities the editor wrote", () => {
    expect(noteText("<p>a &lt; b &amp;&amp; c</p>")).toBe("a < b && c");
    expect(noteText("<p>line<br>break</p>")).toBe("line\nbreak");
  });

  it("passes plain text through, so search behaves as it always did", () => {
    expect(noteText("kept in a closure")).toBe("kept in a closure");
    expect(noteText("  padded  ")).toBe("padded");
  });

  it("never leaves a stray code fence behind", () => {
    expect(noteText("<pre><code class=\"language-python\">def f():\n    return 1</code></pre>")).toBe(
      "def f():\n    return 1",
    );
  });

  it("reads a check list as its items, not as checkboxes", () => {
    const html =
      '<ul data-type="taskList">'
      + '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Ship it</p></div></li>'
      + '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Later</p></div></li>'
      + "</ul>";
    expect(noteText(html)).toBe("Ship it\nLater");
    expect(hasNoteText(html)).toBe(true);
  });

  it("reads a checklist nobody has filled in as empty", () => {
    const html = '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li></ul>';
    expect(noteText(html)).toBe("");
    expect(hasNoteText(html)).toBe(false);
  });

  it("keeps a divider, which is content without any words", () => {
    expect(noteText("<hr>")).toBe("");
    expect(isNoteEmpty("<hr>")).toBe(false);
    expect(hasNoteText("<hr>")).toBe(true);
  });
});

describe("noteImageIds", () => {
  it("reads the images a note shows, in order", () => {
    const html = '<p>Before</p><img alt="" data-image-id="a"><p>after</p><img alt="" data-image-id="b">';
    expect(noteImageIds(html)).toEqual(["a", "b"]);
  });

  it("lists each image once, however often it appears", () => {
    expect(noteImageIds('<img data-image-id="shot-1"><p>then</p><img data-image-id="shot-1">')).toEqual(["shot-1"]);
  });

  it("finds nothing in a note without images, or in plain text", () => {
    expect(noteImageIds("<p>just words</p>")).toEqual([]);
    expect(noteImageIds("copied from the old editor\nsecond line")).toEqual([]);
    expect(noteImageIds("an <img> tag nobody meant as markup")).toEqual([]);
    expect(noteImageIds(undefined)).toEqual([]);
  });

  it("counts an image-only note as content, though it has no text", () => {
    const html = '<img alt="" data-image-id="shot-1">';
    expect(noteText(html)).toBe("");
    expect(noteToHtml(html)).toBe(html); // markup passes through, so the image is never escaped
    expect(hasNoteText(html)).toBe(true);
  });
});

describe("dropNoteImage", () => {
  it("takes out the deleted picture's reference and nothing else", () => {
    const html = '<p>See</p><img alt="" data-image-id="a"><img alt="" data-image-id="b"><p>done</p>';
    expect(dropNoteImage(html, "a")).toBe('<p>See</p><img alt="" data-image-id="b"><p>done</p>');
    expect(dropNoteImage(html, "nope")).toBe(html); // an id that isn't there changes nothing
  });

  it("treats ids as text, however odd their characters", () => {
    expect(dropNoteImage('<img alt="" data-image-id="img_1.v2">', "img_1.v2")).toBe("");
  });

  it("is safe on a note with no images at all", () => {
    expect(dropNoteImage(undefined, "a")).toBe("");
    expect(dropNoteImage("kept in a closure", "a")).toBe("kept in a closure");
  });
});

describe("noteLang", () => {
  it("maps the app's language names to highlight.js grammars", () => {
    expect(noteLang("JavaScript")).toBe("javascript");
    expect(noteLang("HTML")).toBe("xml");
    expect(noteLang("Terminal")).toBe("bash");
    expect(noteLang("Shell")).toBe("bash");
    expect(noteLang("C++")).toBe("cpp");
  });

  it("returns nothing for languages the highlighter should guess", () => {
    expect(noteLang("Other")).toBeUndefined();
    expect(noteLang("")).toBeUndefined();
    expect(noteLang(undefined)).toBeUndefined();
    expect(noteLang(null)).toBeUndefined();
  });
});

describe("limits", () => {
  it("leaves headroom for markup above the text ceiling", () => {
    expect(MAX_NOTE_CHARS).toBe(20_000);
    expect(MAX_NOTE_HTML).toBeGreaterThan(MAX_NOTE_CHARS);
  });
});
