/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Only this Google account can open /admin */
  readonly VITE_ADMIN_EMAIL?: string;
}

/** SHA-256 of ADMIN_PASSCODE, injected by vite.config.ts at build time ("" when unset). */
declare const __ADMIN_HASH__: string;

/** imgbb API key, injected by vite.config.ts from IMB_API ("" when unset). Shipped in the bundle. */
declare const __IMGBB_KEY__: string;
