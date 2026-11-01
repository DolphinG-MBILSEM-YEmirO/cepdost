import { useEffect, useMemo, useState } from 'react'
import { goruntulemeBasligi, type Kayit } from '../db'
import { motor, motorVarMi, useSosyalSurum } from '../sosyal/cekirdek'
import { arkadaslariGetir, musaitlikKaydi, type Profil } from '../sosyal/api'
import { akisAnilariGetir, aniGorselUrl } from '../sosyal/gruplar'
import { planKatilimi } from '../sosyal/planKatilimi'
import { useBugun } from '../hooks/useBugun'
import { toWidgetImage, WIDGET_PHOTO_SIDE } from './imageData'
import { hasNativeWidgets, publishSnapshot } from './nativeBridge'
import {
  busyForWidget,
  memoryTarget,
  personColorHex,
  pickOnThisDay,
  upcomingPlans,
  type PickedMemory,
} from './widgetData'
import {
  WIDGET_SNAPSHOT_VERSION,
  type WidgetFriend,
  type WidgetMemory,
  type WidgetPerson,
  type WidgetPlan,
} from './types'

// Gathers everything the three home widgets show, from the local plans and
// the local copy of the social data, and keeps it fresh as either changes.
// Used inside the native app only (see WidgetSync), where it is published
// as a snapshot for the phone's home-screen widgets.

// Availability older than this isn't trusted for "free right now".
const STALE_AVAILABILITY_MS = 3 * 24 * 60 * 60 * 1000

// How many memories to look through for "on this day".
const MEMORY_SCAN_LIMIT = 300

export interface HomeMemory {
  picked: PickedMemory
  // Object URL of the full photo (null if it can't be fetched); shrunk for
  // the snapshot.
  photoUrl: string | null
  target: string | null
}

export interface HomeWidgetsData {
  // The next plans, soonest first (undefined while loading).
  plans: WidgetPlan[] | undefined
  // Friends who share fresh availability (undefined while loading).
  friends: WidgetFriend[] | undefined
  // null when there's no memory to show, undefined while loading.
  memory: HomeMemory | null | undefined
}

export function toWidgetPerson(profil: Pick<Profil, 'id' | 'ad' | 'avatar' | 'emoji' | 'renk'>): WidgetPerson {
  return {
    id: profil.id,
    name: profil.ad,
    photo: profil.avatar,
    emoji: profil.emoji,
    color: personColorHex(profil.renk, profil.ad),
  }
}

async function planAttendees(kayit: Kayit): Promise<WidgetPerson[]> {
  if (!motorVarMi()) return []
  const katilim = await planKatilimi(kayit).catch(() => null)
  if (!katilim || katilim.iptal) return []
  return katilim.katilimcilar
    .filter((k) => !k.ben && (k.durum === 'geliyor' || k.durum === 'belki'))
    .map((k) => (k.profil ? toWidgetPerson(k.profil) : toWidgetPerson({ id: k.id, ad: k.ad, avatar: null, emoji: null, renk: null })))
}

async function loadPlans(kayitlar: Kayit[]): Promise<WidgetPlan[]> {
  const next = upcomingPlans(kayitlar, Date.now())
  return Promise.all(
    next.map(async ({ kayit, startsAt, endsAt }) => ({
      id: kayit.id,
      title: goruntulemeBasligi(kayit),
      emoji: kayit.emoji ?? null,
      place: kayit.konum,
      date: kayit.tarih!,
      time: kayit.tumGun ? null : (kayit.saat?.slice(0, 5) ?? null),
      allDay: !!kayit.tumGun || !kayit.saat,
      startsAt,
      endsAt,
      attendees: await planAttendees(kayit),
      withLabel: kayit.grupAdi ?? kayit.arkadasAdi ?? null,
    })),
  )
}

async function loadFriends(): Promise<WidgetFriend[]> {
  if (!motorVarMi()) return []
  const now = new Date()
  const friends = (await arkadaslariGetir()).filter((a) => a.durum === 'kabul' && a.profil.musaitlik_paylas)
  const loaded = await Promise.all(
    friends.map(async ({ profil }): Promise<WidgetFriend | null> => {
      const veri = await musaitlikKaydi(profil.id).catch(() => null)
      if (!veri || !veri.guncelleme || Date.now() - veri.guncelleme > STALE_AVAILABILITY_MS) return null
      return {
        ...toWidgetPerson(profil),
        busy: busyForWidget(veri.bloklar, now),
        window: veri.pencere ? { start: veri.pencere.baslangic, end: veri.pencere.bitis } : null,
      }
    }),
  )
  return loaded.filter((f): f is WidgetFriend => f !== null)
}

async function loadMemory(today: string): Promise<HomeMemory | null> {
  if (!motorVarMi()) return null
  const anilar = await akisAnilariGetir('arkadaslar', MEMORY_SCAN_LIMIT)
  const picked = pickOnThisDay(anilar, today)
  if (!picked) return null
  const photoUrl = await aniGorselUrl(picked.ani).catch(() => null)
  return { picked, photoUrl, target: memoryTarget(picked.ani, motor().benimId) }
}

export function useHomeWidgets(kayitlar: Kayit[], signedIn: boolean): HomeWidgetsData {
  const today = useBugun()
  const socialVersion = useSosyalSurum()
  const [plans, setPlans] = useState<WidgetPlan[]>()
  const [friends, setFriends] = useState<WidgetFriend[]>()
  const [memory, setMemory] = useState<HomeMemory | null>()

  // Plans: whenever my calendar or the social data (answers) changes, and
  // once the soonest one ends.
  const [planTick, setPlanTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    void loadPlans(kayitlar)
      .then((list) => {
        if (!cancelled) setPlans(list)
      })
      .catch(() => {
        if (!cancelled) setPlans([])
      })
    return () => {
      cancelled = true
    }
  }, [kayitlar, socialVersion, signedIn, planTick])

  const soonestEnd = plans?.[0]?.endsAt
  useEffect(() => {
    if (!soonestEnd) return
    const wait = soonestEnd - Date.now() + 1000
    // setTimeout can't wait longer than ~24.8 days; the hourly refresh
    // elsewhere covers longer gaps.
    if (wait <= 0 || wait > 2 ** 31 - 1) return
    const timer = setTimeout(() => setPlanTick((t) => t + 1), wait)
    return () => clearTimeout(timer)
  }, [soonestEnd])

  useEffect(() => {
    if (!signedIn) {
      setFriends([])
      return
    }
    let cancelled = false
    void loadFriends()
      .then((list) => {
        if (!cancelled) setFriends(list)
      })
      .catch(() => {
        if (!cancelled) setFriends([])
      })
    return () => {
      cancelled = true
    }
  }, [signedIn, socialVersion, today])

  useEffect(() => {
    if (!signedIn) {
      setMemory(null)
      return
    }
    let cancelled = false
    void loadMemory(today)
      .then((m) => {
        if (!cancelled) setMemory(m)
      })
      .catch(() => {
        if (!cancelled) setMemory(null)
      })
    return () => {
      cancelled = true
    }
  }, [signedIn, socialVersion, today])

  // Free the previous memory photo once it is replaced.
  useEffect(() => {
    const url = memory?.photoUrl
    return () => {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }, [memory?.photoUrl])

  usePublishSnapshot(plans, friends, memory)

  return useMemo(() => ({ plans, friends, memory }), [plans, friends, memory])
}

// Inside the native app: hand the widgets a fresh snapshot whenever the
// data settles. In a browser publishSnapshot does nothing.
function usePublishSnapshot(
  plans: WidgetPlan[] | undefined,
  friends: WidgetFriend[] | undefined,
  memory: HomeMemory | null | undefined,
) {
  useEffect(() => {
    if (!hasNativeWidgets()) return
    if (plans === undefined || friends === undefined || memory === undefined) return
    let cancelled = false
    void (async () => {
      let widgetMemory: WidgetMemory | null = null
      if (memory) {
        const { ani, kind, label } = memory.picked
        widgetMemory = {
          id: ani.id,
          place: ani.mekan_adi,
          date: ani.tarih,
          note: ani.notlar,
          label,
          kind,
          target: memory.target,
          photo: memory.photoUrl ? await toWidgetImage(memory.photoUrl, WIDGET_PHOTO_SIDE) : null,
        }
      }
      if (cancelled) return
      await publishSnapshot({
        version: WIDGET_SNAPSHOT_VERSION,
        updatedAt: Date.now(),
        plans,
        friends,
        memory: widgetMemory,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [plans, friends, memory])
}
