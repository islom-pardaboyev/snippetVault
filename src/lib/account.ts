import { collection, getDocs, writeBatch, type DocumentReference } from "firebase/firestore";
import { db } from "./firebase";

const BATCH = 400; // Firestore batch limit is 500 writes

/** Deletes every document the user owns (snippets, their images and versions, groups). Auth account is handled separately. */
export async function wipeUserData(uid: string) {
  const refs: DocumentReference[] = [];
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

  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = writeBatch(db);
    refs.slice(i, i + BATCH).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}
