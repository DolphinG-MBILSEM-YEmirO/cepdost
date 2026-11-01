// The home-screen widgets' data: the snapshot the native apps (Android
// AppWidget, iOS WidgetKit) read to draw the three widgets on the phone's
// home screen. The widgets live only there, never inside the app.
//
// The snapshot is a contract with native code (mobile/android, mobile/ios):
// bump WIDGET_SNAPSHOT_VERSION on any breaking change and update the Kotlin
// and Swift readers with it. Times are local wall-clock strings so the
// widgets need no time zone logic: dates 'YYYY-MM-DD', clock 'HH:MM'.

export const WIDGET_SNAPSHOT_VERSION = 1

// A person as a widget draws them: photo if any, else emoji or initial on
// their colour.
export interface WidgetPerson {
  id: string
  name: string
  // Small JPEG data URL (≤128px), or null.
  photo: string | null
  emoji: string | null
  // Hex colour ('#RRGGBB') for the initial's circle.
  color: string
}

// ---------- 1. Next plan ----------

export interface WidgetPlan {
  id: string
  title: string
  emoji: string | null
  place: string | null
  date: string
  // null for all-day plans and plans without a time.
  time: string | null
  allDay: boolean
  // Start and end as epoch ms, so countdowns don't parse anything.
  startsAt: number
  endsAt: number
  // Who is coming (and maybe coming), without me. Empty for solo plans.
  attendees: WidgetPerson[]
  // Group or friend the plan is with, for the subtitle ("Kanka grubu").
  withLabel: string | null
}

// ---------- 2. Friends free now ----------

export interface BusyRange {
  date: string
  start: string
  end: string
}

export interface WidgetFriend extends WidgetPerson {
  // Their busy ranges for today and tomorrow (never what they're doing).
  busy: BusyRange[]
  // The hours they say they're usually up for plans, if set.
  window: { start: string; end: string } | null
}

// A friend who is free at a given moment, and until when.
export interface FreeFriend {
  friend: WidgetFriend
  // 'HH:MM' when their next busy range (or their window) starts; null if
  // they are free for the rest of the day.
  freeUntil: string | null
}

// ---------- 3. On this day ----------

export type MemoryAgeKind = 'years' | 'months' | 'recent'

export interface WidgetMemory {
  id: string
  place: string
  date: string
  note: string | null
  // "1 yıl önce bugün", "3 ay önce bugün" or "Hatırlıyor musun?".
  label: string
  kind: MemoryAgeKind
  // The memory's chat/archive to open: 'grup:<id>' or 'dm:<id>'.
  target: string | null
  // Small JPEG data URL of the photo (≤480px), filled in when available.
  photo: string | null
}

// ---------- the snapshot ----------

export interface WidgetSnapshot {
  version: typeof WIDGET_SNAPSHOT_VERSION
  // When the app wrote it (epoch ms).
  updatedAt: number
  // The next few plans, soonest first: when one ends the widget moves on
  // to the next without waiting for the app.
  plans: WidgetPlan[]
  // Friends who share availability; the widget works out who is free at
  // the moment it draws (see freeFriendsAt).
  friends: WidgetFriend[]
  memory: WidgetMemory | null
}
