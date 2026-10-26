export interface Snippet {
  id: string;
  title: string;
  language: string;
  favorite: boolean;
  group?: string;
  image_count?: number;
  tags: string[];
  description: string;
  /** Optional private note: an explanation of the snippet, just for the owner. */
  notes?: string;
  code: string;
  created_at: string;
  updated_at: string;
  /** Token of a read-only share link for this snippet, if one was created. */
  share_token?: string;
  /** Set when the snippet is in the Trash (ISO time of deletion). Absent for a normal snippet. */
  deleted_at?: string;
}

export type SyncState = "synced" | "syncing" | "offline";
export type ThemeMode = "system" | "dark" | "light";

export interface GroupMeta { color?: string; emoji?: string; share_token?: string; }

export interface Version {
  vid: string;
  title: string;
  language: string;
  description: string;
  tags: string[];
  code: string;
  /** A page keeps its content in `notes`; stored here too so page edits can be restored. */
  notes?: string;
  saved_at: string;
}

export interface SnippetImage {
  id: string;
  data: string;       // base64 data URL
  w: number;
  h: number;
  size: number;
  created_at: string;
}
