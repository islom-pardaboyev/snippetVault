# SnippetVault

A private, realtime, offline-first vault for the code you keep rewriting. Search it in a keystroke, copy it in another, run it in the browser, share it as a read-only link.

![SnippetVault library](docs/screenshots/library.png)

<p align="center">
  <img src="docs/screenshots/multi-select.gif" alt="Selecting several snippets and deleting them" width="720">
</p>

Built with **React 19 · TypeScript · Tailwind CSS 4 · Vite · Firebase (Auth + Firestore) · CodeMirror 6**, installable as a PWA.

## Features

- **Auth** — email/password and **Sign in with Google**, password reset, email verification, change password, delete account
- **Admin** — `/admin` for the site owner: passcode-protected dashboard (see [Admin](#admin))
- **Account menu** — header dropdown showing your name, email and sign-in method, with quick links to Settings, Admin, the theme toggle and Sign out
- **Realtime sync, works offline** — Firestore with a persistent IndexedDB cache; edits queue offline and sync when you're back
- **Library** — grid/list views, sort, favourites, filter by language and tag, and the command palette (`⌘K`)
- **Smarter search** — field operators (`lang:ts`, `tag:api`, `group:Frontend`, `is:starred`, `is:shared`, `has:notes`, `has:images`, `before:2026-01`, `after:2026-01-15`), typo-tolerant fuzzy matching, title-first relevance ranking, tappable filter chips, quoted `"exact phrases"` and a recent-searches menu in the header
- **Duplicate finder** — warns on save when new code looks like something you already saved (with a link to open it), plus a “Possible duplicates” panel on Insights that clusters near-identical snippets
- **Copy formats & code image** — a split copy button: raw code, Markdown, HTML, or title + code — and export any block as a themed PNG for chat or slides
- **Groups** — topic folders with colour and emoji; create a group from existing snippets, add existing snippets later, drag a card onto a group in the sidebar
- **Bulk actions** — multi-select to delete snippets (everywhere, including inside a group) or whole groups, with Undo
- **Private notes** — an optional, per-snippet explanation for your own use (shown on the detail page and in the editor), separate from the description and included only when you publish that snippet. A real rich-text editor (Tiptap): headings, checklists, lists, quotes, links, dividers, bold/italic/underline/strikethrough/inline code — and **code blocks with syntax highlighting** for every language the app knows (JavaScript, Python, SQL, C++…), auto-detected when you paste. You can also **show a picture inside a note**: pick one of the snippet's images, or paste/drop a screenshot straight onto the note. The note stores a *reference* to the image, so every picture lives in exactly one place, obeys the same five-image cap, travels into the vault encrypted and back out again, and shows up in share links
- **Pages** — pick **Page** from the language menu to write prose instead of code. The code editor steps aside for the full rich-text editor, the content lives in the snippet's notes, and a shared page renders as a complete written page. Pages behave like any other snippet: search, tags, groups, favourites, images, version history and read-only share links all work. (The language menu keeps **Other** for snippets that already used it, so nothing old breaks)
- **Read-only share links** — publish a snippet or a whole group to an unguessable link (`/share/:token`) that anyone can open with **no account**: code, images, description and notes. Set an expiry (1 hour – 30 days), watch a view counter, refresh the contents, or revoke at any time. **Expiry is enforced on the server**, not just in the app: expired shares are refused by the Firestore rules, so the data is unreachable even to someone who keeps the URL
- **Shared snippets** — `/shared` lists everything you've published, with copy / open / revoke plus each link's view count and expiry
- **Run code in the browser** — JavaScript, TypeScript and Python (Pyodide) execute inside a sandboxed iframe + Web Worker with a timeout, so a runaway loop can't touch the app or your data
- **Editor** — CodeMirror 6 with 15+ languages, language auto-detect, `{{variable}}` templates that prompt before copying
- **Version history** with line diffs, **image attachments**, JSON import/export, Markdown export
- **Insights** page, light/dark/system theme and custom accent colour
- **Responsive** — designed down to pocket-phone widths: a five-slot bottom bar (Library · Favourites · **+** · Groups · **More**), layouts that reflow, and no horizontal overflow. The bar carries the only "New" button on a phone, so the header drops it below `md`.

| Sign in | Group with existing snippets | Mobile |
| --- | --- | --- |
| ![Sign in](docs/screenshots/login.png) | ![New group](docs/screenshots/new-group.png) | ![Mobile](docs/screenshots/mobile.png) |

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run typecheck
npm run build
```

Firebase setup (Email/Password + Google providers, Firestore, rules) is in [SETUP.md](SETUP.md).

To look around without a Firebase account, run `npm run dev` and open `http://localhost:5173/?demo=1`. Demo mode is compiled out of production builds, and the snippets are seeded in memory. Publishing share links needs a real signed-in account, so it is disabled in demo mode.

### Environment

Copy `.env.example` to `.env.local` (git-ignored) and fill in:

| Variable | Purpose |
| --- | --- |
| `VITE_ADMIN_EMAIL` | The only Google/email account that can open `/admin` |
| `ADMIN_PASSCODE` | The admin passcode as plain text. It is hashed at build time; only the SHA-256 reaches the site. |
| `IMB_API` | **Optional** — imgbb API key that gives the Vault *unlimited* images. Without it the vault still works, storing images inline instead. |

> **Vault images.** With `IMB_API` set, an image added in the Vault is compressed, AES-GCM-encrypted on your device, wrapped in a lossless greyscale PNG, uploaded to imgbb, then **downloaded straight back and SHA-256-verified** before a ~300-byte pointer is saved to Firestore. If imgbb is unavailable, out of quota, or alters the bytes, the image falls back to inline (still encrypted) Firestore storage — nothing is ever lost. Because this is a client-only site the key ships inside the JS bundle, so use a key you can rotate; imgbb only ever sees ciphertext. Regular snippets keep their 5-image cap and are unaffected.

## Admin

`/admin` has two gates. The page is shown only to the account in `VITE_ADMIN_EMAIL`, and then it asks for the admin passcode once per browser session. It shows counts, sync state, local storage use, a JSON export of your vault, and a table of registered accounts read from the public `users` directory. A link to the Firebase user list is included for anything the directory doesn't cover.

> **Security note.** `VITE_*` values are compiled into the JavaScript bundle, so anyone can read the hash and the admin email. The passcode gate keeps casual visitors out, but it is not a real security boundary. The protection for real data is the Firestore rules, which only let each user touch their own documents. For a true admin view of all users, use a Firebase custom claim with a Cloud Function, which the client can't see or forge.

## Architecture notes

| Area | Notes |
| --- | --- |
| `src/hooks/auth.tsx` | Auth context: email/password, Google popup, reauth + password change, verification state; writes a row to the `users` directory on sign-in |
| `src/hooks/snippets.tsx` | Single source of truth: Firestore snapshot listeners, optimistic local updates, batched writes, groups, versions |
| `src/lib/search.ts` | Query parser (field operators) + fuzzy matcher + recent searches, shared by the library and the ⌘K palette |
| `src/lib/similar.ts` | Duplicate detection: normalized fingerprints plus a word-overlap (Sørensen–Dice) score |
| `src/lib/share.ts` | Read-only share links: create / read / revoke, expiry and view counter. Expiry is written twice — an ISO string for the UI and a Firestore timestamp (`expires_at_ts`) so the rules can refuse an expired link server-side |
| `src/lib/codeImage.ts` | Renders a snippet to a themed PNG on a canvas — no third-party dependency |
| `src/lib/users.ts` | Public `users` directory rows used by the admin table |
| `src/lib/runner.ts`, `src/lib/sandbox/` | Sandboxed code execution (opaque-origin iframe → Web Worker, kill-on-timeout) |
| `src/lib/highlight.ts` | Dependency-free highlighter used for card previews and the code image |
| `src/components/RichNote.tsx`, `src/lib/note.ts` | Rich notes: one Tiptap document (headings, checklists, quotes, links, code blocks highlighted by `lowlight`, images referenced by id) in two shapes — the editor and a read-only view. Stored as HTML; `noteToHtml()` upgrades notes written before the editor existed, `noteText()` feeds search and `noteImageIds()` names the pictures a note shows, so markup never leaks into results |
| `src/lib/utils.ts` | `LANGUAGES`, `PAGE_LANG`/`isPage` (the **Page** type), language colours, `toMarkdown`/`toHtml`/`titleAndCode` (page-aware), import/export, seed data |
| `firestore.rules` | Per-user isolation (`users/{uid}/…`) plus size and shape validation on every write; public read-only `shares/{token}` with server-enforced expiry |

### Security

- Account deletion (Settings → Danger zone) re-confirms the sign-in, deletes every document the user owns, then deletes the Firebase account.
- Every document lives under `users/{uid}` and rules only allow that uid to read or write it; writes are validated for type and size.
- **Share links are a separate public copy.** Publishing writes to `shares/{token}` (with its snippets and images nested underneath), leaving your private vault rules untouched. Anyone with the unguessable token can read it; only the owner can create or delete it, and anonymous readers may only bump the `views` counter by one — nothing else. Revoking deletes the copy. When a link has an expiry, the rules compare the stored `expires_at_ts` against the server clock and refuse the read once it has passed, so an expired link is unreadable even if the URL is kept.
- **Moving a snippet into the vault removes every plaintext copy, not just the document** — its images, its version history and, if it was ever shared, the public share link too. Firestore never cascades a document's sub-collections, so this cleanup is done explicitly (otherwise a snippet's code would linger in the clear under `snippets/{id}/versions`).
- User code never runs in the app's origin: the sandbox iframe has no `allow-same-origin`, so it can't read cookies, storage or the vault.
- The Firebase web config in the repo is a public project identifier, not a secret — access is enforced by Auth and the rules above.

## CI

GitHub Actions runs type-check, tests and a production build on every push and pull request (`.github/workflows/ci.yml`).

## Screenshots

`scripts/capture-screenshots.py` regenerates `docs/screenshots/` from the dev server in demo mode. It needs Google Chrome, `pip install playwright pillow`, and `npm run dev` running.

## Deploy

```bash
npm run deploy     # build + firebase deploy (hosting and rules)
```
