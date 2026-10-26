import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  collection, deleteDoc, deleteField, doc, getDocs, limit, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { DEMO, useAuth } from "./auth";
import { useOnline, useToast } from "./ui";
import type { GroupMeta, Snippet, SyncState, Version } from "../lib/types";
import { newId, seedSnippets } from "../lib/utils";
import { revokeShare } from "../lib/share";
import { isExpired } from "../lib/trash";

interface SnippetsCtx {
  /** Snippets that are not in the Trash. */
  snippets: Snippet[];
  /** Snippets in the Trash, most recently deleted first. */
  trashed: Snippet[];
  loaded: boolean;
  sync: SyncState;
  get(id: string): Snippet | undefined;
  save(s: Snippet): void;
  /** Moves a snippet to the Trash (it can be restored for 30 days). */
  remove(id: string): void;
  /** Takes snippets out of the Trash. */
  restore(ids: string | string[]): void;
  /** Deletes snippets permanently, along with their images, history and share link. */
  purge(ids: string | string[]): void;
  emptyTrash(): void;
  saveMany(list: Snippet[]): Promise<void>;
  groups: string[];
  groupMeta: Record<string, GroupMeta>;
  addGroup(name: string): void;
  renameGroup(from: string, to: string): void;
  deleteGroup(name: string): void;
  deleteGroups(names: string[], withSnippets: boolean): void;
  updateGroup(name: string, patch: GroupMeta): void;
  saveVersion(prev: Snippet): void;
  listVersions(id: string): Promise<Version[]>;
}
const Ctx = createContext<SnippetsCtx | null>(null);

const MAX_VERSIONS = 30;
const gid = (name: string) => "g_" + encodeURIComponent(name).replace(/\./g, "%2E");

/**
 * Delete a snippet's sub-collections (its images and its version history). Firestore never
 * cascades a document's sub-collections, so deleting the snippet document alone would leave
 * both behind — the images as orphans and, worse, the version history as readable copies of
 * code the user believes is gone.
 */
async function deleteSubcollections(uid: string, id: string): Promise<void> {
  for (const name of ["images", "versions"] as const) {
    const snap = await getDocs(collection(db, "users", uid, "snippets", id, name));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
}


export function SnippetsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const online = useOnline();
  const toast = useToast();
  const [all, setAll] = useState<Snippet[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [meta, setMeta] = useState<Record<string, GroupMeta>>({});
  const [explicit, setExplicit] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [fromCache, setFromCache] = useState(true);
  const uid = user?.uid ?? null;
  const snippets = useMemo(() => all.filter((s) => !s.deleted_at), [all]);
  const trashed = useMemo(
    () => all.filter((s) => s.deleted_at).sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? "")),
    [all],
  );
  const snapshots = useRef(snippets);
  snapshots.current = snippets;
  const allRef = useRef(all);
  allRef.current = all;
  const purging = useRef(new Set<string>());

  /* cloud: realtime snippets */
  useEffect(() => {
    if (DEMO) { setAll(seedSnippets()); setLoaded(true); return; }
    if (!uid) { setAll([]); setLoaded(false); return; }
    setLoaded(false);
    return onSnapshot(
      collection(db, "users", uid, "snippets"),
      { includeMetadataChanges: true },
      (snap) => {
        setAll(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Snippet, "id">) })));
        setPending(snap.metadata.hasPendingWrites);
        setFromCache(snap.metadata.fromCache);
        setLoaded(true);
      },
      (err) => {
        console.error(err);
        setLoaded(true);
        toast(err.code === "permission-denied" ? "Firestore rules blocked this request." : "Could not load snippets.", { kind: "err" });
      },
    );
  }, [uid, toast]);

  /* cloud: explicit (possibly empty) groups + colour/emoji */
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(collection(db, "users", uid, "groups"), (snap) => {
      const m: Record<string, GroupMeta> = {};
      const names: string[] = [];
      snap.docs.forEach((d) => {
        const v = d.data() as { name?: string } & GroupMeta;
        if (!v.name) return;
        names.push(v.name);
        m[v.name] = { color: v.color, emoji: v.emoji, share_token: v.share_token };
      });
      setExplicit(names);
      setMeta(m);
    }, () => { /* rules not deployed yet: groups still derive from snippets */ });
  }, [uid]);

  const fail = useCallback((e: unknown) => {
    toast("Could not sync: " + ((e as { code?: string }).code ?? (e as Error).message), { kind: "err" });
  }, [toast]);

  /* ---- snippets ---- */
  const save = useCallback((s: Snippet) => {
    setAll((l) => {
      const i = l.findIndex((x) => x.id === s.id);
      if (i === -1) return [...l, s];
      const next = l.slice();
      next[i] = s;
      return next;
    });
    if (!uid) return;
    const { id, ...data } = s;
    // don't await: with offline persistence the promise settles only after the server acks
    setDoc(doc(db, "users", uid, "snippets", id), data).catch(fail);
  }, [uid, fail]);

  const remove = useCallback((id: string) => {
    const now = new Date().toISOString();
    const token = allRef.current.find((x) => x.id === id)?.share_token;
    setAll((l) => l.map((x) => {
      if (x.id !== id) return x;
      const { share_token: _shared, ...rest } = x;
      return { ...rest, deleted_at: now };
    }));
    if (!uid) return;
    // Soft delete: the document, its images and its history stay, so Restore brings back everything.
    // A deleted snippet is no longer shared, so the public link goes down right away.
    updateDoc(doc(db, "users", uid, "snippets", id), { deleted_at: now, ...(token ? { share_token: deleteField() } : {}) }).catch(fail);
    if (token) revokeShare(token).catch(() => undefined);
  }, [uid, fail]);

  const restore = useCallback((input: string | string[]) => {
    const ids = new Set(Array.isArray(input) ? input : [input]);
    setAll((l) => l.map((x) => {
      if (!ids.has(x.id)) return x;
      const { deleted_at: _gone, ...rest } = x;
      return rest;
    }));
    if (!uid) return;
    const list = [...ids];
    for (let i = 0; i < list.length; i += 400) {
      const batch = writeBatch(db);
      list.slice(i, i + 400).forEach((id) => batch.update(doc(db, "users", uid, "snippets", id), { deleted_at: deleteField() }));
      batch.commit().catch(fail);
    }
  }, [uid, fail]);

  const purge = useCallback((input: string | string[]) => {
    const ids = new Set(Array.isArray(input) ? input : [input]);
    const doomed = allRef.current.filter((x) => ids.has(x.id));
    setAll((l) => l.filter((x) => !ids.has(x.id)));
    if (!uid) return;
    doomed.forEach((s) => {
      deleteDoc(doc(db, "users", uid, "snippets", s.id)).catch(fail);
      // Firestore never cascades: remove the images and version history explicitly, and take the
      // public share link down too, so no copy of the code outlives the snippet.
      deleteSubcollections(uid, s.id).catch(fail);
      if (s.share_token) revokeShare(s.share_token).catch(() => undefined);
    });
  }, [uid, fail]);

  const emptyTrash = useCallback(() => {
    purge(allRef.current.filter((x) => x.deleted_at).map((x) => x.id));
  }, [purge]);

  /* Anything that has sat in the Trash for the full retention period is deleted for good. This runs
     whenever the data loads or changes, so it needs no server job: it happens the next time the app
     is opened after the deadline. */
  const [hour, setHour] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setHour((h) => h + 1), 3_600_000); // re-check in a tab left open
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const now = Date.now();
    const expired = trashed.filter((s) => s.deleted_at && isExpired(s.deleted_at, now) && !purging.current.has(s.id));
    if (!expired.length) return;
    expired.forEach((s) => purging.current.add(s.id));
    purge(expired.map((s) => s.id));
  }, [loaded, trashed, purge, hour]);

  const saveMany = useCallback(async (list: Snippet[]) => {
    setAll((l) => {
      const m = new Map(l.map((x) => [x.id, x]));
      list.forEach((s) => m.set(s.id, s));
      return [...m.values()];
    });
    if (!uid) return;
    for (let i = 0; i < list.length; i += 400) {
      const batch = writeBatch(db);
      list.slice(i, i + 400).forEach(({ id, ...data }) => batch.set(doc(db, "users", uid, "snippets", id), data));
      batch.commit().catch(fail);
    }
  }, [uid, fail]);

  /* ---- groups ---- */
  const groups = useMemo(
    () => [...new Set([...explicit, ...snippets.map((x) => x.group).filter((g): g is string => !!g)])].sort((a, b) => a.localeCompare(b)),
    [explicit, snippets],
  );

  const writeGroupDoc = useCallback((name: string, patch: GroupMeta) => {
    if (!uid) return;
    setDoc(doc(db, "users", uid, "groups", gid(name)), { name, ...clean(patch) }, { merge: true }).catch(fail);
  }, [uid, fail]);

  const addGroup = useCallback((name: string) => {
    const n = name.trim().slice(0, 60);
    if (!n) return;
    setExplicit((l) => (l.includes(n) ? l : [...l, n]));
    writeGroupDoc(n, { created_at: new Date().toISOString() } as GroupMeta);
  }, [writeGroupDoc]);

  const updateGroup = useCallback((name: string, patch: GroupMeta) => {
    setExplicit((l) => (l.includes(name) ? l : [...l, name]));
    setMeta((m) => ({ ...m, [name]: { ...m[name], ...patch } }));
    writeGroupDoc(name, patch);
  }, [writeGroupDoc]);

  const deleteGroup = useCallback((name: string) => {
    setExplicit((l) => l.filter((g) => g !== name));
    setMeta((m) => { const { [name]: _drop, ...rest } = m; return rest; });
    const now = new Date().toISOString();
    const moved = snapshots.current.filter((x) => x.group === name).map((x) => ({ ...x, group: "", updated_at: now }));
    setAll((l) => l.map((x) => (x.group === name && !x.deleted_at ? { ...x, group: "", updated_at: now } : x)));
    if (!uid) return;
    deleteDoc(doc(db, "users", uid, "groups", gid(name))).catch(fail);
    moved.forEach(({ id, ...data }) => setDoc(doc(db, "users", uid, "snippets", id), data).catch(fail));
  }, [uid, fail]);

  const deleteGroups = useCallback((names: string[], withSnippets: boolean) => {
    if (!names.length) return;
    const set = new Set(names);
    const now = new Date().toISOString();
    const affected = snapshots.current.filter((x) => x.group && set.has(x.group));
    setExplicit((l) => l.filter((g) => !set.has(g)));
    setMeta((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !set.has(k))));
    const inGroups = (x: Snippet) => !x.deleted_at && !!x.group && set.has(x.group);
    // "Also delete the snippets" moves them to the Trash (keeping their group, so Restore puts them
    // back where they were); otherwise they just lose the group.
    setAll((l) => l.map((x) => {
      if (!inGroups(x)) return x;
      if (!withSnippets) return { ...x, group: "", updated_at: now };
      const { share_token: _shared, ...rest } = x;
      return { ...rest, deleted_at: now, updated_at: now };
    }));
    if (!uid) return;
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    names.forEach((n) => ops.push((b) => b.delete(doc(db, "users", uid, "groups", gid(n)))));
    affected.forEach(({ id, ...data }) => ops.push((b) => withSnippets
      ? b.update(doc(db, "users", uid, "snippets", id), { deleted_at: now, updated_at: now, ...(data.share_token ? { share_token: deleteField() } : {}) })
      : b.set(doc(db, "users", uid, "snippets", id), { ...data, group: "", updated_at: now })));
    if (withSnippets) affected.forEach((x) => { if (x.share_token) revokeShare(x.share_token).catch(() => undefined); });
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(db);
      ops.slice(i, i + 400).forEach((op) => op(batch));
      batch.commit().catch(fail);
    }
  }, [uid, fail]);

  const renameGroup = useCallback((from: string, to: string) => {
    const n = to.trim().slice(0, 60);
    if (!n || n === from) return;
    const carried = meta[from] ?? {};
    setExplicit((l) => [...l.filter((g) => g !== from && g !== n), n]);
    setMeta((m) => { const { [from]: _drop, ...rest } = m; return { ...rest, [n]: carried }; });
    const now = new Date().toISOString();
    const moved = snapshots.current.filter((x) => x.group === from).map((x) => ({ ...x, group: n, updated_at: now }));
    setAll((l) => l.map((x) => (x.group === from && !x.deleted_at ? { ...x, group: n, updated_at: now } : x)));
    if (!uid) return;
    deleteDoc(doc(db, "users", uid, "groups", gid(from))).catch(fail);
    writeGroupDoc(n, carried);
    moved.forEach(({ id, ...data }) => setDoc(doc(db, "users", uid, "snippets", id), data).catch(fail));
  }, [uid, fail, meta, writeGroupDoc]);

  /* ---- version history ---- */
  const saveVersion = useCallback((prev: Snippet) => {
    const v: Version = {
      vid: newId(), title: prev.title, language: prev.language, description: prev.description,
      tags: prev.tags, code: prev.code, notes: prev.notes ?? "", saved_at: new Date().toISOString(),
    };
    if (!uid) return;
    const { vid, ...data } = v;
    setDoc(doc(db, "users", uid, "snippets", prev.id, "versions", vid), data).catch(fail);
  }, [uid, fail]);

  const listVersions = useCallback(async (id: string): Promise<Version[]> => {
    if (!uid) return [];
    const snap = await getDocs(query(collection(db, "users", uid, "snippets", id, "versions"), orderBy("saved_at", "desc"), limit(MAX_VERSIONS)));
    return snap.docs.map((d) => ({ vid: d.id, ...(d.data() as Omit<Version, "vid">) }));
  }, [uid]);

  const sync: SyncState = !online ? "offline" : DEMO || (!pending && !fromCache) ? "synced" : "syncing";

  // Index once per change, so `get(id)` is a lookup rather than a scan of the whole vault.
  const byId = useMemo(() => new Map(snippets.map((s) => [s.id, s])), [snippets]);

  const value = useMemo<SnippetsCtx>(() => ({
    snippets, trashed, loaded, sync, save, remove, restore, purge, emptyTrash, saveMany,
    groups, groupMeta: meta, addGroup, renameGroup, deleteGroup, deleteGroups, updateGroup,
    saveVersion, listVersions,
    get: (id) => byId.get(id),
  }), [snippets, trashed, byId, loaded, sync, save, remove, restore, purge, emptyTrash, saveMany, groups, meta, addGroup, renameGroup, deleteGroup, deleteGroups, updateGroup, saveVersion, listVersions]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Firestore rejects `undefined` values. */
function clean<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function useSnippets() {
  const c = useContext(Ctx);
  if (!c) throw new Error("SnippetsProvider missing");
  return c;
}
