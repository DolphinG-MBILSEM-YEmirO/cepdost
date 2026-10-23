import { finalizeEvent } from 'nostr-tools/pure'
import {
  AZAMI_GONDERIM,
  BASLIK_MAKS,
  BILDIRIM_OLAY_TURU,
  BILDIRIM_TURLERI,
  GOVDE_MAKS,
  pushAdresiGecerliMi,
  type BildirimAdresi,
  type BildirimIcerigi,
  type BildirimTuru,
  type Gonderim,
} from '../../shared/bildirim'
import { webPushSifreleB64 } from '../bildirim/webPush'
import { dizinKanali } from './nostr/kanal'
import type { SosyalMotor } from './nostr/motor'
import { arkadasKodu, kanalDurumu, motor, motorVarMi, nesneMi, TUR } from './cekirdek'

// Push notifications between people (see shared/bildirim.ts for the whole
// path). Two halves:
//   - my devices: one record lists every device of mine that wants
//     notifications. It lives on my own channel; reconciliation
//     (cekirdek.ts) copies it to my friends, my groups and my directory
//     entries, so each of them can reach me;
//   - notifying someone: find their devices' addresses where I can read
//     them, sign the notification, encrypt it per device, hand it to
//     api/bildir. Always in the background: a notification that doesn't go
//     out never fails what the person actually did.

export interface BildirimKaydi {
  adresler: BildirimAdresi[]
}

// A person may have several devices; more than this is not a real person.
const AZAMI_CIHAZ = 10

export function bildirimAdresleriAl(deger: unknown): BildirimAdresi[] {
  if (!nesneMi(deger) || !Array.isArray(deger.adresler)) return []
  return deger.adresler
    .flatMap((a: unknown): BildirimAdresi[] => {
      if (!nesneMi(a) || a.tur !== 'webpush') return []
      const { endpoint, p256dh, auth } = a
      if (typeof endpoint !== 'string' || !pushAdresiGecerliMi(endpoint)) return []
      if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(p256dh)) return []
      if (typeof auth !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(auth)) return []
      const turler = Array.isArray(a.turler) ? BILDIRIM_TURLERI.filter((t) => (a.turler as unknown[]).includes(t)) : []
      return [{ tur: 'webpush', endpoint, p256dh, auth, turler }]
    })
    .slice(0, AZAMI_CIHAZ)
}

// ---------- my devices ----------

export async function benimAdreslerim(m: SosyalMotor = motor()): Promise<BildirimAdresi[]> {
  return bildirimAdresleriAl((await m.kayit(await m.ben(), m.benimId, 'bildirim'))?.veri)
}

async function adreslerimiYaz(m: SosyalMotor, adresler: BildirimAdresi[]): Promise<void> {
  await m.yayinla(await m.ben(), TUR.bildirim, 'bildirim', { adresler } satisfies BildirimKaydi)
  // Friends, groups and the directory get the new copy in this sync.
  void m.esitle().catch(() => {})
}

// Adds this device, or updates its kinds; `eski` is an endpoint it replaces.
export async function adresimiKaydet(adres: BildirimAdresi, eski?: string | null): Promise<void> {
  const m = motor()
  const mevcut = await benimAdreslerim(m)
  const ayni = mevcut.find((a) => a.endpoint === adres.endpoint)
  if (ayni && JSON.stringify(ayni) === JSON.stringify(adres) && !mevcut.some((a) => a.endpoint === eski)) return
  const digerleri = mevcut.filter((a) => a.endpoint !== adres.endpoint && a.endpoint !== eski)
  await adreslerimiYaz(m, [...digerleri, adres].slice(-AZAMI_CIHAZ))
}

export async function adresimiSil(endpoint: string, m: SosyalMotor = motor()): Promise<void> {
  const mevcut = await benimAdreslerim(m)
  if (!mevcut.some((a) => a.endpoint === endpoint)) return
  await adreslerimiYaz(
    m,
    mevcut.filter((a) => a.endpoint !== endpoint),
  )
}

// ---------- notifying someone ----------

export interface BildirimSecenekleri {
  // Who signs it; the signed-in account unless given (a plan-link guest).
  motor?: SosyalMotor
  // A group message: the members' addresses are on the group's channel.
  grupId?: string
  // Not (yet) friends: look them up in the directory, over the network.
  dizinden?: boolean
}

async function kisininAdresleri(m: SosyalMotor, pk: string, secenek: BildirimSecenekleri): Promise<BildirimAdresi[]> {
  const hesapMotoru = motorVarMi() && motor() === m
  if (hesapMotoru) {
    const durum = await kanalDurumu()
    const kanal = secenek.grupId ? durum.gruplar.get(secenek.grupId)?.kanal : durum.arkadasYayin.get(pk)
    const adresler = kanal ? bildirimAdresleriAl((await m.kayit(kanal, pk, 'bildirim'))?.veri) : []
    if (adresler.length > 0 || !secenek.dizinden) return adresler
  }
  if (!secenek.dizinden) return []
  const kanal = await dizinKanali('kod', arkadasKodu(pk))
  await m.kanalSorgula(kanal, { authors: [pk] })
  return bildirimAdresleriAl((await m.kayit(kanal, pk, 'bildirim'))?.veri)
}

function kisalt(metin: string, azami: number): string {
  const tek = metin.replace(/\s+/g, ' ').trim()
  return tek.length > azami ? `${tek.slice(0, azami - 1)}…` : tek
}

// Messages and invites should arrive now; the rest can wait for the phone.
const ACIL: readonly BildirimTuru[] = ['mesaj', 'davet', 'grup']

type Gonderici = (gonderimler: Gonderim[]) => Promise<void>

const sunucuyaGonder: Gonderici = async (gonderimler) => {
  const cevap = await fetch('/api/bildir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gonderimler }),
  })
  if (!cevap.ok) throw new Error(`Bildirim gönderilemedi (${cevap.status})`)
}

let gonderici: Gonderici = sunucuyaGonder

// Tests catch deliveries here instead (there's no api/ server there).
export function bildirimGondericisiniAyarla(yeni: Gonderici | null) {
  gonderici = yeni ?? sunucuyaGonder
}

// Signed with my account key: the receiving device shows the text only
// when it knows the signer (see bildirim/bilinenler.ts).
function imzaliYuk(m: SosyalMotor, icerik: BildirimIcerigi): Uint8Array {
  const kirpilmis: BildirimIcerigi = {
    ...icerik,
    baslik: kisalt(icerik.baslik, BASLIK_MAKS),
    govde: kisalt(icerik.govde, GOVDE_MAKS),
  }
  const olay = finalizeEvent(
    { kind: BILDIRIM_OLAY_TURU, created_at: Math.floor(Date.now() / 1000), tags: [], content: JSON.stringify(kirpilmis) },
    m.gizliAnahtar(),
  )
  return new TextEncoder().encode(JSON.stringify(olay))
}

export async function bildir(alicilar: string[], icerik: BildirimIcerigi, secenek: BildirimSecenekleri = {}): Promise<number> {
  const m = secenek.motor ?? motor()
  const acik = imzaliYuk(m, icerik)

  const gonderimler: Gonderim[] = []
  for (const pk of new Set(alicilar)) {
    if (pk === m.benimId) continue
    for (const adres of await kisininAdresleri(m, pk, secenek)) {
      if (!adres.turler.includes(icerik.tur)) continue
      gonderimler.push({
        endpoint: adres.endpoint,
        govde: await webPushSifreleB64(acik, adres.p256dh, adres.auth),
        aciliyet: ACIL.includes(icerik.tur) ? 'high' : 'normal',
      })
    }
  }
  for (let i = 0; i < gonderimler.length; i += AZAMI_GONDERIM) {
    await gonderici(gonderimler.slice(i, i + AZAMI_GONDERIM))
  }
  return gonderimler.length
}

// "Send me a test" in the settings: straight to this device.
export async function kendimeDene(adres: BildirimAdresi): Promise<void> {
  const acik = imzaliYuk(motor(), {
    tur: 'mesaj',
    baslik: 'Bildirimler çalışıyor 🎉',
    govde: 'Mesajlar, istekler ve davetler bu cihaza gelecek.',
    git: '',
    etiket: 'deneme',
  })
  await gonderici([{ endpoint: adres.endpoint, govde: await webPushSifreleB64(acik, adres.p256dh, adres.auth), aciliyet: 'high' }])
}

// Fire and forget, for the places people do things.
export function bildirArkaplanda(alicilar: string[], icerik: BildirimIcerigi, secenek?: BildirimSecenekleri): void {
  void bildir(alicilar, icerik, secenek).catch((err) => console.warn('bildirim gönderilemedi', err))
}
