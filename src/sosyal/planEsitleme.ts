import type { Table } from 'dexie'
import { db, kayitSurumu, type Kayit } from '../db'
import { CATEGORIES, PRIORITIES, localDateString } from '../lib/format'
import { TUR, metinAl, motor, nesneMi, sayiAl } from './cekirdek'
import { BAGLANTI_YOK, type SosyalMotor, type SosyalKayit } from './nostr/motor'

// Keeps my plans the same on every device I'm signed in on.
//
// Each plan is one record on my own channel, which is encrypted with a key
// only my devices can derive, under the key "kayit:<id>". Plans carry a
// version (`guncellenme`, stamped by the database on every write, see
// db.ts) and the newest version wins. Deleting a plan leaves a small
// tombstone so my other devices delete it too.
//
// Photos attached to a plan stay on the device that has them: they are
// far too big for a record.

const ONEK = 'kayit:'
// One run publishes at most this many records; the rest go in the next
// run, so a first sync of a long history doesn't hold everything up.
const AZAMI_YAYIN = 60
// Relays drop old events: a record is re-published after this long...
const TAZELEME_MS = 21 * 24 * 60 * 60 * 1000
// ...as long as it still matters: pending plans, plans dated or changed in
// the last 90 days, and deletions younger than that.
const ONEMLI_MS = 90 * 24 * 60 * 60 * 1000

interface EsitlemeDurumu {
  // The account the versions below were agreed with.
  hesap: string
  // Plans last written before this moment are not uploaded. 0 on a device
  // that never synced plans (all of its plans join the account); the
  // moment of the switch after changing accounts (the plans already here
  // belong to the other account).
  esik: number
  // Plan id -> the version this device and the account last agreed on.
  surumler: Record<string, number>
}

// Where the sync state is kept: localStorage in the app, memory in tests.
export interface DurumDeposu {
  oku(): string | null
  yaz(deger: string): void
}

export interface PlanEsitlemeSonucu {
  gonderilen: number
  alinan: number
  // The publish budget ran out; another run will send the rest.
  kalan: boolean
}

interface Mezar {
  silindi: true
  guncellenme: number
}

function durumOku(depo: DurumDeposu, hesap: string, simdi: number): EsitlemeDurumu {
  let ham: unknown = null
  try {
    ham = JSON.parse(depo.oku() ?? 'null')
  } catch {
    /* unreadable: start over */
  }
  if (nesneMi(ham) && ham.hesap === hesap && nesneMi(ham.surumler)) {
    const surumler: Record<string, number> = {}
    for (const [id, s] of Object.entries(ham.surumler)) if (typeof s === 'number') surumler[id] = s
    return { hesap, esik: sayiAl(ham.esik) ?? 0, surumler }
  }
  return { hesap, esik: nesneMi(ham) && typeof ham.hesap === 'string' ? simdi : 0, surumler: {} }
}

function mezarMi(veri: unknown): veri is Mezar {
  return nesneMi(veri) && veri.silindi === true && typeof veri.guncellenme === 'number'
}

// What goes on the relays: the record without its photos, long free text
// capped so it stays well under the relay size limit.
function gonderilecek(k: Kayit): Record<string, unknown> {
  const veri: Record<string, unknown> = {
    ...k,
    hamMetin: k.hamMetin.slice(0, 4000),
    hamBaslik: k.hamBaslik.slice(0, 300),
    hamLink: k.hamLink.slice(0, 2000),
    ozetNot: k.ozetNot?.slice(0, 2000) ?? null,
    mekanOnerisi: k.mekanOnerisi?.slice(0, 2000) ?? null,
    guncellenme: kayitSurumu(k),
  }
  delete veri.gorseller
  return veri
}

function biriMi<T extends string>(deger: unknown, secenekler: readonly T[]): deger is T {
  return secenekler.includes(deger as T)
}

// A record from another of my devices. Only my devices can write to my
// channel, but a newer app version may add fields: unknown fields are kept
// (so they survive an edit here), known ones are checked.
function kayitAl(id: string, v: Record<string, unknown>): Kayit | null {
  const surum = sayiAl(v.guncellenme)
  if (surum === null) return null
  const yazi = (x: unknown) => (typeof x === 'string' ? x : '')
  return {
    ...v,
    id,
    kategori: biriMi(v.kategori, CATEGORIES) ? v.kategori : null,
    baslik: metinAl(v.baslik, 300),
    tarih: metinAl(v.tarih, 10),
    saat: metinAl(v.saat, 5),
    tumGun: v.tumGun === true,
    konum: metinAl(v.konum, 300),
    oncelik: biriMi(v.oncelik, PRIORITIES) ? v.oncelik : 'orta',
    sure: sayiAl(v.sure),
    ozetNot: metinAl(v.ozetNot),
    mekanOnerisi: metinAl(v.mekanOnerisi),
    yakinOneriler: Array.isArray(v.yakinOneriler) ? (v.yakinOneriler as Kayit['yakinOneriler']) : null,
    kaynakTipi: biriMi(v.kaynakTipi, ['gorsel', 'link', 'metin'] as const) ? v.kaynakTipi : 'metin',
    hamBaslik: yazi(v.hamBaslik),
    hamMetin: yazi(v.hamMetin),
    hamLink: yazi(v.hamLink),
    gorseller: [],
    durum: v.durum === 'yapildi' ? 'yapildi' : 'bekliyor',
    olusturulmaTarihi: sayiAl(v.olusturulmaTarihi) ?? surum,
    guncellenme: surum,
  }
}

// Whether a record is still worth keeping on the relays.
function onemliMi(veri: unknown, simdi: number): boolean {
  const sinir = simdi - ONEMLI_MS
  if (mezarMi(veri)) return veri.guncellenme >= sinir
  if (!nesneMi(veri)) return false
  if (veri.durum !== 'yapildi') return true
  const tarih = metinAl(veri.tarih, 10)
  return (tarih !== null && tarih >= localDateString(new Date(sinir))) || (sayiAl(veri.guncellenme) ?? 0) >= sinir
}

// One round of sync between this device's plans and the account's copy:
// deletions made here go out, newer versions from other devices come in,
// changes made here go out, and old records are refreshed on the relays.
export async function planlariEsitle(
  m: SosyalMotor,
  tablo: Table<Kayit, string>,
  depo: DurumDeposu,
  simdi: () => number = Date.now,
): Promise<PlanEsitlemeSonucu> {
  const ben = await m.ben()
  // Account not set up, or not synced yet on a new device: there is nothing
  // to compare with, and a guess could delete plans.
  if (!(await m.kayit(ben, m.benimId, 'profil'))) return { gonderilen: 0, alinan: 0, kalan: false }

  const durum = durumOku(depo, m.benimId, simdi())
  const sonuc: PlanEsitlemeSonucu = { gonderilen: 0, alinan: 0, kalan: false }
  const gonderilenler = new Set<string>()

  // Returns whether it went out. Offline ends the run (nothing else would
  // go either); any other failure (a record too big) skips that record.
  async function yayinla(id: string, veri: unknown): Promise<boolean> {
    if (sonuc.gonderilen >= AZAMI_YAYIN) {
      sonuc.kalan = true
      return false
    }
    try {
      await m.yayinla(ben, TUR.kayit, ONEK + id, veri)
    } catch (err) {
      if (err instanceof Error && err.message === BAGLANTI_YOK) throw err
      console.warn('plan eşitlenemedi', id, err)
      return false
    }
    sonuc.gonderilen++
    gonderilenler.add(id)
    return true
  }

  async function uzaktakiler(): Promise<Map<string, SosyalKayit>> {
    const liste = await m.tumKayitlar(ben.konu, TUR.kayit)
    return new Map(
      liste
        .filter((r) => r.yazar === m.benimId && r.anahtar.startsWith(ONEK))
        .map((r) => [r.anahtar.slice(ONEK.length), r]),
    )
  }

  try {
    const yerel = new Map((await tablo.toArray()).map((k) => [k.id, k]))

    // 1. Plans deleted here since the last agreement: tell my other devices.
    let uzak = await uzaktakiler()
    for (const [id, surum] of Object.entries(durum.surumler)) {
      if (yerel.has(id) || mezarMi(uzak.get(id)?.veri)) continue
      const mezar: Mezar = { silindi: true, guncellenme: Math.max(simdi(), surum + 1) }
      if (await yayinla(id, mezar)) durum.surumler[id] = mezar.guncellenme
    }
    uzak = await uzaktakiler()

    // 2. Newer versions from my other devices.
    for (const [id, r] of uzak) {
      const burada = yerel.get(id)
      const buradakiSurum = burada ? kayitSurumu(burada) : null

      if (mezarMi(r.veri)) {
        const surum = r.veri.guncellenme
        // Changed here after it was deleted there: the change wins and
        // goes out below.
        if (buradakiSurum !== null && buradakiSurum > surum) continue
        if (burada) {
          await tablo.delete(id)
          yerel.delete(id)
          sonuc.alinan++
        }
        durum.surumler[id] = surum
        continue
      }

      const gelen = nesneMi(r.veri) ? kayitAl(id, r.veri) : null
      if (!gelen) continue
      const surum = gelen.guncellenme!
      if (!burada) {
        // Deleted here, and the tombstone hasn't gone out yet.
        if (durum.surumler[id] !== undefined) continue
        await tablo.put(gelen)
        yerel.set(id, gelen)
        sonuc.alinan++
      } else if (surum > buradakiSurum!) {
        const yeni = { ...gelen, gorseller: burada.gorseller }
        await tablo.put(yeni)
        yerel.set(id, yeni)
        sonuc.alinan++
      } else if (surum < buradakiSurum!) {
        // Mine is newer: it goes out below.
        continue
      }
      durum.surumler[id] = surum
    }

    // 3. Plans written here since the last agreement: send them.
    for (const k of yerel.values()) {
      const surum = kayitSurumu(k)
      const bilinen = durum.surumler[k.id]
      if (bilinen === undefined ? surum < durum.esik : surum <= bilinen) continue
      if (await yayinla(k.id, gonderilecek(k))) durum.surumler[k.id] = surum
    }

    // 4. Keep-alive for records relays would otherwise forget.
    const eski = simdi() - TAZELEME_MS
    for (const [id, r] of uzak) {
      if (gonderilenler.has(id) || r.zaman * 1000 > eski || !onemliMi(r.veri, simdi())) continue
      await yayinla(id, r.veri)
    }
  } finally {
    try {
      depo.yaz(JSON.stringify(durum))
    } catch {
      /* not saved: the next run redoes the comparison */
    }
  }
  return sonuc
}

// ---------- in the app ----------

const DURUM_ANAHTARI = 'cepdost_plan_esitleme'

// Private windows and blocked storage throw; memory keeps the run going.
let bellekteki: string | null = null
const tarayiciDeposu: DurumDeposu = {
  oku() {
    try {
      return globalThis.localStorage?.getItem(DURUM_ANAHTARI) ?? bellekteki
    } catch {
      return bellekteki
    }
  },
  yaz(deger) {
    bellekteki = deger
    try {
      globalThis.localStorage?.setItem(DURUM_ANAHTARI, deger)
    } catch {
      /* memory copy only */
    }
  },
}

let calisan: Promise<void> | null = null
let yineCalis = false

// Runs a sync in the background. Calls during a run are folded into one
// more run after it, so a burst of changes costs at most two rounds.
export function planlariArkadaEsitle(): Promise<void> {
  if (calisan) {
    yineCalis = true
    return calisan
  }
  calisan = (async () => {
    try {
      do {
        yineCalis = false
        const sonuc = await planlariEsitle(motor(), db.kayitlar, tarayiciDeposu)
        if (sonuc.kalan) yineCalis = true
      } while (yineCalis)
    } catch (err) {
      console.warn('plan eşitleme başarısız', err)
    } finally {
      calisan = null
    }
  })()
  return calisan
}
