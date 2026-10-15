import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, setDoc, writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { DEMO, useAuth } from "./auth";
import { useOnline, useToast } from "./ui";
import type { GroupMeta, Snippet, SyncState, Version } from "../lib/types";
import { newId, seedSnippets } from "../lib/utils";

interface SnippetsCtx {
  snippets: Snippet[];
  loaded: boolean;
  sync: SyncState;
  get(id: string): Snippet | undefined;
  save(s: Snippet): void;
  remove(id: string): void;
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


export function SnippetsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const online = useOnline();
  const toast = useToast();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [meta, setMeta] = useState<Record<string, GroupMeta>>({});
  const [explicit, setExplicit] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [fromCache, setFromCache] = useState(true);
  const uid = user?.uid ?? null;
  const imgDelete = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const snapshots = useRef(snippets);
  snapshots.current = snippets;

  /* cloud: realtime snippets */
  useEffect(() => {
    if (DEMO) { setSnippets(seedSnippets()); setLoaded(true); return; }
    if (!uid) { setSnippets([]); setLoaded(false); return; }
    setLoaded(false);
    return onSnapshot(
      collection(db, "users", uid, "snippets"),
      { includeMetadataChanges: true },
      (snap) => {
        setSnippets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Snippet, "id">) })));
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
        m[v.name] = { color: v.color, emoji: v.emoji };
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
    const t = imgDelete.current.get(s.id);
    if (t) { clearTimeout(t); imgDelete.current.delete(s.id); } // snippet restored (Undo)
    setSnippets((l) => (l.some((x) => x.id === s.id) ? l.map((x) => (x.id === s.id ? s : x)) : [...l, s]));
    if (!uid) return;
    const { id, ...data } = s;
    // don't await: with offline persistence the promise settles only after the server acks
    setDoc(doc(db, "users", uid, "snippets", id), data).catch(fail);
  }, [uid, fail]);

  const remove = useCallback((id: string) => {
    const hadImages = (snapshots.current.find((x) => x.id === id)?.image_count ?? 0) > 0;
    setSnippets((l) => l.filter((x) => x.id !== id));
    if (!uid) return;
    deleteDoc(doc(db, "users", uid, "snippets", id)).catch(fail);
    if (hadImages) {
      // wait out the Undo window, then remove the orphaned images
      imgDelete.current.set(id, setTimeout(() => {
        imgDelete.current.delete(id);
        getDocs(collection(db, "users", uid, "snippets", id, "images")).then((snap) => {
          const b = writeBatch(db);
          snap.docs.forEach((d) => b.delete(d.ref));
          return b.commit();
        }).catch(fail);
      }, 8000));
    }
  }, [uid, fail]);

  const saveMany = useCallback(async (list: Snippet[]) => {
    setSnippets((l) => {
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
    setSnippets((l) => l.map((x) => (x.group === name ? { ...x, group: "", updated_at: now } : x)));
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
    setSnippets((l) => withSnippets
      ? l.filter((x) => !(x.group && set.has(x.group)))
      : l.map((x) => (x.group && set.has(x.group) ? { ...x, group: "", updated_at: now } : x)));
    if (!uid) return;
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    names.forEach((n) => ops.push((b) => b.delete(doc(db, "users", uid, "groups", gid(n)))));
    affected.forEach(({ id, ...data }) => ops.push((b) => withSnippets
      ? b.delete(doc(db, "users", uid, "snippets", id))
      : b.set(doc(db, "users", uid, "snippets", id), { ...data, group: "", updated_at: now })));
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
    setSnippets((l) => l.map((x) => (x.group === from ? { ...x, group: n, updated_at: now } : x)));
    if (!uid) return;
    deleteDoc(doc(db, "users", uid, "groups", gid(from))).catch(fail);
    writeGroupDoc(n, carried);
    moved.forEach(({ id, ...data }) => setDoc(doc(db, "users", uid, "snippets", id), data).catch(fail));
  }, [uid, fail, meta, writeGroupDoc]);

  /* ---- version history ---- */
  const saveVersion = useCallback((prev: Snippet) => {
    const v: Version = {
      vid: newId(), title: prev.title, language: prev.language, description: prev.description,
      tags: prev.tags, code: prev.code, saved_at: new Date().toISOString(),
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

  const value = useMemo<SnippetsCtx>(() => ({
    snippets, loaded, sync, save, remove, saveMany,
    groups, groupMeta: meta, addGroup, renameGroup, deleteGroup, deleteGroups, updateGroup,
    saveVersion, listVersions,
    get: (id) => snippets.find((s) => s.id === id),
  }), [snippets, loaded, sync, save, remove, saveMany, groups, meta, addGroup, renameGroup, deleteGroup, deleteGroups, updateGroup, saveVersion, listVersions]);

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
