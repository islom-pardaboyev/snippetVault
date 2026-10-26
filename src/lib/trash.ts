/** How long a deleted snippet stays in the Trash before it is removed for good. */
export const TRASH_DAYS = 30;

const DAY_MS = 86_400_000;

/** When a trashed snippet is permanently deleted. An unreadable date counts as "just deleted". */
function purgeAt(deletedAt: string, fallbackNow: number): number {
  const t = Date.parse(deletedAt);
  return (Number.isNaN(t) ? fallbackNow : t) + TRASH_DAYS * DAY_MS;
}

/** True once a snippet has been in the Trash for the full retention period. */
export function isExpired(deletedAt: string, now = Date.now()): boolean {
  return purgeAt(deletedAt, now) <= now;
}

/** Whole days left before the snippet is deleted for good (a partial day counts as a day). */
export function daysLeft(deletedAt: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((purgeAt(deletedAt, now) - now) / DAY_MS));
}
