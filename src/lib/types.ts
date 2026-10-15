export interface Snippet {
  id: string;
  title: string;
  language: string;
  favorite: boolean;
  group?: string;
  tags: string[];
  description: string;
  code: string;
  created_at: string;
  updated_at: string;
}

export type SyncState = "synced" | "syncing" | "offline";
export type ThemeMode = "system" | "dark" | "light";
export type Accent = "lime" | "sky" | "blue" | "violet" | "pink" | "coral" | "red" | "amber" | "green" | "cyan" | "custom";

export interface GroupMeta { color?: string; emoji?: string; }

export interface Version {
  vid: string;
  title: string;
  language: string;
  description: string;
  tags: string[];
  code: string;
  saved_at: string;
}
