import { BILDIRIM_TURLERI, type BildirimTuru, type WebPushAdresi } from '../../shared/bildirim'
import { base64Url, base64UrldenBayt } from '../sosyal/nostr/kodlama'

// This device's side of push notifications: permission, the browser's push
// subscription and which kinds the person wants. Publishing the address so
// others can reach it is sosyal/bildirimler.ts's job.
//
// Native apps later replace this file: they get an FCM/APNs token instead of
// a PushSubscription and hand back { tur: 'fcm' | 'apns', token, turler }.

export type CihazDurumu =
  // The browser has no Web Push (or no service worker).
  | 'desteklenmiyor'
  // iPhone/iPad: Web Push only works once the app is added to the home screen.
  | 'ana-ekran-gerekli'
  // The person blocked notifications for the site.
  | 'reddedildi'
  | 'kapali'
  | 'acik'

const TURLER_ANAHTARI = 'cepdost_bildirim_turleri'
// The server key this device subscribed with; a new one means subscribing again.
const SUNUCU_ANAHTARI = 'cepdost_bildirim_sunucu'
const SW_BEKLEME_MS = 8000

function depo(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function iosMu(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function anaEkrandaMi(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

function destekVarMi(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function cihazDurumu(): Promise<CihazDurumu> {
  if (!destekVarMi()) return iosMu() && !anaEkrandaMi() ? 'ana-ekran-gerekli' : 'desteklenmiyor'
  if (Notification.permission === 'denied') return 'reddedildi'
  if (Notification.permission !== 'granted') return 'kapali'
  return (await abonelik()) ? 'acik' : 'kapali'
}

export function turTercihleri(): BildirimTuru[] {
  try {
    const kayitli = JSON.parse(depo()?.getItem(TURLER_ANAHTARI) ?? 'null') as unknown
    if (Array.isArray(kayitli)) return BILDIRIM_TURLERI.filter((t) => kayitli.includes(t))
  } catch {
    // Unreadable: fall back to everything.
  }
  return [...BILDIRIM_TURLERI]
}

export function turTercihleriniKaydet(turler: BildirimTuru[]) {
  depo()?.setItem(TURLER_ANAHTARI, JSON.stringify(turler))
}

let sunucuAnahtari: Promise<string | null> | null = null

// The VAPID public key from api/bildir; null while the server isn't set up.
function sunucuAnahtariGetir(): Promise<string | null> {
  sunucuAnahtari ??= fetch('/api/bildir')
    .then((r) => (r.ok ? (r.json() as Promise<{ anahtar?: unknown }>) : { anahtar: null }))
    .then((g) => (typeof g.anahtar === 'string' ? g.anahtar : null))
    .catch(() => {
      sunucuAnahtari = null
      return null
    })
  return sunucuAnahtari
}

async function kayit(): Promise<ServiceWorkerRegistration> {
  const zamanAsimi = new Promise<never>((_, reddet) =>
    setTimeout(() => reddet(new Error('Bildirimler için uygulamayı kapatıp yeniden aç.')), SW_BEKLEME_MS),
  )
  return Promise.race([navigator.serviceWorker.ready, zamanAsimi])
}

async function abonelik(): Promise<PushSubscription | null> {
  if (!destekVarMi()) return null
  const k = await navigator.serviceWorker.getRegistration()
  return (await k?.pushManager.getSubscription()) ?? null
}

function adresYap(a: PushSubscription, turler: BildirimTuru[]): WebPushAdresi {
  const p256dh = a.getKey('p256dh')
  const auth = a.getKey('auth')
  if (!p256dh || !auth) throw new Error('Tarayıcı bildirim anahtarı vermedi.')
  return {
    tur: 'webpush',
    endpoint: a.endpoint,
    p256dh: base64Url(new Uint8Array(p256dh)),
    auth: base64Url(new Uint8Array(auth)),
    turler,
  }
}

async function abone(anahtar: string): Promise<PushSubscription> {
  const k = await kayit()
  const sub = await k.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: new Uint8Array(base64UrldenBayt(anahtar)),
  })
  depo()?.setItem(SUNUCU_ANAHTARI, anahtar)
  return sub
}

// Asks for permission (call it from a tap) and subscribes. Throws a
// message to show when it can't.
export async function bildirimleriAc(): Promise<WebPushAdresi> {
  const durum = await cihazDurumu()
  if (durum === 'ana-ekran-gerekli') throw new Error('iPhone’da önce Paylaş → Ana Ekrana Ekle ile uygulamayı ekle, oradan aç.')
  if (durum === 'desteklenmiyor') throw new Error('Bu tarayıcı bildirimleri desteklemiyor.')
  const izin = await Notification.requestPermission()
  if (izin !== 'granted') throw new Error('Bildirim izni verilmedi. Tarayıcı ayarlarından açabilirsin.')
  const anahtar = await sunucuAnahtariGetir()
  if (!anahtar) throw new Error('Bildirim sunucusuna ulaşılamadı. Biraz sonra tekrar dene.')
  const mevcut = await abonelik()
  const sub = mevcut && depo()?.getItem(SUNUCU_ANAHTARI) === anahtar ? mevcut : await yenidenAbone(mevcut, anahtar)
  return adresYap(sub, turTercihleri())
}

async function yenidenAbone(mevcut: PushSubscription | null, anahtar: string): Promise<PushSubscription> {
  await mevcut?.unsubscribe().catch(() => {})
  return abone(anahtar)
}

// Turns this device off; returns the endpoint that stopped working.
export async function bildirimleriKapat(): Promise<string | null> {
  const sub = await abonelik()
  if (!sub) return null
  await sub.unsubscribe().catch(() => {})
  return sub.endpoint
}

// At start-up: this device's current address, subscribing again when the
// server's key changed. null when notifications are off here. The second
// value is an endpoint that stopped working, if any.
export async function adresiTazele(): Promise<{ adres: WebPushAdresi | null; eski: string | null }> {
  if (!destekVarMi() || Notification.permission !== 'granted') return { adres: null, eski: null }
  const mevcut = await abonelik()
  if (!mevcut) return { adres: null, eski: null }
  const anahtar = await sunucuAnahtariGetir()
  if (!anahtar || depo()?.getItem(SUNUCU_ANAHTARI) === anahtar) return { adres: adresYap(mevcut, turTercihleri()), eski: null }
  const yeni = await yenidenAbone(mevcut, anahtar)
  return { adres: adresYap(yeni, turTercihleri()), eski: mevcut.endpoint }
}

// The address as it is now, with the latest kind choices (no network).
export async function guncelAdres(): Promise<WebPushAdresi | null> {
  const sub = await abonelik()
  return sub ? adresYap(sub, turTercihleri()) : null
}
