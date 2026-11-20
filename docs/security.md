# Security notes

How SnippetVault is defended, where each control lives, and which trade-offs were accepted
deliberately. Written for whoever touches this code next — every rule below has a reason.

## 1. Layer map

| Layer | Where | What it stops |
| --- | --- | --- |
| Transport headers (CSP, nosniff, referrer) | `firebase.json` + `vercel.json` | Script injection, MIME sniffing, referrer leaks |
| Firestore Security Rules | `firestore.rules` | Direct reads/writes bypassing the app, expired-link access |
| Client-side encryption | `src/lib/crypto.ts` | Server-side reading vault contents (server only ever sees ciphertext) |
| Code sandbox | `src/lib/runner.ts` + `src/lib/sandbox/` | Executed snippets touching the session, cookies or vault |
| HTML rendering policy | `src/lib/note.ts`, `src/lib/highlight.ts` | Stored XSS through notes, previews or highlighted code |
| Admin gating (two places) | `src/lib/admin.ts` **and** `firestore.rules` | Non-admin accounts reaching `/admin` or admin-only queries |

No layer is trusted alone: the UI hides admin, the rules *enforce* admin; the UI "encrypts"
before upload, the rules never grant the owner read access to plaintext fields that aren't there.

## 2. Transport headers

The same policy is declared twice — **keep them byte-identical**:

- `firebase.json` → `hosting.headers["**"]` (Firebase Hosting)
- `vercel.json` → `headers[].source: "/(.*)"` (Vercel)

When a directive changes (for example `media-src 'self' blob:` for vault audio), edit both files and deploy both.

```
Content-Security-Policy: default-src 'self'; … ; manifest-src 'self' blob:
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

Why each CSP allowance exists:

| Directive | Allowed | Needed because |
| --- | --- | --- |
| `script-src` | `'unsafe-inline'` | The sandbox `<iframe srcdoc>` (runner) contains an inline bootstrap script, and `index.html` has a pre-paint theme script. A nonce/hash is not practical for a `srcdoc` document that embeds generated worker source. |
| `script-src` | `'unsafe-eval'`, `'wasm-unsafe-eval'` | Pyodide (Python runner) compiles/instantiates WebAssembly and may evaluate. |
| `script-src` | `https://cdn.jsdelivr.net` | Pyodide runtime is loaded from jsdelivr. |
| `script-src` | `https://apis.google.com`, `https://*.firebaseapp.com` | Firebase Auth popup/handler plumbing. |
| `worker-src` | `blob:` | The runner creates a Worker from a blob URL *inside* the sandbox frame. |
| `connect-src` | `https://*.googleapis.com` | Firestore, Auth (`identitytoolkit`), Secure Token. |
| `connect-src` | `https://cdn.jsdelivr.net` | Pyodide fetches its wasm/packages in the worker. |
| `connect-src` | `https://api.imgbb.com`, `https://i.ibb.co`, `https://ibb.co` | Vault image upload, ciphertext download, and best-effort delete. |
| `media-src` | `blob:` | Vault audio is decrypted in memory and played from a `blob:` URL. Without it the `<audio>` element falls back to `default-src 'self'` and playback is blocked. |
| `img-src` | `https:` (any) | Notes and snippets may embed arbitrary external image URLs. Images cannot execute script. |
| `style-src` | `'unsafe-inline'` | Tiptap/ProseMirror and CodeMirror inject `<style>` elements at runtime. |
| `frame-ancestors 'none'`, `object-src 'none'` | — | Clickjacking and plugin content; these are the reasons the header exists. |

**Accepted trade-off:** `'unsafe-inline'`/`'unsafe-eval'` weaken XSS containment, so the header
primarily confines *where* scripts and data can come from/go to. The real XSS defense is the
rendering policy in §5. Tightening later: hash the `index.html` inline script, pre-build the
sandbox frame, and drop `frame-src` allowances if Google sign-in popup is unused.

If a deployed page breaks after a header change, this file's CSP value is the first line to
temporarily remove (it lives only in config — no code change needed).

## 3. Share links (server-enforced expiry)

- `shares/{token}` stores `expires_at_ts` as a **Firestore timestamp**. A never-expiring share
  stores a far-future timestamp (`Date("9999-12-31…")`), **never `null`**.
- **Why not `null`:** in rules, `resource.data.get(key, default)` returns the *present* value even
  when it is `null`. A stored `null` makes `request.time < null` a type error → every read of the
  link is denied. Writing a real timestamp keeps the comparison well-typed, and rules treat an
  absent field as the same far-future default (old shares stay compatible).
- Once the server clock passes `expires_at_ts`, reads of the share *and its sub-collections*
  (`parentOpen()` in `firestore.rules`) fail — a revoked/expired URL leaks nothing, even the title.
- Missing shares are readable-by-nobody-but-look-missing: `shareOpen()` allows `resource == null`
  so a bad token renders "link isn't available" instead of a permission error.

**Known gap:** a share document written by a pre-timestamp build with `expires_at_ts: null` cannot
be read under current rules (the present-`null` gotcha above). Fix by refreshing the link once
(the owner opening Share → Save rewrites the document with a real timestamp).

## 4. Admin email pairing

The admin address exists in two places that cannot share a value:

1. `src/lib/admin.ts` — `ADMIN_EMAIL` (`VITE_ADMIN_EMAIL` build var, fallback to the literal), used
   by the UI (`/admin` gate, AccountMenu, SettingsDialog).
2. `firestore.rules:14` — a hard-coded literal, used to authorise admin-only reads.

`src/lib/__tests__/admin.test.ts` reads the rules file from disk and fails if the two drift. It
runs in `npm test`, so CI catches a one-sided change. Changing the admin address = change both +
keep the test green.

## 5. HTML rendering policy

Three call sites render HTML strings directly (`dangerouslySetInnerHTML`): `CodeBlock`,
`SnippetCard` preview, `Vault` preview. All three consume **only** `lib/highlight.ts`, which
escapes `&`, `<`, `>` per fragment *before* wrapping tokens in `<span>`s — attacker-controlled
code text never becomes markup.

Rich notes (Tiptap) never use `innerHTML`: content is fed to the editor via `setContent()`, so it
is parsed through ProseMirror's schema — tags and attributes outside the schema are dropped at
parse time. `note.ts`'s `noteToHtml()` escapes plain text before it enters that pipeline, and
`noteText()` (search/previews) strips tags and is never rendered as HTML.

## 6. Vault cryptography (client-side)

`src/lib/crypto.ts`:

- passphrase —**PBKDF2-HMAC-SHA-256, 600,000 iterations, 16-byte salt**→ key-encryption key (KEK)
- KEK —**AES-256-GCM wrap**→ sealed random 256-bit data-encryption key (DEK), plus a recovery key
- DEK —**AES-256-GCM, fresh 12-byte IV, per-item AAD**→ every vault field (title, code, notes,
  image bytes, version history)

The server stores only `iv || ciphertext`. Losing the passphrase/recovery key loses the data —
by design; nothing server-side can recover it.

**Forgotten passphrase.** The recovery key unwraps the same DEK, so it can *re-seal* it under a new
passphrase and a fresh salt (`resetPassphraseWithRecovery`): old ciphertext stays readable and the
recovery key stays valid. With neither secret the only option is `wipeVault` (the "Reset the vault"
screen, behind a typed `RESET`), which deletes the vault's items, sealed images, gallery and
`meta/vault` — and nothing else — so a new vault can be created. It never touches normal snippets. Tests override iterations (`FAST`) so they don't
mine CPUs; production always uses the OWASP work factor.

Snippet images (non-vault) are stored as base64 in Firestore and are **not** encrypted — only the
vault encrypts. Vault images are encrypted *before* upload; the imgbb API key (in the bundle) only
ever transmits ciphertext.

**Hosted-image lifecycle.** Moving a snippet *into* the vault re-hosts its images: seal → upload to
imgbb → **then** delete the plaintext copies from Firestore. Moving *out* (or deleting a vault
image, a vault item, or the whole account) reverses it: the blob at imgbb is asked to be removed via
its stored `delete_url` — a reverse-engineered, undocumented, **unverifiable** request (`no-cors`
POST to `ibb.co/json`, see `deleteHostedImage`). It is best-effort by design: Firestore is deleted
first, and a failure only strands opaque ciphertext (plus quota) on a third party, never readable
content — the URL stays in the image record so the owner can reclaim it by hand. The vault's
**standalone gallery** (`users/{uid}/vaultImages`, images attached to no snippet) runs the identical
pipeline: seal → verified imgbb pointer (inline fallback), purge on delete, wipe with the account.

**Audio lifecycle.** Vault audio (voice, music; 25 MB cap, MP3/M4A/OGG/WAV/WebM) uses the same
seal → upload → download → SHA-256 compare pipeline, with two differences: it requires `IMB_API`
and it has **no inline fallback** (a file that can't be hosted and verified is not stored, so audio
never lands in Firestore as ciphertext). The descriptive `meta` (name, type, size, duration) is
sealed separately with AAD `${id}:meta`; the bytes are sealed with AAD `id`. Records live at
`users/{uid}/vault/{itemId}/audio/{audioId}` and, for the standalone "Voice & music" list,
`users/{uid}/vaultAudio/{audioId}` (plaintext `created_at` only, for sorting); the rules require a
hosted pointer and reject `enc`. Deleting an audio file, deleting a vault item, `wipeVault` and
account deletion all remove the records first and then ask imgbb to delete each blob via
`delete_url`, best-effort as above. Moving an item out of the vault is refused while it has audio,
because normal snippets can't hold audio. Playback decrypts in memory and uses a `blob:` URL
(`media-src 'self' blob:`, §2).

**Durability caveat.** imgbb is a free third-party host with no guarantee that it keeps files. If it
drops a blob, the Firestore record survives but the audio (or hosted image) can't be fetched, and
the app reports it as unavailable. Keep the originals of anything irreplaceable.

## 7. Code runner sandbox

```
page ─postMessage→ <iframe sandbox="allow-scripts"> ─→ Web Worker(blob:)
                    (opaque origin: no cookies, storage, or DOM access)
```

- The iframe deliberately **omits `allow-same-origin`** — that is the isolation. User code cannot
  read the app's localStorage, IndexedDB, Firestore session or vault keys.
- Infinite loops are cut by a hard timeout (10s JS / 40s Python); "Stop" removes the iframe,
  killing the worker; output is capped at 1,000 lines / 20k chars per line.
- CSP `frame-src`/`worker-src` allowances exist only to keep this pipeline alive.

## 8. Hosting matrix (Vercel vs Firebase Hosting)

| Concern | Firebase Hosting | Vercel |
| --- | --- | --- |
| SPA fallback (`/share/:token`, `/s/:id` deep links) | `firebase.json` rewrite | `vercel.json` rewrite |
| Security headers + CSP | `firebase.json` headers | `vercel.json` headers |
| Firestore **rules deploy** | `npx firebase-tools deploy --only firestore:rules --project snippetvault-ed43b` | *same* — rules live in Firebase, not on the host |
| Env vars | build-time (`.env`) | must be set in Project Settings (`VITE_*` build, `ADMIN_PASSCODE`, `IMB_API`) |
| Firebase Auth "Authorized domains" | defaults | add the `*.vercel.app` (or custom) domain for Google popup / email-link sign-in — see `SETUP.md` |

**Both config files must be deployed after edits.** A client build that writes `expires_at_ts`
against rules that predate it (or vice versa) breaks share links with permission errors.

## 9. Accepted, documented risks

- **imgbb API key ships in the bundle.** Client-only architecture makes it public; it's rotatable
  and only ever sees ciphertext. (`.env.example` notes this.) Its "delete" is the reverse-engineered
  `delete_url` request (§6) — undocumented and unverifiable; worst case is stranded ciphertext.
- **imgbb may not retain hosted blobs.** Vault audio has no inline copy, so a blob lost at imgbb is
  lost audio (§6).
- **`CSP script-src 'unsafe-inline'`** — see §2; required by the `srcdoc` sandbox design.
- **Share tokens**: 24 chars from a 62-char alphabet with rejection sampling (`b >= 248` discarded)
  → uniform, ≈143 bits.
- **App-lock** is a *privacy screen* (device-local), not an auth boundary — it never protects
  against someone with the open tab; Firestore rules are the actual boundary.

## 10. Checklist before shipping a change

1. `npm run typecheck && npm test && npm run build`
2. Rules touched? → deploy rules **and** refresh an affected share link to test.
3. Header touched? → update **both** `firebase.json` and `vercel.json`, verify one page in devtools.
4. New HTML output? → must flow through `lib/highlight.ts` or Tiptap `setContent`, never raw
   `innerHTML`.
5. New admin capability? → enforce it in `firestore.rules`, not just in the UI.
