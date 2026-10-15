import { useCallback } from "react";
import { useModal } from "../components/Modal";
import { useToast } from "./ui";
import { copyText, fillTemplate, templateVars } from "../lib/utils";
import type { Snippet } from "../lib/types";

/** Copies a snippet; templates ({{var}}) ask for values first. */
export function useCopySnippet() {
  const { fill } = useModal();
  const toast = useToast();
  return useCallback(async (s: Snippet) => {
    const vars = templateVars(s.code);
    let text = s.code;
    if (vars.length) {
      const values = await fill({ title: s.title, vars });
      if (!values) return;
      text = fillTemplate(s.code, values);
    }
    if (await copyText(text)) toast(vars.length ? "Copied with your values!" : "Copied!");
    else toast("Couldn't access the clipboard", { kind: "err" });
  }, [fill, toast]);
}
