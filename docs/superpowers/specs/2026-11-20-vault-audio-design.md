# Vault audio (voice messages and music)

Status: approved 2026-11-20.

## Intent
The user uploads voice messages and sometimes music and wants them stored in the encrypted Vault, either attached to a Vault item or on their own, alongside images (images only, audio only, or both).

## Goals
- Audio can be attached to a Vault item (next to its images) and stored standalone in a "Voice & music" section on the Vault page, mirroring the existing item images and the image gallery.
- Everything is encrypted on the device; the server and imgbb only see ciphertext.

## Non-goals
Recording in the app, playlists, audio in share links, audio outside the Vault.

## Constraints
- Audio is too large for inline Firestore (about 700 KB), so it always uses the imgbb path and needs `IMB_API`. Without it, upload is disabled with an explanation.
- imgbb ceiling is 32 MB; the app caps audio at about 25 MB. Accepted types: mp3, m4a, ogg, wav, webm.
- imgbb offers no durability promise; every read is verified against the stored SHA-256, and a mismatch shows "unavailable".

## Approaches considered
1. **Reuse the Vault image pipeline (chosen).** `container.ts` wraps ciphertext in a PNG, `imgbb.ts` uploads it, and Firestore keeps a pointer plus hash. Least new code and the same security model.
2. Firebase Storage. Needs the Blaze plan, new rules and a second storage system.
3. Chunking across Firestore documents. Bloats the database and burns quotas.

## Design
- **Data:** `vault/{id}/audio/{audioId}` for item audio and `vaultAudio/{audioId}` for standalone audio. Each record is a `remote` pointer (`url`, `iv`, `sha`, `bytes`, `delete_url`) like `VaultImage`; standalone records add plaintext `created_at` for sorting. Filename, MIME type and duration are encrypted inside the sealed payload.
- **Upload:** validate type and size, seal with a fresh IV and per-file AAD, pack into a PNG, upload, download back and verify, then write the pointer. The pointer is never written before verification.
- **Playback:** download, verify, decrypt on first play, and play from an in-memory blob URL. Revoke the URL when the vault locks or the item closes.
- **UI:** an audio list with player (play/pause, seek, name, duration) in the item view, and a "Voice & music" section on the Vault page next to the gallery.
- **Cleanup:** deleting an item removes its audio records and calls the best-effort imgbb delete; vault reset removes `vaultAudio` too; deleting one file removes its record and hosted blob.
- **Rules and docs:** `firestore.rules` gets two paths with shape and size checks like the image paths. README and `docs/security.md` are updated.
- **Tests:** seal/open round trip, hash-mismatch path, size and type rejection, and cleanup on item delete and vault reset.

## Left to the builder
Exact component layout and naming, the audio-count field on items, and paging for the standalone list.
