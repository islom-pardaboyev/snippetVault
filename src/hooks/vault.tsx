import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEMO, useAuth } from "./auth";
import { useSnippets } from "./snippets";
import {
  changeVaultPassphrase, createVaultKey, unlockVaultKey, unlockVaultKeyWithRecovery,
} from "../lib/crypto";
import { compressAll } from "../lib/images";
import { newId } from "../lib/utils";
import type { Snippet, SnippetImage } from "../lib/types";
import {
  deleteSnippetImages, deleteSnippetVersions, deleteVaultImage, deleteVaultItem, entryOf, getVaultMeta,
  listVaultImages, makeVaultItem, openPayload, openVaultImage, putVaultImage, putVaultItem, putVaultMeta,
  readSnippetImages, sealForVault, sealPayload, snippetOf, watchVaultItems, writeSnippetImage,
  type VaultEntry, type VaultImage, type VaultItem, type VaultMeta, type VaultPayload,
} from "../lib/vault";
import { revokeShare } from "../lib/share";

export type VaultStatus = "loading" | "unavailable" | "unset" | "locked" | "unlocked";

interface VaultCtx {
  /** false in demo mode or when signed out — the vault needs a real account. */
  available: boolean;
  status: VaultStatus;
  /** Encrypted items (safe to count while locked). */
  items: VaultItem[];
  /** Decrypted items — empty unless unlocked. */
  entries: VaultEntry[];
  recoveryAvailable: boolean;
  /** Create the vault; resolves with the one-time recovery key to show the user. */
  setup(passphrase: string, withRecovery?: boolean): Promise<string | null>;
  unlock(passphrase: string): Promise<void>;
  unlockWithRecovery(recoveryKey: string): Promise<void>;
  lock(): void;
  changePassphrase(current: string, next: string): Promise<void>;
  /** Move a plaintext snippet into the vault (encrypt, then delete the original). */
  moveIn(s: Snippet): Promise<void>;
  /** Move every snippet in a group into the vault; returns how many moved. */
  moveGroupIn(group: string): Promise<number>;
  /** Return a vault item to normal snippets (decrypt, then delete from the vault). */
  moveOut(id: string): Promise<void>;
  updateEntry(entry: VaultEntry): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  /**
   * Add images to a vault item. There is **no count cap** in the vault: every image is
   * encrypted here, then hosted on imgbb when a key is configured (inline fallback otherwise).
   */
  addImages(id: string, files: File[]): Promise<{ added: number; error?: string }>;
  removeImage(id: string, imageId: string): Promise<void>;
  /** Decrypt a slice of an item's images, so the gallery can show them a page at a time. */
  loadImages(id: string, offset?: number, limit?: number): Promise<SnippetImage[]>;
}

const Ctx = createContext<VaultCtx | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { snippets, save, remove } = useSnippets();
  const uid = user?.uid ?? null;
  const available = !DEMO && !!uid;

  const [status, setStatus] = useState<VaultStatus>("loading");
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const keyRef = useRef<CryptoKey | null>(null);
  /** Image records per item, so paging the gallery doesn't re-download every record each time. */
  const imageMeta = useRef<Map<string, VaultImage[]>>(new Map());

  /* load the vault metadata once we know who is signed in */
  useEffect(() => {
    if (!uid || DEMO) {
      setStatus(DEMO ? "unavailable" : "loading");
      setMeta(null);
      keyRef.current = null;
      setEntries([]);
      return;
    }
    let alive = true;
    setStatus("loading");
    getVaultMeta(uid)
      .then((m) => { if (!alive) return; setMeta(m); setStatus(m ? "locked" : "unset"); })
      .catch(() => { if (alive) setStatus("unset"); });
    return () => { alive = false; };
  }, [uid]);

  /* live list of encrypted items (count is shown even while locked) */
  useEffect(() => {
    if (!uid || DEMO) { setItems([]); return; }
    return watchVaultItems(uid, setItems);
  }, [uid]);

  const lock = useCallback(() => {
    keyRef.current = null;
    imageMeta.current.clear();
    setEntries([]);
    setStatus((s) => (s === "unlocked" ? "locked" : s));
  }, []);

  /* decrypt on demand whenever the item list changes while unlocked */
  useEffect(() => {
    const key = keyRef.current;
    if (status !== "unlocked" || !key) { setEntries([]); return; }
    let alive = true;
    Promise.all(items.map(async (it) => entryOf(it, await openPayload(key, it))))
      .then((list) => { if (alive) setEntries(list); })
      .catch(() => { if (alive) setEntries([]); });
    return () => { alive = false; };
  }, [items, status]);

  /* auto-lock when the tab/app goes to the background */
  useEffect(() => {
    if (status !== "unlocked") return;
    const onHide = () => { if (document.hidden) lock(); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [status, lock]);

  const setup = useCallback(async (passphrase: string, withRecovery = true): Promise<string | null> => {
    if (!uid) throw new Error("Sign in to use the vault.");
    const material = await createVaultKey(passphrase, { withRecovery });
    const now = new Date().toISOString();
    const next: VaultMeta = {
      v: 1,
      kdf: material.kdf,
      wrapped_dek: material.wrapped_dek,
      recovery_wrapped_dek: material.recovery_wrapped_dek,
      created_at: now,
      updated_at: now,
    };
    await putVaultMeta(uid, next);
    setMeta(next);
    keyRef.current = await unlockVaultKey(passphrase, next.kdf, next.wrapped_dek);
    setStatus("unlocked");
    return material.recovery_key;
  }, [uid]);

  const unlock = useCallback(async (passphrase: string) => {
    if (!meta) throw new Error("There's no vault on this account yet.");
    keyRef.current = await unlockVaultKey(passphrase, meta.kdf, meta.wrapped_dek); // throws DecryptionError
    setStatus("unlocked");
  }, [meta]);

  const unlockWithRecovery = useCallback(async (recoveryKey: string) => {
    if (!meta?.recovery_wrapped_dek) throw new Error("This vault has no recovery key.");
    keyRef.current = await unlockVaultKeyWithRecovery(recoveryKey, meta.recovery_wrapped_dek);
    setStatus("unlocked");
  }, [meta]);

  const changePassphrase = useCallback(async (current: string, next: string) => {
    if (!uid || !meta) throw new Error("Unlock the vault first.");
    const rewrapped = await changeVaultPassphrase(current, meta.kdf, meta.wrapped_dek, next);
    const updated: VaultMeta = { ...meta, ...rewrapped, updated_at: new Date().toISOString() };
    await putVaultMeta(uid, updated);
    setMeta(updated);
  }, [uid, meta]);

  const moveIn = useCallback(async (s: Snippet) => {
    const key = keyRef.current;
    if (!uid || !key) throw new Error("Unlock the vault first.");
    const plain = (s.image_count ?? 0) > 0 ? await readSnippetImages(uid, s.id) : [];
    const item = await makeVaultItem(key, { ...s, image_count: plain.length });
    await putVaultItem(uid, item);
    for (const image of plain) await putVaultImage(uid, s.id, await sealForVault(key, image));
    imageMeta.current.delete(s.id);
    // Remove *every* plaintext copy of the snippet, not just the document: its images, its
    // version history (which holds the same code), and — if it was ever shared — the public
    // share too. Leaving any of them behind would leave the snippet readable in the clear.
    if (plain.length) await deleteSnippetImages(uid, s.id);
    await deleteSnippetVersions(uid, s.id);
    if (s.share_token) await revokeShare(s.share_token);
    remove(s.id);
  }, [uid, remove]);

  const moveGroupIn = useCallback(async (group: string) => {
    const inGroup = snippets.filter((s) => s.group === group);
    for (const s of inGroup) await moveIn(s);
    return inGroup.length;
  }, [snippets, moveIn]);

  const moveOut = useCallback(async (id: string) => {
    const key = keyRef.current;
    if (!uid || !key) throw new Error("Unlock the vault first.");
    const item = items.find((i) => i.id === id);
    if (!item) throw new Error("That item isn't in the vault.");
    const payload = await openPayload(key, item);
    const sealed = await listVaultImages(uid, id);
    const images = await Promise.all(sealed.map((im) => openVaultImage(key, im)));
    for (const image of images) await writeSnippetImage(uid, id, image);
    save({ ...snippetOf(entryOf(item, payload)), image_count: images.length, updated_at: new Date().toISOString() });
    await deleteVaultItem(uid, id);
    imageMeta.current.delete(id);
  }, [uid, items, save]);

  const updateEntry = useCallback(async (entry: VaultEntry) => {
    const key = keyRef.current;
    if (!uid || !key) throw new Error("Unlock the vault first.");
    const item = items.find((i) => i.id === entry.id);
    if (!item) throw new Error("That item isn't in the vault.");
    const payload: VaultPayload = {
      title: entry.title,
      language: entry.language,
      description: entry.description,
      ...(entry.notes ? { notes: entry.notes } : {}),
      tags: entry.tags,
      code: entry.code,
      ...(entry.group ? { group: entry.group } : {}),
      favorite: entry.favorite,
    };
    await putVaultItem(uid, { ...item, enc: await sealPayload(key, entry.id, payload), updated_at: new Date().toISOString() });
  }, [uid, items]);

  const deleteEntry = useCallback(async (id: string) => {
    if (!uid) throw new Error("Sign in to use the vault.");
    await deleteVaultItem(uid, id);
    imageMeta.current.delete(id);
  }, [uid]);

  /** Image records for an item, cached so paging the gallery doesn't re-read them all each time. */
  const imageRecords = useCallback(async (id: string): Promise<VaultImage[]> => {
    if (!uid) return [];
    const cached = imageMeta.current.get(id);
    if (cached) return cached;
    const list = await listVaultImages(uid, id);
    imageMeta.current.set(id, list);
    return list;
  }, [uid]);

  const loadImages = useCallback(async (id: string, offset = 0, limit?: number): Promise<SnippetImage[]> => {
    const key = keyRef.current;
    if (!uid || !key) return [];
    const all = await imageRecords(id);
    const slice = limit === undefined ? all.slice(offset) : all.slice(offset, offset + limit);
    return Promise.all(slice.map((im) => openVaultImage(key, im)));
  }, [uid, imageRecords]);

  const addImages = useCallback(async (id: string, files: File[]): Promise<{ added: number; error?: string }> => {
    const key = keyRef.current;
    if (!uid || !key) throw new Error("Unlock the vault first.");
    const item = items.find((i) => i.id === id);
    if (!item) throw new Error("That item isn't in the vault.");

    const { ok, error } = await compressAll(files);
    if (!ok.length) return { added: 0, error: error ?? "No image files to add." };

    // Encrypt first — then hand the bytes to imgbb (as a PNG of ciphertext) and verify the
    // round trip. An unavailable host falls back to inline storage, so nothing is ever lost.
    for (const c of ok) {
      const image: SnippetImage = {
        id: newId(), data: c.data, w: c.w, h: c.h, size: c.size, created_at: new Date().toISOString(),
      };
      await putVaultImage(uid, id, await sealForVault(key, image));
    }
    await putVaultItem(uid, { ...item, image_count: (item.image_count ?? 0) + ok.length, updated_at: new Date().toISOString() });
    imageMeta.current.delete(id);
    return error ? { added: ok.length, error } : { added: ok.length };
  }, [uid, items]);

  const removeImage = useCallback(async (id: string, imageId: string) => {
    if (!uid) throw new Error("Sign in to use the vault.");
    await deleteVaultImage(uid, id, imageId);
    imageMeta.current.delete(id);
    const item = items.find((i) => i.id === id);
    if (item && item.image_count > 0) {
      await putVaultItem(uid, { ...item, image_count: item.image_count - 1, updated_at: new Date().toISOString() });
    }
  }, [uid, items]);

  const value = useMemo<VaultCtx>(() => ({
    available, status, items, entries, recoveryAvailable: !!meta?.recovery_wrapped_dek,
    setup, unlock, unlockWithRecovery, lock, changePassphrase,
    moveIn, moveGroupIn, moveOut, updateEntry, deleteEntry, addImages, removeImage, loadImages,
  }), [available, status, items, entries, meta, setup, unlock, unlockWithRecovery, lock, changePassphrase, moveIn, moveGroupIn, moveOut, updateEntry, deleteEntry, addImages, removeImage, loadImages]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVault() {
  const c = useContext(Ctx);
  if (!c) throw new Error("VaultProvider missing");
  return c;
}
