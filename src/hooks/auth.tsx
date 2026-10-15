import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";

interface AuthCtx {
  status: "loading" | "in" | "out";
  user: User | null;
  email: string | null;
  signIn(email: string, pw: string): Promise<void>;
  signUp(email: string, pw: string): Promise<void>;
  reset(email: string): Promise<void>;
  logout(): Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); }), []);

  const signIn = useCallback(async (e: string, p: string) => { await signInWithEmailAndPassword(auth, e, p); }, []);
  const signUp = useCallback(async (e: string, p: string) => { await createUserWithEmailAndPassword(auth, e, p); }, []);
  const reset = useCallback(async (e: string) => { await sendPasswordResetEmail(auth, e); }, []);
  const logout = useCallback(async () => { if (auth.currentUser) await signOut(auth); }, []);

  const value = useMemo<AuthCtx>(() => ({
    status: user ? "in" : ready ? "out" : "loading",
    user, email: user?.email ?? null, signIn, signUp, reset, logout,
  }), [user, ready, signIn, signUp, reset, logout]);

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
  "auth/operation-not-allowed": "Enable Email/Password sign-in in the Firebase console.",
};
export function authMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  return MESSAGES[code] ?? `Something went wrong (${code || (err as Error)?.message || "unknown"}).`;
}
