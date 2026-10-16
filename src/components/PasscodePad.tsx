import { useCallback, useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { MAX_CODE_LEN } from "../lib/applock";

/**
 * A passcode keypad — the circular 1‑9 / 0 / ⌫ buttons of a phone lock screen.
 *
 * It exists to keep the **native keyboard off the screen**. The app code is a short PIN, and
 * the OS keyboard is large, covers the submit button, and offers autofill, clipboard and
 * keylogger-style suggestions for something that should look like nothing at all. This
 * component contains no `<input>`, so focusing it can never raise a keyboard.
 *
 * Physical keyboards still work: digits and Backspace are handled on the focused pad, so on a
 * desktop you can simply type.
 */

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** The row of dots above the keypad. Grows past `slots` if the code is longer, so it never clips. */
export function PasscodeDots({ filled, slots = 4, invalid }: { filled: number; slots?: number; invalid?: boolean }) {
  const n = Math.max(slots, Math.min(filled, MAX_CODE_LEN));
  return (
    <div className="flex items-center justify-center gap-3" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={i}
          className={`size-3 rounded-full border-[1.5px] transition-all duration-150 ${
            i < filled
              ? (invalid ? "border-danger bg-danger" : "border-accent bg-accent")
              : "border-line bg-transparent"
          }`} />
      ))}
    </div>
  );
}

interface PadProps {
  value: string;
  onChange(next: string): void;
  disabled?: boolean;
  /** Accessible name for the keypad group — say which code is being entered. */
  label?: string;
  max?: number;
}

/* Two colour variants rather than one base plus overrides: `border-line` and `border-transparent`
   on the same element would be decided by stylesheet order, not by the class attribute. */
const KEY_BASE =
  "keypad-key grid size-16 place-items-center rounded-full border text-[21px] font-semibold transition " +
  "active:scale-95 disabled:pointer-events-none disabled:opacity-30 sm:size-[68px] sm:text-[22px]";
const KEY_DIGIT = `${KEY_BASE} border-line bg-surface-2 text-ink hover:border-accent/50 hover:bg-surface`;
const KEY_ERASE = `${KEY_BASE} border-transparent bg-transparent text-muted hover:border-danger/40 hover:bg-surface-2 hover:text-ink`;

export function PasscodePad({ value, onChange, disabled, label = "Passcode keypad", max = MAX_CODE_LEN }: PadProps) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled) return;
    // preventScroll: focusing a freshly-mounted keypad on a phone must not jerk the page.
    box.current?.focus({ preventScroll: true });
  }, [disabled]);

  const press = useCallback((d: string) => {
    if (disabled || value.length >= max) return;
    onChange(value + d);
  }, [disabled, max, onChange, value]);

  const erase = useCallback(() => {
    if (disabled || !value) return;
    onChange(value.slice(0, -1));
  }, [disabled, onChange, value]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); erase(); }
  };

  return (
    <div ref={box} tabIndex={-1} role="group" aria-label={label} onKeyDown={onKey}
      className="mx-auto grid w-fit grid-cols-3 gap-3 outline-none sm:gap-4">
      {DIGITS.map((d) => (
        <button key={d} type="button" className={KEY_DIGIT} disabled={disabled}
          onClick={() => press(d)} aria-label={d}>
          {d}
        </button>
      ))}
      {/* Bottom row: empty slot (the phone's "emergency" corner), then 0 and backspace. */}
      <span aria-hidden="true" />
      <button type="button" className={KEY_DIGIT} disabled={disabled || value.length >= max}
        onClick={() => press("0")} aria-label="0">
        0
      </button>
      <button type="button" onClick={erase} disabled={disabled || !value} aria-label="Delete last digit"
        className={KEY_ERASE}>
        <Icon name="backspace" size={22} />
      </button>
    </div>
  );
}
