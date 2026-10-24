import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

interface Option { value: string; label: string; icon?: ReactNode; hint?: string; }

interface Props {
  value: string;
  onChange(v: string): void;
  options: Option[];
  ariaLabel: string;
  className?: string;
  align?: "left" | "right";
  prefix?: ReactNode;
  buttonClass?: string;
}

/** Fully styled dropdown (no native <select>), keyboard accessible. */
export function Select({ value, onChange, options, ariaLabel, className = "", align = "left", prefix, buttonClass = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setIdx(Math.max(0, options.findIndex((o) => o.value === value)));
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open, options, value]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx, open]);

  const pick = (v: string) => { setOpen(false); onChange(v); root.current?.querySelector("button")?.focus(); };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setIdx(0); }
    else if (e.key === "End") { e.preventDefault(); setIdx(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(options[idx].value); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={root} className={`relative ${className}`} onKeyDown={onKey}>
      <button type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-[38px] w-full items-center gap-2.5 rounded-[10px] border bg-surface-2 px-3 text-left text-sm font-medium outline-none transition ${open ? "border-accent ring-[3px] ring-accent/20" : "border-line hover:border-line-strong"} ${buttonClass}`}>
        {prefix}
        {current?.icon}
        <span className="min-w-0 flex-1 truncate">{current?.label ?? "Select…"}</span>
        <Icon name="chevron" size={16} className={`text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div ref={list} id={id} role="listbox" aria-label={ariaLabel}
          className={`absolute top-full z-50 mt-1.5 max-h-[320px] min-w-full w-max max-w-[min(320px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-line-strong bg-surface p-1.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,.7)] anim-rise ${align === "right" ? "right-0" : "left-0"}`}>
          {options.map((o, i) => (
            <button type="button" key={o.value} role="option" aria-selected={o.value === value} data-i={i}
              onMouseMove={() => setIdx(i)} onClick={() => pick(o.value)}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm ${i === idx ? "bg-accent/15" : ""} ${o.value === value ? "font-bold" : "font-medium"}`}>
              {o.icon}
              <span className="flex-1 truncate">{o.label}</span>
              {o.hint && <span className="text-xs text-faint">{o.hint}</span>}
              {o.value === value && <Icon name="check" size={15} className="text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
