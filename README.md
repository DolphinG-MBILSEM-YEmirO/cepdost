# CepDost

CepDost is a mobile-first PWA (also packaged for Android as a TWA) for turning
things you save into plans and making plans with friends.

Live: https://cepdost.vercel.app

## Features

- **Share to CepDost**: links, text and images shared from other apps land in
  the archive and are classified into plans in the background
  (`api/classify.ts`, Gemini + Foursquare).
- **Plans and reminders**: local-first, stored on the device with Dexie
  (IndexedDB). Plan details never leave the phone.
- **Calendar import**: `.ics` import and auto-refresh (`src/takvim.ts`,
  `api/takvim.ts`).
- **Social layer**: accounts, friends, groups, group plans with RSVPs, direct
  and group messages, a feed of memories, profile photos. Free and serverless:
  records are end-to-end encrypted and stored on public Nostr relays (see
  below).
- **Ortak plan**: finds a time when everyone is free. Only busy time ranges
  are shared, never titles or locations (`api/ortak-plan.ts`,
  `shared/bosluklar.ts`).
- **Assistant chat** over your saved plans (`api/chat.ts`).

## How the social layer works

There is no database server. An account is a key pair created on the device
(`src/sosyal/kimlik.ts`); the recovery code shown in Settings is the private
key (`nsec1...`). Everything social is a signed record (Nostr kind 30078) on a
few free public relays (`src/sosyal/nostr/role.ts`).

- Each record lives on a *channel* with its own key: only me (`ben`), a pair of
  friends (`cift`), my friends (`yayin`, rotated when I unfriend someone), a
  group (`grup`). Contents are AES-GCM encrypted; relays only see random tags.
- `src/sosyal/nostr/motor.ts` keeps a local copy in IndexedDB, syncs it in the
  background and listens live; screens read the local copy and re-render on
  changes (`useSosyalSurum`).
- `src/sosyal/cekirdek.ts` derives friendships, channels and groups from the
  records and reconciles them after each sync.
- Username + password sign-in: the key is encrypted with the password
  (PBKDF2 600k + AES-GCM) and published under the username. Old Supabase
  accounts were not migrated.

## Tech stack

React 19 + TypeScript, Vite, Tailwind CSS, `vite-plugin-pwa` (custom service
worker in `src/sw.ts`), Dexie, `nostr-tools`, Vercel Functions for the AI and
calendar endpoints.

## Project layout

```
src/
  App.tsx            app shell, sign-in gate, tabs
  db.ts              local Dexie database (plans/records)
  takvim.ts          calendar (.ics) import
  classify.ts        calls /api/classify
  chat.ts            calls /api/chat
  sw.ts              service worker (Android share target)
  components/        screens and UI pieces
  sosyal/            accounts, friends, groups, messages (nostr/ is the engine)
  lib/               date/text helpers, personalization options
api/                 Vercel Functions (chat, classify, ortak-plan, takvim)
shared/              code used by both the app and api/ (free-slot search)
tests/               node:test suites (social layer, api)
public/              icons, assetlinks.json for the Android app
scripts/             icon generation, local test relay
spikes/              research notes and experiments
```

## Local development

```bash
npm install
cp .env.example .env   # GEMINI_API_KEY for the AI features (optional)
npm run dev
```

The dev server also serves the `api/` routes. Social features use the public
relays; to work offline, run a local relay and point the app at it:

```bash
node scripts/relay.mjs                       # ws://localhost:7777
open http://localhost:5173/?relays=ws://localhost:7777
```

Other scripts: `npm test`, `npm run build`, `npm run lint`, `npm run preview`.

## Deployment

- Web: Vercel (`vercel.json`). Environment variables (Project → Settings →
  Environment Variables): `GEMINI_API_KEY` (required for the AI features),
  `FOURSQUARE_API_KEY` (optional), `GEMINI_MODEL` (optional).
- Android: Bubblewrap TWA (`twa-manifest.json`). The signing key
  (`android.keystore`) is intentionally not in the repository. Keep it backed
  up somewhere safe: without it the Play Store app can never be updated.

## Known limits

- Public relays may drop old records; the app republishes key records every
  few weeks, and messages/photos older than that can disappear.
- Password backups are public (encrypted), so a weak password can be guessed
  offline. The minimum is 8 characters; the recovery code is the safer key.
- Leaving a group does not rotate the group key; someone who left could still
  read new group messages if they kept a copy of the key.
