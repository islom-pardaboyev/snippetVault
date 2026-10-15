/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Only this Google account can open /admin */
  readonly VITE_ADMIN_EMAIL?: string;
  /** SHA-256 (hex) of the admin passcode. Public in the bundle — keep the passcode long. */
  readonly VITE_ADMIN_PASSCODE_SHA256?: string;
}
