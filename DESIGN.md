# Design

A monochrome, Linear-style workspace. Colour appears only in code (syntax tokens) and in danger
states. Nothing decorative: no gradients, glows, gradient text, side-stripe borders or keycap shadows.

## Colour

Tokens live in `src/index.css` on `:root`, with light and dark variants.

| Token | Role |
| --- | --- |
| `--bg`, `--surface`, `--surface-2`, `--surface-3` | Page, card, input and hover surfaces, lightest step last |
| `--line`, `--line-strong` | Hairline borders and emphasised borders |
| `--text`, `--muted`, `--faint` | Primary, secondary and placeholder text |
| `--accent`, `--accent-ink` | The **ink**: near-white on dark, near-black on light. Used for primary buttons, focus, selection |
| `--t-*` | Restrained syntax colours for code, muted to sit beside the monochrome UI |
| `--color-danger` | Destructive actions and errors only |

There is no accent picker. The primary action is the ink, so the interface never competes with the
user's own code.

## Type

- UI: **Inter Variable** (`--font-sans`). Display headings use `font-semibold` and tracking of
  `-0.02em` to `-0.035em`.
- Code: **JetBrains Mono Variable** (`--font-mono`). Monospace is reserved for code, keys and
  measurements.
- Body 14.5px / 1.55. Labels in uppercase use `tracking-[.1em]` at 11px.

## Shape and depth

- Cards 14px radius, controls 9px, dialogs 20px. Shadows only where a surface floats (menus, dialogs,
  toasts).
- Borders carry depth; shadows do not.
- Shared classes in `index.css`: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.chip`,
  `.field` (every text input and textarea). Add a new control through these, not through copies.

## Motion

One entrance (`anim-rise`) and a short theme cross-fade. Everything respects
`prefers-reduced-motion`.

## Rules for new UI

1. Start from a token. Never write a raw hex colour in a component (code preview colours excepted).
2. Use `.field` for inputs, `.btn-primary` for the one primary action per view.
3. No accent-coloured borders on cards, no gradient text, no decorative blur.
4. Check light and dark, and phone width (375px), before calling a screen done.
