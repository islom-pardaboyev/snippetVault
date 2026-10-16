# Android app (TWA) — packaging guide

SnippetVault can ship to Google Play as a real Android app **without rewriting anything**: a
Trusted Web Activity (TWA) wraps the live site in a Chrome shell. Users get a launcher icon,
splash screen and full-screen window; you keep every property of the web deploy:

- **Instant updates** — the app *is* the website; a Vercel deploy reaches installed copies
  immediately (same service-worker auto-update as the browser PWA). No APK re-release per fix.
- **Same security posture** — traffic still hits Vercel, so the CSP + security headers apply
  unchanged; the vault stays client-side AES-256-GCM with WebCrypto (identical in Chrome).
- **Google sign-in works untouched** — a TWA runs in real Chrome, so `signInWithPopup` is fine.

The packaged `.apk` is only for sideload testing; Play accepts the `.aab`.

**Phones browsing the website get a landing page** inviting them to install the app — SnippetVault
is a large-screen workspace (see `SETUP.md` → *Small screens*). That gate is skipped inside the
installed app, which reports `display-mode: standalone`, so the TWA always opens the real app.

## Prerequisites

- The site deployed on **HTTPS** (packaging fetches `https://<your-domain>/manifest.webmanifest`).
- Node 18+, **Java 17**, and the **Android SDK** (Bubblewrap checks with `bubblewrap doctor`).
- A **Google Play developer account** ($25 one-time) — only needed for publishing.

## 1. Install the CLI

```bash
npm i -g @bubblewrap/cli
bubblewrap doctor     # verifies Java + Android SDK
```

## 2. Init the project

**Generate the project in its own folder** — it produces a full Gradle project *and* your signing
keystore, neither of which belongs in the web source. In this repo the Android project lives in
`android/`:

```bash
mkdir -p android && cd android
bubblewrap init --manifest=https://<your-domain>/manifest.webmanifest
# or anywhere else: bubblewrap init --manifest=... --directory=~/Desktop/snippetvault-android
```

The keystore is kept **outside** the project, at the repo root (`android.keystore`) — ignored by the
`*.keystore` rule in `.gitignore`. All build commands below run from `android/`.

Recommended answers:

| Prompt | Answer |
| --- | --- |
| Application ID | `com.snippetvault.app` — **never change this after publishing** |
| Host | `<your-domain>` |
| Name / launcher name | `SnippetVault` |
| Display mode | `standalone` (default) |
| Theme color | `#0a0b0d` |
| Background color | `#0b0c0e` |
| Start URL | `/` |
| Sign key | let it generate `android.keystore`, set strong passwords |

**Back up `android.keystore` + its passwords** (password manager, offline copy) exactly like the
vault recovery key: **whoever holds the keystore holds the app's identity.** If it is lost, you
can never update the published app again — you'd have to publish a brand-new listing.

## 3. Build

```bash
cd android
bubblewrap build
```

Outputs:

- `app-release-signed.apk` — sideload test build
- `app-release-bundle.aab` — what Play accepts

Test on a device/emulator (`adb` running):

```bash
bubblewrap install
```

Verify before publishing: full-screen (no address bar), Google sign-in popup, vault
setup/unlock, offline start.

> **Google sign-in inside the app** needs the domain in **Firebase → Authentication → Settings →
> Authorized domains** (add `<your-domain>`). Without it the popup fails with
> `auth/unauthorized-domain`.

## 4. Domain verification (full-screen)

Chrome only hides its address bar when the domain proves it trusts the APK, via
`/.well-known/assetlinks.json` — a placeholder is already committed at
`public/.well-known/assetlinks.json`. After building, put the **real SHA-256 fingerprint** in:

```bash
cd android
keytool -printcert -jarfile app-release-signed.apk | grep -A1 SHA256
# (or: bubblewrap updateAssetLinks — regenerates the file from the keystore)
```

Replace the `REPLACE-WITH-…` line, keep the package name, commit and **redeploy the site**,
then reinstall the app. If a browser bar still shows: wrong fingerprint (must be the *upload*
key), package-name typo, or the file not reachable at `https://<domain>/.well-known/assetlinks.json`.

## 5. Publish on Play Console

1. Create app → category *Tools* / *Developer tools*, free, **target audience 13+** (matches the
   privacy policy).
2. **Privacy policy URL**: `https://<your-domain>/privacy` (public, no login — required).
3. **Data safety form** — answer truthfully:
   - *Personal info → Email address*: collected, shared with service providers, needed for the
     app to work (sign-in).
   - *Photos and videos* + *Files and docs*: images/snippets you save — collected, encrypted for
     the Vault, shared with a service provider (database + encrypted image host).
   - *Not collected*: location, contacts, identifiers, analytics, advertising data; data is
     encrypted in transit; users can delete everything in-app (Settings → Delete account).
4. Content-rating questionnaire (honest answers; no ads, no user-to-user content beyond links).
5. Upload the `.aab` to **Internal testing** first, install via the Play testing link, then
   promote to **Production**.
6. **Play App Signing:** Google re-signs the app with its own key when distributing. Copy the
   SHA-256 from **Play Console → Test and release → Setup → App signing** into
   `public/.well-known/assetlinks.json` as a **second** fingerprint and redeploy — otherwise the
   Play-installed version shows the address bar.

## Day-2 operations

- **Website deploys = app updates.** No rebuild needed for code/content fixes; the installed TWA
  picks them up through the service worker (with the in-app "new version ready" toast).
- **Rebuild the AAB only when** the Bubblewrap config changes (icon, name, package) or to satisfy
  Play's yearly **target-API bump**: `bubblewrap update` then `bubblewrap build`.
- If the app name or icons change, update the `manifest` block in `vite.config.ts` (it generates
  the live `/manifest.webmanifest` that packaging reads — there is no static manifest file) and
  keep the PNGs in `public/` in sync. `branding.ts` still recolors the *installed PWA* manifest at
  runtime via a `blob:` URL — packaging reads the generated file, never the `blob:`.

- If you regenerate the project, re-apply the `minSdkVersion` bump below (Bubblewrap's template
  still ships 21).

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `bubblewrap init` can't fetch the manifest | Site not deployed yet, or wrong URL — must be the HTTPS static file, not `blob:` |
| `Invalid URL` on an icon prompt | The value has a stray trailing space (Bubblewrap doesn't trim). Clear the line (`Ctrl+U`) and retype it |
| `Manifest merger failed: uses-sdk:minSdkVersion 21 … androidbrowserhelper 2.7.4` | Raise `minSdkVersion` to `24` in **both** `android/app/build.gradle` and `android/twa-manifest.json` |
| App shows an address bar | `assetlinks.json` wrong/missing (fingerprint, package name, path) — or Chrome cached the earlier failure: confirm the live file is `application/json` with the right fingerprint, then reinstall the app |
| Google sign-in popup blocked | You are testing a non-TWA wrapper (Capacitor) — popups only work in this TWA route |
| Google sign-in fails with `auth/unauthorized-domain` | Add the domain in Firebase → Authentication → Settings → Authorized domains |
| Old design after deploy | Hard-close the app once (swipe away) if a cached shell lingers |
| A phone's browser shows an "install the app" page | Expected — small screens are sent to the app. "Continue on the web instead" opts that device out |
