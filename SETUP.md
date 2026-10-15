# SnippetVault v2 — React + TypeScript + Tailwind + Firebase

Realtime, offline-first, installable (PWA) snippet vault.

## Run

```
npm install
npm run dev        # http://localhost:5173
```

## Firebase (one-time)

1. Console → **Build → Authentication → Sign-in method** → enable **Email/Password** and **Google** (pick a support email)
   - Under **Settings → Authorized domains** add your deployed domain (localhost is allowed by default)
2. Console → **Build → Firestore Database → Create** (production mode)
3. Config already lives in `src/lib/firebase.ts`.

## Admin page (optional)

Copy `.env.example` to `.env.local` and set `VITE_ADMIN_EMAIL` and `ADMIN_PASSCODE`. Restart `npm run dev` after changing them.

## Deploy

```
npm i -g firebase-tools && firebase login && firebase use --add
npm run deploy     # builds, then deploys hosting + firestore rules
```

## What's inside

| Path | Purpose |
| --- | --- |
| `src/hooks/` | auth, realtime snippets (Firestore + demo mode), theme, toasts, install |
| `src/pages/` | Login, Library, Detail, Editor, Insights, NotFound (404), Offline |
| `src/components/` | Shell, CommandPalette, SettingsDialog, CodeBlock, SnippetCard |
| `src/lib/highlight.ts` | dependency-free syntax highlighter (15 languages) |
| `legacy/` | the previous single-file version |

Shortcuts: `⌘K` palette · `/` search · `N` new · `C` copy · `E` edit · `F` favourite · `⌘↵` save.
