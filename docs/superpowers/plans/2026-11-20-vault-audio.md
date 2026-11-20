# Vault audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user store audio files (voice messages, music) in the encrypted Vault, attached to a Vault item or standalone in a "Voice & music" section, with an in-app player.

**Architecture:** Audio mirrors Vault images. Bytes are sealed with AES-256-GCM (AAD = audio id), wrapped in a PNG, hosted on imgbb, downloaded back and SHA-256-verified before a pointer is written to Firestore. The filename, type, size and duration are sealed separately into a small `meta` blob stored in the Firestore record, so lists render without downloading any audio. There is no inline fallback: audio needs `IMB_API`.

**Tech Stack:** React 19, TypeScript, Firestore, Web Crypto, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-20-vault-audio-design.md`

## Global Constraints

- Max audio file size: `25 * 1024 * 1024` bytes. Accepted MIME types: `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/ogg`, `audio/wav`, `audio/x-wav`, `audio/webm`.
- Audio is never stored inline in Firestore. No `IMB_API` means uploads are refused with a clear message.
- Firestore paths: `users/{uid}/vault/{itemId}/audio/{audioId}` and `users/{uid}/vaultAudio/{audioId}`.
- Plaintext in Firestore: `remote` pointer fields, `meta` ciphertext, and `created_at` (standalone only). Everything else is sealed.
- Monochrome design: reuse `.btn`, `.btn-ghost`, tokens from `src/index.css`. No new colours.
- Verify with `npm test`, `npm run typecheck`, `npm run build`.

## Decisions beyond the spec (my calls, flagged for review)

- **Separate sealed `meta`** (name, mime, size, duration, created_at) next to the hosted blob. Otherwise listing names would mean downloading every file. AAD for meta is `${id}:meta`; the audio bytes use AAD `id`.
- **CSP:** both `firebase.json` and `vercel.json` set `default-src 'self'` with no `media-src`, so a `blob:` audio element would be blocked. Add `media-src 'self' blob:` to both.
- **Firestore rule cap:** the existing `remote.bytes <= 4000000` is far below 25 MB, so audio gets its own rule function with `<= 27000000`.
- **Move out:** a normal snippet cannot hold audio, so `moveOut` refuses an item with `audio_count > 0` (the user removes the audio first).
- **Vault cleanup:** `wipeVault`, `wipeUserData` and `deleteVaultItem` must remove audio records and their hosted blobs.

## Review Focus

- A file over 25 MB, an unsupported type, or a zero-byte file is refused before any upload.
- Host returns altered bytes: no record is written and the user sees an error.
- imgbb offline mid-upload with several files: files already stored stay, the failing one is reported, `audio_count` matches the records actually written.
- A hosted file later fails the hash check on play: the player shows "unavailable" and stays usable.
- Vault locks while audio is playing or loaded: playback stops and the blob URL is revoked.

---

### Task 1: Audio sealing, hosting and verification (library)

**Files:**
- Create: `src/lib/vault-audio.ts`
- Modify: `src/lib/vault.ts` (export `VaultImageRemote` and `purgeHosted`)
- Test: `src/lib/__tests__/vault-audio.test.ts` (mock `../imgbb` exactly as `vault-images.test.ts` does)

**Interfaces:**
- Produces:
  - `AUDIO_MAX_BYTES: number`, `AUDIO_TYPES: readonly string[]`
  - `interface AudioInfo { name: string; mime: string; size: number; duration: number; created_at: string }`
  - `interface VaultAudio { id: string; meta: Sealed; remote: VaultImageRemote }`
  - `interface VaultGalleryAudio extends VaultAudio { created_at: string }`
  - `checkAudioFile(file: { name: string; type: string; size: number }): string | null` returns a user-facing error or `null`
  - `sealAudio(key: CryptoKey, id: string, info: AudioInfo, bytes: Uint8Array<ArrayBuffer>): Promise<VaultAudio>` throws `"audio-needs-host"` without a key, and `"audio-host-failed"` when upload or verification fails
  - `openAudioInfo(key: CryptoKey, audio: VaultAudio): Promise<AudioInfo>`
  - `openAudioBytes(key: CryptoKey, audio: VaultAudio): Promise<Uint8Array<ArrayBuffer>>` throws `"hosted-audio-unavailable"` on size or hash mismatch
  - `readAudioDuration(file: File): Promise<number>` seconds, `0` if the browser can't read it

- [ ] **Step 1: Write failing tests in `vault-audio.test.ts`**
  - `checkAudioFile` returns an error for `{type:"video/mp4"}`, for `size: 0`, and for `size: AUDIO_MAX_BYTES + 1`; returns `null` for `{name:"a.mp3", type:"audio/mpeg", size: 1000}`.
  - Round trip: `sealAudio` then `openAudioBytes` returns the original bytes, and `openAudioInfo` returns the original `AudioInfo`.
  - Record shape: the sealed record has `remote.url`, `remote.sha`, `remote.bytes`, and no `enc` field.
  - Mangled host (`host.mangle = true`): `sealAudio` rejects with `"audio-host-failed"`.
  - Offline host: `sealAudio` rejects with `"audio-host-failed"`.
  - No key (`hasImgbb: () => false` via a mutable flag in the mock): rejects with `"audio-needs-host"`.
  - Tamper: change one byte in the hosted file, `openAudioBytes` rejects with `"hosted-audio-unavailable"`.
  - Wrong key: `openAudioInfo` with a second key rejects.

- [ ] **Step 2: Run `npx vitest run src/lib/__tests__/vault-audio.test.ts`; expect FAIL (module not found).**

- [ ] **Step 3: Implement `vault-audio.ts`** per the interfaces. Reuse `sealBytes`, `sealText`, `openBytes`, `openText`, `sha256`, `fromBase64`, `toBase64` from `crypto.ts`, `packBytes`/`unpackBytes` from `container.ts`, and `uploadPng`/`fetchBlob`/`hasImgbb` from `imgbb.ts`. Follow the seal, upload, download, hash-compare flow in `sealForVault` (`src/lib/vault.ts:245`), but throw instead of falling back to inline. In `vault.ts`, add `export` to `interface VaultImageRemote` and to `purgeHosted`.

- [ ] **Step 4: Run the new test file; expect all PASS. Run `npm run typecheck`.**

- [ ] **Step 5: Commit** `git add src/lib/vault-audio.ts src/lib/vault.ts src/lib/__tests__/vault-audio.test.ts && git commit -m "Vault: seal, host and verify audio"`

### Task 2: Firestore storage, cleanup, rules and CSP

**Files:**
- Modify: `src/lib/vault-audio.ts` (CRUD), `src/lib/vault.ts` (`VaultItem.audio_count?: number`, `VaultEntry.audio_count`, `entryOf`, `deleteVaultItem`), `src/lib/account.ts` (`collectVault`), `firestore.rules`, `firebase.json`, `vercel.json`
- Test: `src/lib/__tests__/vault-cleanup.test.ts` (extend with the same in-memory Firestore), `src/lib/__tests__/vault.test.ts` (extend `entryOf`)

**Interfaces:**
- Consumes: Task 1 types, `purgeHosted` from `vault.ts`.
- Produces in `vault-audio.ts`:
  - `listVaultAudio(uid: string, itemId: string): Promise<VaultAudio[]>`
  - `putVaultAudio(uid: string, itemId: string, audio: VaultAudio): Promise<void>`
  - `deleteVaultAudio(uid: string, itemId: string, audioId: string): Promise<void>` deletes the record, then the hosted blob best-effort
  - `watchGalleryAudio(uid: string, cb: (a: VaultGalleryAudio[]) => void, onError?: () => void): () => void` newest first
  - `putGalleryAudio(uid: string, audio: VaultGalleryAudio): Promise<void>`
  - `deleteGalleryAudio(uid: string, audioId: string): Promise<void>`
- `entryOf` returns `audio_count: item.audio_count ?? 0`; `VaultEntry` gains `audio_count: number`.

- [ ] **Step 1: Write failing tests**
  - `deleteVaultItem` on an item with two audio docs removes both docs and calls `deleteHostedImage` for each `delete_url`.
  - `deleteVaultAudio` and `deleteGalleryAudio` remove the record and call the host delete once.
  - `wipeVault` and `wipeUserData` remove `users/u/vault/i/audio/*` and `users/u/vaultAudio/*` and ask the host to delete their blobs.
  - `entryOf` with `audio_count` undefined gives `0`; with `3` gives `3`.

- [ ] **Step 2: Run `npx vitest run src/lib/__tests__/vault-cleanup.test.ts src/lib/__tests__/vault.test.ts`; expect FAIL.**

- [ ] **Step 3: Implement** the CRUD functions (same shape as `putVaultImage`, `deleteVaultImage`, `watchGalleryImages`, `putGalleryImage`, `deleteGalleryImage` in `vault.ts`). In `deleteVaultItem`, also read and delete the `audio` sub-collection and pass its records to `purgeHosted`. In `collectVault`, collect item `audio` docs and `vaultAudio` docs with their `delete_url`s.

- [ ] **Step 4: Rules and CSP.** In `firestore.rules` add `isHostedAudio()` (requires `meta` with string `iv` and `ct` where `meta.ct.size() <= 4000`, and `remote` with the same checks as `isSealedImage()` but `bytes <= 27000000`, no `enc`). Add `match /users/{uid}/vault/{itemId}/audio/{audioId}` and `match /users/{uid}/vaultAudio/{audioId}` (the latter also requires `created_at` string `<= 40`), owner-only. Add `media-src 'self' blob:` to the CSP string in both `firebase.json` and `vercel.json` (keep them identical).

- [ ] **Step 5: Run the two test files, then `npm test` and `npm run typecheck`; expect PASS.**

- [ ] **Step 6: Commit** `git add -A src firestore.rules firebase.json vercel.json && git commit -m "Vault: audio records, cleanup, rules and CSP"`

### Task 3: Vault hook API

**Files:**
- Modify: `src/hooks/vault.tsx`
- Test: `src/lib/__tests__/vault-audio-hook.test.tsx` (render `VaultProvider` only if the existing hook tests do; otherwise cover the guard logic via exported pure helpers and keep the hook thin)

**Interfaces:**
- Consumes: Task 1 and 2 functions, `newId` from `utils.ts`.
- Produces on `VaultCtx`:
  - `interface AudioEntry { id: string; info: AudioInfo }`
  - `audioGallery: VaultGalleryAudio[]`
  - `addAudio(itemId: string | null, files: File[]): Promise<{ added: number; error?: string }>` — `null` means standalone
  - `removeAudio(itemId: string | null, audioId: string): Promise<void>`
  - `loadAudio(itemId: string | null): Promise<AudioEntry[]>` decrypts only `meta`
  - `openAudioBlob(itemId: string | null, audioId: string): Promise<Blob>` downloads, verifies, decrypts; the blob uses the stored `mime`

- [ ] **Step 1: Write failing tests** for: `addAudio` returns `{added: 0, error}` when `hasImgbb()` is false; each file failing `checkAudioFile` is skipped with an error message and valid files in the same batch still upload; after one upload fails, `audio_count` on the item equals the number of records actually written; `moveOut` rejects when the item has `audio_count > 0`.

- [ ] **Step 2: Run the new test; expect FAIL.**

- [ ] **Step 3: Implement** in `VaultProvider`: a `watchGalleryAudio` effect like the gallery one; `addAudio` (loop over files: validate, `readAudioDuration`, read bytes, `sealAudio`, then `putVaultAudio` or `putGalleryAudio`; for an item bump `audio_count` once at the end by the number stored, in a `finally` so partial success is counted); `removeAudio` (delete, then decrement `audio_count`, floor 0); `loadAudio`; `openAudioBlob`. Cache item audio records in a ref cleared in `lock()` and `resetVault()`, like `imageMeta`. Add `audioGallery` to `resetVault`'s clears. Add the `moveOut` guard with the message "Remove this item's audio first. Normal snippets can't hold audio."

- [ ] **Step 4: Run tests, `npm test`, `npm run typecheck`; expect PASS.**

- [ ] **Step 5: Commit** `git commit -am "Vault: audio hook API"`

### Task 4: Player and audio section UI

**Files:**
- Create: `src/components/AudioPlayer.tsx`, `src/components/AudioSection.tsx`
- Modify: `src/pages/Vault.tsx` (item view and `/vault` page), `src/components/Icon.tsx` (add `music` and `pause` icons if missing; `play` exists)
- Test: `src/components/__tests__/audio-player.test.tsx`

**Interfaces:**
- Consumes: `useVault()` audio API from Task 3, `hasImgbb()`.
- Produces:
  - `AudioPlayer({ info, load, onRemove, busy }: { info: AudioInfo; load: () => Promise<Blob>; onRemove?: () => void; busy?: boolean })` — shows name and duration; first play calls `load()`, creates an object URL, plays; seek bar; if `load()` rejects shows "Unavailable" with a Retry button; revokes the object URL on unmount.
  - `AudioSection({ itemId, title, hint }: { itemId: string | null; title: string; hint?: string })` — lists `loadAudio(itemId)`, add button and drop zone (`accept` from `AUDIO_TYPES`), confirm before delete via `useModal().confirm`. When `hasImgbb()` is false the add controls are disabled and the hint says audio needs `IMB_API`. Renders nothing decrypted unless `status === "unlocked"`. Re-loads when the audio count or id list changes, like `GallerySection` (`Vault.tsx:102`).

- [ ] **Step 1: Write failing tests** (`audio-player.test.tsx`, stub `HTMLMediaElement.prototype.play/pause` and `URL.createObjectURL/revokeObjectURL`): shows the filename and a formatted duration (`3725` seconds renders `1:02:05`, `65` renders `1:05`); `load` is not called until play is pressed, then once; a rejected `load` shows "Unavailable" and Retry calls `load` again; unmounting calls `revokeObjectURL` for a loaded URL.

- [ ] **Step 2: Run `npx vitest run src/components/__tests__/audio-player.test.tsx`; expect FAIL.**

- [ ] **Step 3: Implement** both components using existing classes only. In `Vault.tsx` render `<AudioSection itemId={entry.id} title="Voice & music" />` below the images block in the item view, and `<AudioSection itemId={null} title="Voice & music" />` after `<GallerySection />` on the page. Update the page's count line to mention audio count from `audioGallery.length`. Hide the item view's "Move out" button action behind the `moveOut` guard's toast (it already throws; show its message).

- [ ] **Step 4: Run tests, `npm test`, `npm run typecheck`, `npm run build`; expect PASS.**

- [ ] **Step 5: Verify in the browser.** `npm run dev`, sign in with a real account (vault is unavailable in demo mode), unlock the Vault, add a small mp3 to an item and to the standalone section, play both, delete one, lock and unlock. Check light, dark and a 375px width, and the console for CSP errors.

- [ ] **Step 6: Commit** `git add -A src && git commit -m "Vault: audio player and sections"`

### Task 5: Docs

**Files:**
- Modify: `README.md`, `docs/security.md`

- [ ] **Step 1:** README: add audio to the Vault feature bullets, the `IMB_API` row ("images and audio"), the Vault section (limit, types, no inline fallback, move-out rule), the architecture table (`src/lib/vault-audio.ts`), and the Firestore rules summary. `docs/security.md`: add the audio lifecycle next to "Hosted-image lifecycle", the `media-src` CSP addition, and the imgbb durability caveat.

- [ ] **Step 2: Run `npm test && npm run typecheck && npm run build`; expect PASS.**

- [ ] **Step 3: Deploy note for the user (do not run):** after merging, `firestore.rules` must be deployed with `npx firebase-tools deploy --only firestore:rules --project snippetvault-ed43b --non-interactive`, otherwise uploads fail with permission-denied.

- [ ] **Step 4: Commit** `git commit -am "Docs: Vault audio"`
