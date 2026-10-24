import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, sendEmailVerification, updatePassword,
  reauthenticateWithCredential, reauthenticateWithPopup, deleteUser,
  EmailAuthProvider, GoogleAuthProvider, signInWithPopup, signInWithCredential, type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { isNativeApp } from "../lib/native";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { wipeUserData } from "../lib/account";
import { touchUserProfile } from "../lib/users";
import { isAdminEmail } from "../lib/admin";

// The admin email lives in `lib/admin.ts` (single source of truth, kept in step with
// `firestore.rules` by a test). Re-exported here so existing importers keep working.
export { isAdminEmail };

/** Dev-only demo: `npm run dev` + `?demo` opens the app with seeded data and no Firebase account. Never in production builds. */
export const DEMO = import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");

interface AuthCtx {
  status: "loading" | "in" | "out";
  user: User | null;
  email: string | null;
  signIn(email: string, pw: string): Promise<void>;
  signUp(email: string, pw: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  reset(email: string): Promise<void>;
  resendVerification(): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  /** true when the account signs in with email + password (so it has a password to change) */
  hasPassword: boolean;
  /** false for an email/password account that hasn't confirmed its address yet */
  verified: boolean;
  /** password accounts pass their password, Google accounts pass null and re-confirm in a popup */
  deleteAccount(password: string | null): Promise<void>;
  logout(): Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u); setReady(true);
    // Keep the admin's user directory fresh; a failed write must not break sign-in.
    if (u && !DEMO) touchUserProfile(u).catch(() => undefined);
  }), []);

  const signIn = useCallback(async (e: string, p: string) => { await signInWithEmailAndPassword(auth, e, p); }, []);
  const signUp = useCallback(async (e: string, p: string) => {
    const cred = await createUserWithEmailAndPassword(auth, e, p);
    // best effort — the account exists either way, the banner lets the user resend
    sendEmailVerification(cred.user).catch(() => undefined);
  }, []);
  const signInWithGoogle = useCallback(async () => {
    if (isNativeApp) {
      // The Android WebView cannot open the popup, so Google's native account picker returns an
      // ID token instead, which the Firebase JS SDK turns into the same signed-in user.
      const result = await FirebaseAuthentication.signInWithGoogle();
      const idToken = result.credential?.idToken;
      if (!idToken) throw new Error("No Google ID token returned");
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
      return;
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  }, []);
  const resendVerification = useCallback(async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  }, []);
  const changePassword = useCallback(async (current: string, next: string) => {
    const u = auth.currentUser;
    if (!u?.email) throw new Error("No password on this account");
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
    await updatePassword(u, next);
  }, []);
  const reset = useCallback(async (e: string) => { await sendPasswordResetEmail(auth, e); }, []);
  const deleteAccount = useCallback(async (password: string | null) => {
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    // re-authenticate first so a failed password never leaves the account half-wiped
    if (password !== null) await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email ?? "", password));
    else await reauthenticateWithPopup(u, new GoogleAuthProvider());
    await wipeUserData(u.uid);
    await deleteUser(u);
  }, []);
  const logout = useCallback(async () => { if (auth.currentUser) await signOut(auth); }, []);

  const value = useMemo<AuthCtx>(() => ({
    status: DEMO || user ? "in" : ready ? "out" : "loading",
    user, email: DEMO ? "demo@snippetvault.dev" : user?.email ?? null,
    signIn, signUp, signInWithGoogle, reset, resendVerification, changePassword, deleteAccount,
    hasPassword: DEMO || !!user?.providerData.some((p) => p.providerId === "password"),
    verified: DEMO || !user || user.emailVerified || !user.providerData.some((p) => p.providerId === "password"),
    logout,
  }), [user, ready, signIn, signUp, signInWithGoogle, reset, resendVerification, changePassword, deleteAccount, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}

const MESSAGES: Record<string, string> = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/missing-password": "Enter your password.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/email-already-in-use": "That email already has an account — switch to Sign in.",
  "auth/invalid-credential": "Wrong email or password.",
  "auth/user-not-found": "No account with that email — create one first.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/network-request-failed": "No connection. Check your internet and try again.",
  "auth/operation-not-allowed": "This sign-in method isn't enabled in the Firebase console yet.",
  "auth/popup-closed-by-user": "Sign-in window was closed before finishing.",
  "auth/cancelled-popup-request": "Sign-in window was closed before finishing.",
  "auth/popup-blocked": "Your browser blocked the Google sign-in window — allow popups and try again.",
  "auth/account-exists-with-different-credential": "That email already has an account with a different sign-in method.",
  "auth/unauthorized-domain": "This domain isn't authorised for sign-in — add it in Firebase → Authentication → Settings.",
  "auth/requires-recent-login": "Please sign out and back in, then try again.",
  "auth/user-mismatch": "That's not the account you're signed in with.",
};
export function authMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  return MESSAGES[code] ?? `Something went wrong (${code || (err as Error)?.message || "unknown"}).`;
}
