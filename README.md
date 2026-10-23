# Sharloop

Sharloop is a mobile-first PWA (also packaged for Android as a TWA) for turning
things you save into plans and making plans with friends.

Live: https://sharloop.vercel.app (the older addresses
https://cepdost.vercel.app and https://sharos.vercel.app still work)

The app was called CepDost, then briefly SharOS, until 2026-10-18. Its name
and line live in `shared/marka.ts`; a rename is that file plus
`twa-manifest.json` and this README. Turkish text uses the name without
suffixes so it reads right whatever the name is.

Internal names still say cepdost on purpose: the local database and storage
keys (renaming them would lose people's data), the Android package id and its
host (the Play listing is tied to them), the Vercel project and this
repository. Each web address keeps its own device data, so someone who opens
another address signs in once with their username and password.

## Features

- **Share to Sharloop**: links, text and images shared from other apps land in
  the archive and are classified into plans in the background
  (`api/classify.ts`, Gemini + Foursquare).
- **Plans and reminders**: local-first, stored on the device with Dexie
  (IndexedDB). Plan details never leave the phone.
- **A plan's page**: a live countdown, who is coming (from the group's
  answers or the invites sent) with a nudge for those who haven't answered
  and a jump to the chat, a private checklist that follows you to your other
  devices, notes edited in place, and a reminder. The reminder goes into the
  phone calendar file as an alarm (the dependable route, since nothing can
  wake a closed web app for free) and shows as a notification while the app
  is open (`src/components/PlanAyrintilari.tsx`, `src/lib/planAyrintilari.ts`,
  `src/sosyal/planKatilimi.ts`, `src/bildirim/planHatirlaticilari.ts`).
- **Group plans**: each has its own page (from the group's plans or the
  plan card in its chat) with my answer, every member's answer, a nudge for
  the one who set it up, and a shared "who brings what" list: anyone in the
  group adds what's needed and says they'll bring it
  (`src/components/GrupPlanDetayi.tsx`, `src/sosyal/getirListesi.ts`).
- **Calendar**: a week strip or a month grid (a dot per plan in its
  category's colour, red on missed days; the choice is remembered). Missed
  plans wait on today's page to be brought to today or tomorrow or marked
  done, one by one or all at once; a whole day's plans move together; and
  every move can be taken back for a few seconds
  (`src/components/AyTakvimi.tsx`, `src/components/TakvimIslemleri.tsx`,
  `src/lib/takvimIzgarasi.ts`, `src/lib/topluIslem.ts`). A plan's day is
  read as a local date, so it lands on the right day in every time zone.
- **Ideas (Fikirler)**: plans with no day yet, such as a place saved from a
  friend's memory, have their own list under Planlar (under the reminders
  on desktop). Each says which friends have been there or want to go,
  takes a day in one tap (with undo), and "Birlikte planla" opens the
  shared-time planner with those friends, the plan it makes taking the
  idea's place (`src/components/FikirlerView.tsx`, `src/lib/fikirler.ts`,
  `src/sosyal/fikirBaglami.ts`).
- **Profile numbers**: my profile sums up my plans (this month against
  the last, weeks in a row with a plan, the split by category, who and
  where most), and a friend's profile shows what we've done together: how
  many plans, when we last met, the next one, our usual place
  (`src/components/PlanIstatistikleri.tsx`, `src/lib/planIstatistikleri.ts`,
  `src/sosyal/ortakGecmis.ts`). Worked out on the device; only I see them.
- **Calendar import**: `.ics` import and auto-refresh (`src/takvim.ts`,
  `api/takvim.ts`).
- **Social layer**: accounts, friends, groups, group plans with RSVPs, direct
  and group messages, a feed of memories, profile photos. Free and serverless:
  records are end-to-end encrypted and stored on public Nostr relays (see
  below).
- **Answers on memories**: friends react to a memory in the feed, comment
  on it, or tap "Ben de gitmek istiyorum", which puts the place in their
  own calendar as an idea with no day yet; the one who shared it sees who
  wants to go and turns it into a plan in one tap, and hears about each
  answer. Answers travel only on the memory's pair or group channel, so
  public copies on Keşfet take none (`src/sosyal/aniEtkilesimi.ts`,
  `src/components/AniYanitlari.tsx`).
- **Message actions, WhatsApp style**: right-click or long-press a message
  (or use its options button on desktop) to reply with a quote, react with
  an emoji, copy, forward, pin, star, see who read it, edit it for 15
  minutes, or delete it for everyone or just for yourself; swipe right on a
  phone to reply (`src/sosyal/mesajIslemleri.ts`,
  `src/components/MesajIslemleri.tsx`).
- **Chat search**: the chat list's search box finds chats by name and
  messages in every chat (newest first, the match highlighted); a result
  opens its chat on that message, even one older than the first 100. Inside
  a chat, the search button steps through its matches. Turkish letters match
  their plain forms, so "cay" finds "Çay" (`src/lib/arama.ts`,
  `src/sosyal/mesajArama.ts`, `src/components/MesajArama.tsx`).
- **Back button**: on a phone (and in the browser), back closes the open
  sheet, menu or chat, steps back through a wizard, returns from a
  sub-section and then from any tab to Planlar, and only then leaves the
  app. Each of these is a layer mirrored by a history entry
  (`src/lib/geriTusu.ts`); overlays also close with Escape.
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
- Email verification keeps bots out of the public places (search, Keşfet,
  friend requests from strangers). `api/eposta.ts` mails a code (Gmail SMTP);
  when it comes back, the server signs a small attestation for the account
  (`shared/epostaOnayi.ts`). The attestation carries a keyed hash of the
  address, never the address itself, and the app checks it against the
  server's public key. The code request needs proof of work (NIP-13), so
  mass requests cost real CPU time. There is no database: a signed ticket ties
  the two steps together.

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
api/                 Vercel Functions (chat, classify, eposta, ortak-plan, takvim)
shared/              code used by both the app and api/ (free slots, email attestations)
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
  `FOURSQUARE_API_KEY` (optional), `GEMINI_MODEL` (optional), and for email
  verification `EPOSTA_GIZLI` (a random secret of 32+ characters),
  `GMAIL_ADRESI` and `GMAIL_UYGULAMA_SIFRESI` (a Google app password). Until
  all three are set, verification stays off and nobody is asked for an email.
  It also stays off while Gmail refuses the login (a wrong address or app
  password; the function log says "Gmail girişi reddedildi"), so nobody is
  locked behind a code that can never arrive. Fix the variables and redeploy.
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
- Email codes are limited by proof of work and Gmail's daily sending limit
  (about 500), not by a per-address counter. Several accounts can share one
  address; the attestation's hash makes that visible without revealing it.
