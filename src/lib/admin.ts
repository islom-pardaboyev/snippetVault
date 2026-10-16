/**
 * The admin address for /admin.
 *
 * This value exists in two places that MUST agree, because neither can read the other:
 *
 *   1. here — `VITE_ADMIN_EMAIL` at build time, falling back to the address below, and
 *   2. `firestore.rules` — a hard-coded literal (Security Rules cannot read env/build values).
 *
 * `src/lib/__tests__/admin.test.ts` reads the rules file and fails if the two ever drift, so
 * changing one without the other is caught in CI rather than silently locking you out.
 */
export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL ?? "ipardaboyev574@gmail.com").trim().toLowerCase();

/** True when `email` matches the configured admin address. */
export const isAdminEmail = (email?: string | null) => !!ADMIN_EMAIL && (email ?? "").toLowerCase() === ADMIN_EMAIL;
