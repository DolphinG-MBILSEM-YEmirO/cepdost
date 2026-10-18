# CepDost

CepDost is a mobile-first PWA (also packaged for Android as a TWA) for turning
things you save into plans and making plans with friends.

Live: https://cepdost.vercel.app

## Features

- **Share to CepDost**: links, text and images shared from other apps land in
  the archive and are classified into plans in the background
  (`supabase/functions/classify`, Gemini + Foursquare).
- **Plans and reminders**: local-first, stored on the device with Dexie
  (IndexedDB). Plan details never leave the phone.
- **Calendar import**: `.ics` import and auto-refresh (`src/takvim.ts`,
  `supabase/functions/takvim`).
- **Social layer** (Supabase): accounts, friends, groups, group plans with
  RSVPs, direct and group messages, a feed of memories, avatars.
- **Ortak plan**: finds a time when everyone is free. Only busy time ranges
  are shared, never titles or locations (`supabase/functions/ortak-plan`).
- **Assistant chat** over your saved plans (`supabase/functions/chat`).

## Tech stack

React 19 + TypeScript, Vite, Tailwind CSS, `vite-plugin-pwa` (custom service
worker in `src/sw.ts`), Dexie, Supabase (auth, Postgres with RLS, storage,
Edge Functions).

## Project layout

```
src/
  App.tsx            app shell, sign-in gate, tabs
  db.ts              local Dexie database (plans/records)
  takvim.ts          calendar (.ics) import
  classify.ts        calls the classify Edge Function
  chat.ts            calls the chat Edge Function
  sw.ts              service worker (Android share target)
  components/        screens and UI pieces
  sosyal/            Supabase client and social features
  lib/format.ts      date/text helpers
supabase/functions/  Edge Functions (chat, classify, ortak-plan, takvim)
public/              icons, assetlinks.json for the Android app
scripts/             icon generation
spikes/              research notes and experiments
```

## Local development

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Without the Supabase variables the app still runs in local-only mode and the
social features hide themselves.

Other scripts: `npm run build`, `npm run lint`, `npm run preview`.

Edge Function secrets (set in Supabase): `GEMINI_API_KEY`, `FOURSQUARE_API_KEY`.

## Deployment

- Web: Vercel (`vercel.json` rewrites all routes to `index.html`).
- Android: Bubblewrap TWA (`twa-manifest.json`). The signing key
  (`android.keystore`) is intentionally not in the repository. Keep it backed
  up somewhere safe: without it the Play Store app can never be updated.

## Known gaps

- The database schema (tables, RLS policies, RPCs) lives only in the Supabase
  project; there is no `supabase/migrations` folder yet.
