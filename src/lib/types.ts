export interface Snippet {
  id: string;
  title: string;
  language: string;
  favorite: boolean;
  group?: string;
  image_count?: number;
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

export interface SnippetImage {
  id: string;
  data: string;       // base64 data URL
  w: number;
  h: number;
  size: number;
  created_at: string;
}
