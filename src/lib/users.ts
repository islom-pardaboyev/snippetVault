import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: string | null;
  lastSeen: string | null;
}

/**
 * Writes (or refreshes) this account's row in the shared `users` directory so the admin can
 * list accounts. Best-effort: it must never block sign-in, so callers swallow failures.
 */
export async function touchUserProfile(user: User) {
  await setDoc(doc(db, "users", user.uid), {
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    provider: user.providerData[0]?.providerId ?? null,
    lastSeen: new Date().toISOString(),
  }, { merge: true });
}

/** Admin only: every account that has opened the app, most recent first. */
export async function listUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs
    .map((d) => ({ uid: d.id, ...(d.data() as Omit<UserProfile, "uid">) }))
    .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
}
