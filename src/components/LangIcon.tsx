import {
  siJavascript, siTypescript, siPython, siPostgresql, siGnubash, siCss, siHtml5, siJson,
  siGo, siRust, siOpenjdk, siCplusplus, siPhp, siMarkdown,
} from "simple-icons";
import { langColor } from "../lib/utils";

const PATHS: Record<string, string> = {
  JavaScript: siJavascript.path, TypeScript: siTypescript.path, Python: siPython.path, SQL: siPostgresql.path,
  Shell: siGnubash.path, CSS: siCss.path, HTML: siHtml5.path, JSON: siJson.path, Go: siGo.path,
  Rust: siRust.path, Java: siOpenjdk.path, "C++": siCplusplus.path, PHP: siPhp.path, Markdown: siMarkdown.path,
};

/** Brand logo for a language (bundled, works offline). */
export function LangIcon({ lang, size = 18, className = "" }: { lang: string; size?: number; className?: string }) {
  const color = langColor(lang);
  if (lang === "Terminal") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
        <rect x="1.5" y="3.5" width="21" height="17" rx="4" fill={color} />
        <path d="m6.5 9 3.2 3-3.2 3M12 15.5h5.5" fill="none" stroke="#0a0b0d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (lang === "Page") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
        <path d="M6 2.75h7.1L19.5 9.2v12.05H6z" fill={color} opacity=".9" />
        <path d="M13.1 2.75V9.2h6.4" fill="none" stroke="#0a0b0d" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 12.4h6.2M9 15.4h6.2M9 18.4h3.6" fill="none" stroke="#0a0b0d" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  const path = PATHS[lang];
  if (!path) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
        <rect x="1.5" y="3.5" width="21" height="17" rx="4" fill={color} opacity=".9" />
        <path d="m9 9-3 3 3 3M15 9l3 3-3 3" fill="none" stroke="#0a0b0d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={path} fill={color} />
    </svg>
  );
}
