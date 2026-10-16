import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteVaultImage, deleteVaultItem } from "../vault";
import { wipeUserData } from "../account";

/**
 * The image-hosting lifecycle: whenever a vault image record leaves Firestore — single
 * image deleted, whole item deleted (which is also every "move out of the vault"), or the
 * account wiped — the ciphertext hosted on imgbb must be asked to go too. Firestore goes
 * first; the host is best-effort behind it.
 *
 * Firestore is a tiny in-memory stand-in (direct-children collections only, which is all
 * this code touches), so these tests are about *what gets deleted where*, never the network.
 */

const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(), // doc path -> data
}));

const host = vi.hoisted(() => ({
  deleted: [] as string[],
  fail: false,
}));

vi.mock("../firebase", () => ({ db: {} }));

vi.mock("../imgbb", () => ({
  hasImgbb: () => true,
  imgbbKey: () => "test-key",
  uploadPng: async () => { throw new Error("upload not used in this file"); },
  fetchBlob: async () => { throw new Error("download not used in this file"); },
  deleteHostedImage: async (url: string) => {
    if (host.fail) throw new Error("host-refused");
    host.deleted.push(url);
    return true;
  },
}));

vi.mock("firebase/firestore", () => {
  type Ref = { path: string; kind: "doc" | "col" };
  const mk = (kind: Ref["kind"], parts: unknown[]): Ref => ({ path: parts.join("/"), kind });
  /** The direct children of a collection — `users/u/vault` must not match `…/vault/i/images`. */
  const childId = (docPath: string, colPath: string): string | null => {
    if (!docPath.startsWith(`${colPath}/`)) return null;
    const rest = docPath.slice(colPath.length + 1);
    return rest.includes("/") ? null : rest;
  };
  return {
    doc: (_db: unknown, ...parts: string[]) => mk("doc", parts),
    collection: (_db: unknown, ...parts: string[]) => mk("col", parts),
    query: (r: Ref) => r,
    orderBy: () => ({}),
    getDocs: async (r: Ref) => ({
      docs: [...store.docs.entries()]
        .map(([p, data]) => ({ id: childId(p, r.path), data, path: p }))
        .filter((d): d is { id: string; data: Record<string, unknown>; path: string } => d.id !== null)
        .map((d) => ({ id: d.id, data: () => d.data, ref: { path: d.path, kind: "doc" as const }, exists: () => true })),
    }),
    getDoc: async (r: Ref) => {
      const data = store.docs.get(r.path);
      return { exists: () => data !== undefined, data: () => data, ref: r };
    },
    deleteDoc: async (r: Ref) => { store.docs.delete(r.path); },
    setDoc: async (r: Ref, data: unknown) => { store.docs.set(r.path, data as Record<string, unknown>); },
    writeBatch: () => {
      const pending: string[] = [];
      return {
        delete: (r: Ref) => { pending.push(r.path); },
        commit: async () => { pending.forEach((p) => store.docs.delete(p)); },
      };
    },
    onSnapshot: () => () => {},
  };
});

const UID = "user-1";
const ITEM = "snip-1";
const HOSTED = "https://ibb.co/2ndCYJK/670a7e48ddcb85ac340c717a41047e5c";

/** One vault item with two images: one hosted on imgbb, one sealed inline (nothing to purge). */
function seedVault() {
  store.docs.set(`users/${UID}/vault/${ITEM}`, { enc: { iv: "a", ct: "b" }, image_count: 2, created_at: "t", updated_at: "t" });
  store.docs.set(`users/${UID}/vault/${ITEM}/images/img-1`, {
    fmt: 2, remote: { url: "https://i.ibb.co/x/1.png", iv: "a", sha: "s", bytes: 10, delete_url: HOSTED },
  });
  store.docs.set(`users/${UID}/vault/${ITEM}/images/img-2`, { fmt: 2, enc: { iv: "c", ct: "d" } });
}

beforeEach(() => {
  store.docs.clear();
  host.deleted = [];
  host.fail = false;
});

describe("vault image cleanup", () => {
  it("deleting an item drops its records and the hosted ciphertext behind them", async () => {
    seedVault();
    await deleteVaultItem(UID, ITEM);

    expect([...store.docs.keys()]).toEqual([]);
    expect(host.deleted).toEqual([HOSTED]);
  });

  it("deleting one image purges its blob and leaves the rest of the item alone", async () => {
    seedVault();

    await deleteVaultImage(UID, ITEM, "img-1");
    expect(store.docs.has(`users/${UID}/vault/${ITEM}/images/img-1`)).toBe(false);
    expect(host.deleted).toEqual([HOSTED]);

    await deleteVaultImage(UID, ITEM, "img-2"); // inline image: nothing hosted to purge
    expect(host.deleted).toHaveLength(1);
    expect(store.docs.has(`users/${UID}/vault/${ITEM}`)).toBe(true);
    expect(store.docs.has(`users/${UID}/vault/${ITEM}/images/img-2`)).toBe(false);
  });

  it("keeps going when the host refuses to delete", async () => {
    seedVault();
    host.fail = true;

    await expect(deleteVaultItem(UID, ITEM)).resolves.toBeUndefined();
    expect([...store.docs.keys()]).toEqual([]); // Firestore is cleared regardless
  });
});

describe("wipeUserData", () => {
  it("wipes snippets, groups, the vault and its meta — and purges hosted blobs", async () => {
    store.docs.set(`users/${UID}/snippets/s1`, { title: "a" });
    store.docs.set(`users/${UID}/snippets/s1/images/i1`, { data: "data:image/png;base64,x" });
    store.docs.set(`users/${UID}/snippets/s1/versions/v1`, { code: "x" });
    store.docs.set(`users/${UID}/groups/g1`, { name: "g" });
    store.docs.set(`users/${UID}/meta/vault`, { wrapped_dek: "w", kdf: {} });
    seedVault();

    await wipeUserData(UID);

    expect([...store.docs.keys()]).toEqual([]);
    expect(host.deleted).toEqual([HOSTED]);
  });
});
