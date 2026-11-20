import { collection, doc, getDocs, writeBatch, type DocumentReference } from "firebase/firestore";
import { db } from "./firebase";
import { deleteHostedImage } from "./imgbb";

const BATCH = 400; // Firestore batch limit is 500 writes

/** Shape of the one field we care about when reading image records during a wipe. */
type MaybeHosted = { remote?: { delete_url?: string | null } };

/**
 * Collects every document of the user's vault into `refs`: the items with their sealed images,
 * and the standalone gallery. The `delete_url` of every *hosted* image is collected into `hosted`
 * while the records are still readable.
 *
 * Deleting the Firestore pointer of a hosted vault image is not enough: the ciphertext at imgbb
 * would outlive it. So the host is asked to drop the blobs only after the documents are gone, and
 * best effort, since an imgbb hiccup must not abort a wipe (see `deleteHostedImage`: what would
 * leak is opaque ciphertext, never readable content).
 */
async function collectVault(uid: string, refs: DocumentReference[], hosted: string[]) {
  const collectHosted = (data: unknown) => {
    const url = (data as MaybeHosted).remote?.delete_url;
    if (url) hosted.push(url);
  };
  const vault = await getDocs(collection(db, "users", uid, "vault"));
  for (const v of vault.docs) {
    const images = await getDocs(collection(db, "users", uid, "vault", v.id, "images"));
    images.docs.forEach((d) => {
      collectHosted(d.data());
      refs.push(d.ref);
    });
    const audio = await getDocs(collection(db, "users", uid, "vault", v.id, "audio"));
    audio.docs.forEach((d) => {
      collectHosted(d.data());
      refs.push(d.ref);
    });
    refs.push(v.ref);
  }
  // The standalone vault gallery: encrypted images attached to no snippet. Same contract.
  const gallery = await getDocs(collection(db, "users", uid, "vaultImages"));
  gallery.docs.forEach((d) => {
    collectHosted(d.data());
    refs.push(d.ref);
  });
  // The standalone audio gallery: same contract.
  const galleryAudio = await getDocs(collection(db, "users", uid, "vaultAudio"));
  galleryAudio.docs.forEach((d) => {
    collectHosted(d.data());
    refs.push(d.ref);
  });
}

async function commitDeletes(refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = writeBatch(db);
    refs.slice(i, i + BATCH).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

/**
 * Permanently deletes the whole vault (items, sealed images, the gallery and the key material)
 * and nothing else, so a user who lost both the passphrase and the recovery key can start over.
 * Normal snippets, groups and the account are untouched.
 */
export async function wipeVault(uid: string) {
  const refs: DocumentReference[] = [];
  const hosted: string[] = [];
  await collectVault(uid, refs, hosted);
  refs.push(doc(db, "users", uid, "meta", "vault"));
  await commitDeletes(refs);
  await Promise.allSettled(hosted.map((u) => deleteHostedImage(u)));
}

/**
 * Deletes every document the user owns: snippets (+ their images and versions), groups, and the
 * whole vault (see `collectVault`) with its KDF meta. The Auth account is handled separately.
 */
export async function wipeUserData(uid: string) {
  const refs: DocumentReference[] = [];
  const hosted: string[] = [];

  const snippets = await getDocs(collection(db, "users", uid, "snippets"));
  for (const s of snippets.docs) {
    for (const sub of ["images", "versions"] as const) {
      const subs = await getDocs(collection(db, "users", uid, "snippets", s.id, sub));
      subs.docs.forEach((d) => refs.push(d.ref));
    }
    refs.push(s.ref);
  }
  const groups = await getDocs(collection(db, "users", uid, "groups"));
  groups.docs.forEach((d) => refs.push(d.ref));

  await collectVault(uid, refs, hosted);
  const meta = await getDocs(collection(db, "users", uid, "meta"));
  meta.docs.forEach((d) => refs.push(d.ref));

  await commitDeletes(refs);
  await Promise.allSettled(hosted.map((u) => deleteHostedImage(u)));
}
