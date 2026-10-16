# Design map — Private Vault, App Lock & unlimited images

> Status: **phases 1–5 implemented.** The private Vault, the optional app passcode and
> unlimited *vault* images are all in the codebase and covered by tests.
>
> **Decisions locked (see §12):** real client-side encryption (Option B); hide all metadata
> while locked; generate a one-time recovery key; block sharing of vault items; unlimited
> images **in the vault only**, encrypted then hosted on imgbb (§8) — regular snippets keep
> their 5-image cap. Firebase Storage remains the long-term alternative (§8).

---

## 1. The three requests

| # | Request | One-line goal |
|---|---------|---------------|
| A | **Private / sensitive section ("Vault")** | Lock chosen **snippets or whole groups** behind a passphrase *the user sets themselves*, and require the same code to open them again — "like a password app". |
| B | **App passcode** | Require a passcode to open the app on a phone/site, with a "change passcode" entry in the menu (Settings). |
| C | **Unlimited images** | Remove the current hard cap of **5 images per snippet** (`MAX_IMAGES = 5`). |

The rest of this document is mostly about **A**, because it is the only one where the
choice of design decides whether your "sensitive information" is actually protected or
just hidden.

---

## 2. How storage works today (the facts the design must respect)

- Snippets: `users/{uid}/snippets/{id}` — **plaintext** fields (`title`, `code`, `description`, `notes`, `tags`…).
- Images: `users/{uid}/snippets/{id}/images/{imgId}` — a base64 `data:` URL, **plaintext**, one doc each, ≤ 900 KB, capped at 5 in the UI.
- Versions: `users/{uid}/snippets/{id}/versions/{vid}` — **plaintext** `code`.
- Groups: `users/{uid}/groups/{gid}` — a `GroupMeta` (`color`, `emoji`, `share_token`), plus a `group` string on each snippet.
- Shares: `shares/{token}/…` — a **plaintext copy** written outside the vault, readable by anyone with the link.
- Sync: Firestore with a **persistent IndexedDB cache** (`persistentLocalCache`), so whatever is written to Firestore is also on disk in the browser.
- Access is controlled by `firestore.rules`: `request.auth.uid == uid`.
- There is already a client-side passcode precedent: `/admin` compares a `SHA-256` of the passcode (hashed at build time) and remembers "unlocked" in `sessionStorage`.

**Consequence:** today, everything you save is readable by (a) anyone holding your signed-in
session, (b) anyone who can read the Firestore data (console, export, a device that has the
account), and (c) anything that scrapes the IndexedDB cache. A *UI-only* lock would not change any of that.

---

## 3. The security decision for the private section (read this part closely)

There are two fundamentally different ways to build "lock it with my password":

### Option A — Convenience lock (UI gate only) — *not real protection*
- Add `locked: true` to a snippet/group, store a hash of the code, and hide the item behind a prompt.
- The **code, notes, images stay plaintext in Firestore**. The lock is decoration.
- Anyone with the account, devtools, or the offline cache reads everything anyway.
- ✅ Fast (a day). ❌ **Does not protect sensitive information.** Should never be sold as "private/sensitive".

### Option B — Client-side encryption (zero-knowledge) — **recommended**
- The passphrase **never leaves the device** and is never sent to Firebase.
- A key derived from the passphrase encrypts the sensitive fields (AES-256-GCM) **before** they are written.
- Firestore stores **only ciphertext**. Even reading the raw database, the admin console, or a
  leaked export shows unreadable blobs. Unlocking happens in the browser and the key lives in memory only.
- This is exactly how password managers ("that password app") work.
- ✅ Genuinely protects data at rest. ❌ Bigger build; **a forgotten passphrase means unrecoverable data** (mitigated by a recovery key, see §6).

> **Recommendation: Option B for anything described as sensitive.** Offer Option A only as a
> lightweight "hide from a glance" screen, clearly labelled as *not* encryption.

### What encryption does and does not protect (be honest with users)

| Protected | Not protected |
|-----------|----------------|
| Firestore data, console, backups, exports (read without the passphrase) | Someone who has both your **signed-in device and the passphrase** |
| Another device/account that syncs the data but lacks the passphrase | Malware / keylogger on the device |
| A lost or stolen device, as long as the app was locked | The screen *while it is unlocked* (decrypted content is visible) |
| Accidental sharing of the raw database | A weak passphrase guessed by brute force (mitigated by a strong KDF + strength rules) |
| | Loss of the passphrase, if no recovery key is stored |

This is the same guarantee a password manager gives — no more, no less. It must be stated in the UI at setup.

---

## 4. Proposed data model

Keep the plaintext paths **untouched** and add an isolated, encrypted area:

```
users/{uid}/meta/vault                      → KDF params + wrapped key (not secret)
users/{uid}/vault/{itemId}                  → encrypted snippet + a few non-sensitive routing fields
users/{uid}/vault/{itemId}/images/{imgId}   → { iv, ct }  (encrypted image bytes)
users/{uid}/vault/{itemId}/versions/{vid}   → { iv, ct }  (encrypted version snapshot)
```

**`users/{uid}/meta/vault`**
```jsonc
{
  "v": 1,
  "kdf": { "algo": "PBKDF2-SHA-256", "iterations": 600000, "salt": "<base64, 16B>" },
  "wrapped_dek": "<base64 iv(12B) || ciphertext>",        // the real key, sealed by the passphrase
  "recovery_wrapped_dek": "<base64 iv || ct> | null",     // optional recovery key (see §6)
  "created_at": "…", "updated_at": "…"
}
```

**`users/{uid}/vault/{itemId}`**
```jsonc
{
  "vault": true,
  "enc": { "v": 1, "iv": "<base64, 12B>", "ct": "<base64>" },  // {title, description, notes, code, tags}
  "language": "TypeScript",     // kept in clear for icons/filters (see decision D3)
  "group": "Acme payroll",      // ditto (optionally encrypted — D3)
  "favorite": false,
  "image_count": 3,
  "created_at": "…", "updated_at": "…"
}
```

Everything that could give away the secret — **title, code, description, notes, tags** — lives
inside `enc.ct`. The list can therefore show *"🔒 Locked item"* until you unlock (or show the
title if you decide titles should stay visible — decision **D3**). No `share_token` ever exists on a vault item (§9).

**Group-level lock.** `GroupMeta` gains `vault?: boolean`. Turning it on **moves the group's
snippets into the vault** (encrypt → write → delete the plaintext originals) and new snippets
added to that group go straight to the vault. Groups stay visible in the sidebar, marked with a lock.

---

## 5. Crypto design

Built entirely on the **Web Crypto API** (`crypto.subtle`) — no third-party dependency required.

- **Key derivation (KDF):** `PBKDF2-HMAC-SHA-256`, random 16-byte salt, **600,000 iterations** (OWASP guidance) → a 256-bit *Key-Encryption-Key* (KEK).
  - Upgrade path: **Argon2id** via `hash-wasm` if we accept one dependency (better against GPU cracking). PBKDF2 is fine to ship first.
- **Data key (DEK):** a random 32-byte key generated once. **Item contents are encrypted with the DEK**, not with the passphrase directly.
- **Sealing the DEK:** the KEK `AES-GCM`-wraps the DEK into `wrapped_dek`. This is the password-manager pattern and it makes **changing the passphrase cheap** (re-wrap one blob; do not re-encrypt every item).
- **Per-item encryption:** fresh random 12-byte IV for every encryption; `AES-256-GCM` gives confidentiality **and** tamper detection (a wrong passphrase or corrupted blob simply fails to decrypt). Optionally bind the item id as *Additional Authenticated Data* so blobs can't be moved between items.
- **In memory only:** after unlock the DEK is imported as a **non-extractable** `CryptoKey` held in a React context. Raw bytes are zeroed after import (best effort). Nothing key-related is written to `localStorage`/IndexedDB. Leaving/reloading the page re-locks.
- **No logging** of decrypted content.

---

## 6. Key lifecycle & user flows

| Flow | Steps |
|------|-------|
| **Set up** | Choose passphrase (strength meter, min 8 / recommend 12+). Generate salt + DEK, wrap, write `meta/vault`. Show the **recovery key once** and ask the user to store it. |
| **Unlock** | Enter passphrase → derive KEK → unwrap DEK (GCM tag verifies correctness) → key in memory. Wrong passphrase = generic "wrong passphrase", never reveals data. |
| **Auto-lock** | Drop the DEK on: tab hidden / app backgrounded, idle timeout (configurable), and page reload. Decrypted content is cleared from React state. |
| **Change passphrase** | Unwrap DEK with the old passphrase → new salt → re-wrap with the new one. Items are untouched. |
| **Forgot passphrase** | If a recovery key exists: enter it → unwrap DEK → set a new passphrase. Otherwise: **data is unrecoverable** — the UI must say so at setup, before anything is stored. |
| **Move in / out** | *Into vault*: encrypt payload → write vault doc → delete the plaintext snippet (+ its plaintext images/versions). *Out*: decrypt → write a normal snippet → delete the vault doc. |

**Recovery key** (recommended, opt-in): a random 256-bit string shown once
(e.g. `4F2A-9C…`, grouped for transcription) that wraps a second copy of the DEK. It is the
password-manager "emergency kit" and is the honest answer to "what if I forget?".

---

## 7. App passcode (feature B)

This is a **device privacy screen**, not encryption. It deserves its own honest label because a
short PIN cannot protect data — the current `/admin` pattern already shows the shape of it.

- **Setup** in **Settings → Security**: *Turn on app lock*, then enter a **4–12 digit PIN** on the keypad and confirm it.
- **Entry is a keypad, never a text field.** `src/components/PasscodePad.tsx` draws the circular
  1‑9 / 0 / ⌫ buttons of a phone lock screen and contains **no `<input>`**, so the OS keyboard can never
  cover the buttons on a phone and there is nothing for autofill or a clipboard to offer. Codes are
  therefore **digits only** (`codeIssue` enforces 4–12 digits). Physical keyboards still work: digits
  and Backspace are handled on the focused pad, so on desktop you can just type. Used by both the
  lock screen and Settings → Security (which walks current → new → confirm on the same pad).
- **Storage: per device**, in `localStorage` (like `sv:admin-unlocked`): `{ enabled, salt, hash: PBKDF2(code, salt), autoLockMs, biometric? }`. **Not synced** — it is a device lock; a new device sets its own.
- **Lock screen** on cold start and on return from background after the chosen timeout (Immediately / 1 min / 5 min / 30 min / Never).
- **Change / turn off** in Settings → Security (requires the current code).
- **Brute-force friction:** increasing delay/lockout after repeated failures. Optional (off by default) "erase local data after N fails".
- **Biometrics (optional, phase 2):** unlock with Face ID / Touch ID / Windows Hello via WebAuthn. For the *vault*, the modern `prf`/`largeBlob` extension can wrap the DEK so a biometric unlock also decrypts — otherwise biometrics only satisfy the app gate.
- **Interaction with the Vault:** keep them **separate by default** (different jobs). Offer a convenience setting "also unlock with my vault passphrase". Never derive the vault DEK from a 4-digit PIN.

---

## 8. Unlimited images (feature C) — implemented, vault-only

**Delivered: unlimited images inside the Vault.** Regular snippets keep `MAX_IMAGES = 5` —
their bytes are plaintext in Firestore and would eat the free tier fast, and nothing about
that path changed.

The cap existed because each image's *bytes* live inside its own Firestore document: ~5 images
is ≈ 3 MB per snippet, and the free tier (1 GiB project storage) would hold only ~1,300 vault
images. The fix is to take the bytes out of Firestore.

### How it works

1. **Compress** — `compressAll()` (`images.ts`) reuses the same per-image size ceiling as
   everywhere else (~450 KB) but has **no count cap**.
2. **Encrypt** — `sealImage()` AES-GCM-seals the image **bytes** behind a tiny JSON header
   (`u32be(headerLen) || utf8(header) || imageBytes`), AAD-bound to the image id. imgbb only ever
   receives ciphertext. The first version instead sealed `JSON.stringify(SnippetImage)`, which
   buries the picture in a base64 data URL; base64 is ~33% bigger than the bytes it carries, and
   the *ciphertext* is what gets uploaded and pointed at, so that third was paid on every stored
   and transferred byte. Encrypting the bytes directly makes each record ~25% smaller. A record
   with no `fmt` is the old layout and **still opens** — nothing needs migrating.
3. **Wrap** — `container.ts:packBytes()` lays the ciphertext out as the pixels of an 8-bit
   greyscale PNG (first 4 pixels hold the payload length, so `unpackBytes()` is an exact
   inverse even after row padding). PNG is lossless, so a host re-compressing the file is
   harmless, and widening to RGB/RGBA is tolerated by reading channel 0.
4. **Host + verify** — `imgbb.ts` uploads with the `IMB_API` key, then **immediately downloads
   the file back**, unpacks it and compares SHA-256. Only on an exact match is the pointer
   written: `VaultImage.remote = { url, iv, sha, bytes, delete_url }` (~300 bytes).
5. **Read** — `openVaultImage()` fetches → unpacks → verifies the SHA → AES-GCM opens it. A host
   that changed or lost the file raises "unavailable", never silently-wrong bytes.

### Failure behaviour (the part that matters)

- **No `IMB_API` key, out of quota, rate-limited, upload failed, or verification mismatch** →
  the image is stored **inline** instead (`VaultImage.enc`), i.e. exactly the previous
  behaviour. `sealForVault()` can never lose a picture.
- Firestore rules accept **either** `enc` **or** `remote`, never both.
- The gallery pages in `IMAGE_PAGE = 4` with **"Load more"**, so a 100-image item decrypts and
  downloads 4 at a time instead of all at once.

### Honest caveats (also printed in `.env.example`)

- This is a client-only site, so `IMB_API` ships inside the JavaScript bundle. Use a key you
  can rotate; only ciphertext is ever uploaded.
- imgbb promises no durable storage — which is exactly why every read is SHA-verified.
- Free tier has rate limits; one upload may be ≤ 32 MB (we are far under).
- imgbb has **no delete API**, only the per-image `delete_url` we store. Deleting a vault image
  removes the Firestore record, not the hosted file.
- The URL is opaque and names a random image id; it points at ciphertext, not at a picture.

**Why not Firebase Storage?** Still the better long-term home (real object storage, deletes,
CDN). imgbb is simply the smaller change today: no `storage.rules`, no bucket wiring, and the
encrypt-then-verify path is identical either way.

---

## 9. Knock-on effects on existing features (must be handled, not ignored)

| Feature | Effect of the Vault | Proposed handling |
|---------|--------------------|-------------------|
| **Search** (`lib/search.ts`) | Encrypted `title`/`code`/`tags` can't be matched while locked | Search only the clear routing fields while locked; **merge decrypted vault items into search when unlocked**. Show "🔒 unlock to search vault" otherwise. |
| **Duplicate finder** (`lib/similar.ts`) | Needs plaintext code | Runs over vault items only while unlocked. |
| **Copy menu / share-as-image** (`CopyMenu.tsx`, `codeImage.ts`) | Needs plaintext | Available only when unlocked. |
| **Sharing** (`lib/share.ts`) | A normal share writes a **plaintext copy** → would silently defeat the vault | **Block sharing vault items by default.** Optional phase-2 "secure share": encrypt the share payload with a passphrase and have the public `/share/:token` viewer prompt + decrypt client-side. |
| **Export / import** (`utils.ts`) | Plaintext export would leak | Export vault items **encrypted** (including `meta/vault`, so the file round-trips), with an explicit opt-in to export decrypted. |
| **Version history** (`versions`) | Plaintext `code` would leak | Encrypt vault versions with the same DEK. |
| **Insights** (`Insights.tsx`) | Language/tag stats need metadata | Count vault items only when unlocked, using clear metadata. |
| **SnippetsProvider** (`hooks/snippets.tsx`) | Single plaintext snapshot | New **`VaultProvider`** for `vault/*`; the Shell combines counts. `GroupMeta` gains `vault`. |
| **Offline cache** | Ciphertext is cached — good | Note the caveat in §10. |

---

## 10. Firestore rules (draft)

Same owner-only gate as today, plus strict shape validation for the encrypted area:

```
match /users/{uid}/meta/{docId} {
  allow read, delete: if isOwner(uid);
  allow create, update: if isOwner(uid);       // KDF params + wrapped key, size-checked
}
match /users/{uid}/vault/{itemId} {
  allow read, delete: if isOwner(uid);
  allow create, update: if isOwner(uid)
    && request.resource.data.vault == true
    && request.resource.data.enc.iv is string && request.resource.data.enc.iv.size() <= 64
    && request.resource.data.enc.ct is string && request.resource.data.enc.ct.size() <= 400000;
  match /images/{imageId} {
    allow read, delete: if isOwner(uid);
    allow create, update: if isOwner(uid)
      && request.resource.data.ct is string && request.resource.data.ct.size() <= 900000;
  }
  match /versions/{vid} {
    allow read, delete: if isOwner(uid);
    allow create, update: if isOwner(uid);
  }
}
```
(Deploy with `npx firebase-tools deploy --only firestore:rules --project snippetvault-ed43b`, as before.)

---

## 11. UX / screens

- **Sidebar:** new **"Vault"** item (lock icon) with a count, plus a lock badge on vault groups.
- **`/vault` page:** locked state shows a single passphrase prompt + "Set up vault"; unlocked state lists items like the Library but with lock affordances. Reuses `SnippetCard`.
- **Move to / from Vault:** a card/detail action and ⌘K command.
- **Header:** a small lock/unlock indicator; clicking locks immediately.
- **Settings → Security:** App lock (on/off, change, auto-lock timeout, biometrics) — this is the "change the passcode in the menu" the user asked for.
- **Settings → Vault:** set / change passphrase, show recovery key, "forgot passphrase?" flow, export (encrypted).
- **Mobile nav:** the bottom bar already has **6 tabs** (Library, Groups, +, Shared, Insights, Settings). A 7th would be cramped — options in §12 (decision **D4**).

---

## 12. Decisions (locked)

| ID | Decision | Chosen |
|----|----------|--------|
| **D1** | Vault security model | **Real client-side encryption (Option B)** |
| **D2** | KDF | **PBKDF2-SHA-256 first** (Argon2id later if wanted) |
| **D3** | Metadata while locked | **Hide everything** (list shows "🔒 Locked item") |
| **D4** | Mobile entry to the Vault | **Sidebar item + header lock button** (keep the 6-tab bottom bar) |
| **D5** | Recovery key | **Included** — shown once at setup |
| **D6** | Sharing vault items | **Blocked entirely** (secure passphrase-shares = phase 2, optional) |
| **D7** | Images | **Raise the cap now** + "Load more" pager; Storage migration later |
| **D8** | App passcode scope | **Per-device** (not synced) |
| **D9** | Biometric unlock (WebAuthn) | **Phase 2** |

---

## 13. Risks & edge cases

- **Forgotten passphrase** → permanent data loss unless a recovery key exists. Must be stated before setup.
- **Plaintext remnants:** moving a snippet into the vault deletes the plaintext doc server-side, but the browser's persistent cache may retain the old bytes on disk until compaction. Practical mitigation: lock + reload after a move; on-device disk forensics is out of scope and should be stated.
- **Weak passphrases:** enforce minimum length + strength meter; the KDF slows but does not eliminate guessing.
- **Unlocked-but-visible:** decrypted content on screen is readable by anyone watching; auto-lock helps.
- **Share leak:** covered by blocking vault shares (D6).
- **Multi-device:** the same passphrase opens the vault anywhere (that's the point) — data is decrypted per device, never stored decrypted.
- **Demo mode (`?demo=1`):** encryption is pure client-side, so the whole vault works in demo — good for testing (shares remain disabled).
- **Large payloads:** encrypted code base64 is ~1.33× the plaintext; the rules limits above account for the current 200 KB code cap.
- **Browser support:** `crypto.subtle` needs a secure context (https/localhost) — already the case.

---

## 14. Phases

1. ✅ **Foundations** — `src/lib/crypto.ts` (KDF, DEK wrap/unwrap, AES-GCM seal/open) + 20 unit tests (round-trip, wrong passphrase, tamper, recovery key, passphrase change).
2. ✅ **Vault core** — `src/lib/vault.ts` (store + seal/open), `src/hooks/vault.tsx` (`VaultProvider`: setup, unlock, recovery, auto-lock, change passphrase, move in/out), `src/pages/Vault.tsx` (`/vault` list + `/vault/:id` detail), routes, sidebar item + header lock button, "Move to Vault" on snippet detail and group view. Firestore rules for `meta/vault` + `vault/**` **deployed**.
   - *Boundary of this phase:* vault items are **read-only** in place (copy, move out, delete) — editing inside the vault comes later.
3. ✅ **Feature integration** — while the vault is **unlocked**, its decrypted items join **Library search** (own read-only “In your vault” section) and the **⌘K command palette** (its own section, opens `/vault/:id`). `/s/:id` for a vault id now **redirects** to `/vault/:id` (or shows a “unlock the vault” notice when locked). Vault items are **never** part of multi-select / delete / group / star actions (the card is rendered read-only), and **never** appear in the plaintext **export** (`exportJson` only sees `snippets`, so nothing leaks). Sharing stays impossible by construction.
   - *Deliberate:* vault items are **excluded from Insights and duplicate detection** — those are library-analytics views ("delete the extras" advice would be wrong for encrypted items). Encrypted vault backup/restore is deferred.
   - *Keypad entry (added after review):* the app code is entered on a **custom numeric keypad** (`src/components/PasscodePad.tsx`), not a text field — the native phone keyboard is never raised. Codes are consequently **digits only, 4–12** (`MIN_CODE_LEN` / `MAX_CODE_LEN` in `applock.ts`). The `/admin` passcode keeps its text field: it is a build-time `ADMIN_PASSCODE` that may not be numeric.
4. ✅ **App lock** — `src/lib/applock.ts` (PBKDF2 code hash, per-device config in `localStorage`, session marker in `sessionStorage`, auto-lock window) + 13 unit tests; `src/hooks/applock.tsx` (`AppLockProvider`: enable / disable / change / setAutoLock / unlock / lockNow, activity + visibility auto-lock); `src/components/LockScreen.tsx` (full-screen gate with brute-force back-off and a "forgot code" escape hatch). Gated in `App.tsx` (cold start + after the timeout). **Settings → Security** turns it on/off, changes the code and sets the timeout — with an honest "device privacy screen, not encryption" note. `src/components/PwMeter.tsx` shows **live password/app-code requirements** (+ strength) on the Login page and in Settings.
5. ✅ **Unlimited images (vault only)** — `src/lib/container.ts` (greyscale-PNG byte container: `packBytes`/`unpackBytes`, CRC32 chunks, deflate/inflate, full filter reversal, RGB/RGBA tolerance) + 8 tests; `src/lib/imgbb.ts` (key from `IMB_API`, `uploadPng`/`fetchBlob`); `sealBytes`/`openBytes`/`sha256` in `crypto.ts`; `sealForVault()` + `openVaultImage()` in `vault.tsx`'s data layer (**encrypt → pack → upload → download → SHA-256 verify → store pointer**, inline fallback on any failure); `compressAll()` (no count cap); `VaultImage.remote`; vault hook `addImages`/`removeImage`/paged `loadImages` with a metadata cache; **"Add images"** + **"Load more"** in `/vault/:id` (`ImageGallery` gained a `max` prop — `Infinity` in the vault); `firestore.rules` accepts `enc` *or* `remote`. Regular snippets stay capped at 5.
   - *Validated live:* one real imgbb upload round-tripped byte-for-byte (SHA-256 match) using the `IMB_API` key, then removed. A throwaway test proved the same path with the host mocked (offline / mangled / tampered / missing / wrong passphrase).
   - *Post-review (byte format):* `sealImage()`/`openImage()` now encrypt the image **bytes** behind a small JSON header instead of a base64 data URL (`packImage`/`unpackImage` in `vault.ts`), so every stored/uploaded record is ~25% smaller. `VaultImage.fmt = 2` marks the new layout; records without it are the old one and still open, so **no migration is needed**. The inline fallback keeps the same `fmt` contract, and non-data-URL values fall back to format 1 rather than failing a move.
6. **Polish** — in-vault editing, recovery-key regeneration, biometrics (WebAuthn), optional encrypted secure-share.
7. **Docs** — README + `SETUP.md` updates.

### Delivered files (phases 1–5)
`src/lib/crypto.ts`, `src/lib/vault.ts`, `src/lib/applock.ts`, `src/lib/imgbb.ts`, `src/lib/container.ts`,
`src/hooks/vault.tsx`, `src/hooks/applock.tsx`, `src/pages/Vault.tsx`, `src/components/LockScreen.tsx`,
`src/components/PasscodePad.tsx`,
`src/components/PwMeter.tsx`, `src/lib/__tests__/crypto.test.ts`, `src/lib/__tests__/vault.test.ts`,
`src/lib/__tests__/applock.test.ts`, `src/lib/__tests__/container.test.ts`,
`src/lib/__tests__/vault-images.test.ts`;
edited `src/main.tsx`, `src/App.tsx`, `src/components/Shell.tsx`, `src/components/Icon.tsx`,
`src/components/ImageGallery.tsx`, `src/components/SnippetCard.tsx`, `src/components/CommandPalette.tsx`,
`src/components/SettingsDialog.tsx`, `src/pages/Detail.tsx`, `src/pages/Library.tsx`, `src/pages/Login.tsx`,
`src/lib/images.ts`, `src/index.css`, `firestore.rules`, `vite.config.ts`, `src/vite-env.d.ts`, `.env.example`.

---

## 15. Files this would add / touch (for reference)

**New:** `src/lib/crypto.ts`, `src/lib/vault.ts`, `src/hooks/vault.tsx`, `src/pages/Vault.tsx`,
`src/components/VaultUnlock.tsx`, `src/components/AppLockScreen.tsx`,
`src/lib/__tests__/crypto.test.ts`, plus a `Security` section in `SettingsDialog.tsx`.

**Touched:** `src/lib/types.ts`, `src/hooks/snippets.tsx`, `src/components/Shell.tsx`,
`src/components/AccountMenu.tsx` (optional entry), `src/lib/search.ts`, `src/lib/similar.ts`,
`src/lib/share.ts`, `src/lib/utils.ts`, `src/lib/images.ts`, `src/components/ImageGallery.tsx`,
`src/pages/Insights.tsx`, `src/App.tsx`, `firestore.rules`, `README.md`, `SETUP.md`.
