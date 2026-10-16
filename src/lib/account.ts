import { collection, getDocs, writeBatch, type DocumentReference } from "firebase/firestore";
import { db } from "./firebase";
import { deleteHostedImage } from "./imgbb";

const BATCH = 400; // Firestore batch limit is 500 writes

/** Shape of the one field we care about when reading image records during a wipe. */
type MaybeHosted = { remote?: { delete_url?: string | null } };

/**
 * Deletes every document the user owns: snippets (+ their images and versions), groups, and
 * the whole vault (items, sealed images, KDF meta). The Auth account is handled separately.
 *
 * Deleting the Firestore pointer of a *hosted* vault image is not enough: the ciphertext at
 * imgbb would outlive the account. So the `delete_url`s are collected while the records are
 * still readable, the documents are batch-deleted, and only then is the host asked to drop
 * the blobs — best effort, since an imgbb hiccup must not abort an account deletion (see
 * `deleteHostedImage`: what would leak is opaque ciphertext, never readable content).
 */
export async function wipeUserData(uid: string) {
  const refs: DocumentReference[] = [];
  const hosted: string[] = [];
  const collectHosted = (data: unknown) => {
    const url = (data as MaybeHosted).remote?.delete_url;
    if (url) hosted.push(url);
  };

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

  const vault = await getDocs(collection(db, "users", uid, "vault"));
  for (const v of vault.docs) {
    const images = await getDocs(collection(db, "users", uid, "vault", v.id, "images"));
    images.docs.forEach((d) => {
      collectHosted(d.data());
      refs.push(d.ref);
    });
    refs.push(v.ref);
  }
  const meta = await getDocs(collection(db, "users", uid, "meta"));
  meta.docs.forEach((d) => refs.push(d.ref));

  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = writeBatch(db);
    refs.slice(i, i + BATCH).forEach((r) => batch.delete(r));
    await batch.commit();
  }

  await Promise.allSettled(hosted.map((u) => deleteHostedImage(u)));
}
