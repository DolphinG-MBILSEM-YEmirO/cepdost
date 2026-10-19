// Push notifications, shared by the app, its service worker and api/bildir.
//
// How a notification travels:
//   1. A device that turns notifications on subscribes with its browser's
//      push service and publishes the address (endpoint and keys) where the
//      people allowed to notify it can read it (src/sosyal/bildirimler.ts).
//   2. To notify someone, the sender's app signs a small payload with its
//      account key and encrypts it for each of their devices (RFC 8291,
//      src/bildirim/webPush.ts), then hands the ciphertext to api/bildir.
//   3. api/bildir only adds the server's VAPID signature and forwards it to
//      the push service. It never sees who sent what to whom.
//   4. The receiving browser decrypts it; the service worker checks the
//      signature and who sent it, then shows the notification.
//
// Native iOS/Android apps later: an address becomes { tur: 'fcm' | 'apns',
// token } and api/bildir delivers through FCM/APNs. Senders, the payload
// and the signature stay the same.

export type BildirimTuru = 'mesaj' | 'istek' | 'kabul' | 'davet' | 'grup' | 'link'

export const BILDIRIM_TURLERI: readonly BildirimTuru[] = ['mesaj', 'istek', 'kabul', 'davet', 'grup', 'link']

// Nostr event kind of the signed payload. It never goes to a relay; the
// kind only keeps it from passing for any other signed record.
export const BILDIRIM_OLAY_TURU = 27_235

export interface BildirimIcerigi {
  tur: BildirimTuru
  baslik: string
  govde: string
  // Where tapping it leads in the app (App reads it from ?git=):
  // 'dm:<pk>', 'grup:<id>', 'link:<key>' or 'arkadaslar'.
  git: string
  // Notifications with the same tag replace each other (one per chat).
  etiket: string
}

// The places a notification can lead to, checked by the service worker
// and the app before following one.
export function gitGecerliMi(git: string): boolean {
  return /^(dm:[0-9a-f]{64}|grup:[A-Za-z0-9_-]{1,40}|link:[A-Za-z0-9_-]{43}|arkadaslar)$/.test(git)
}

export const BASLIK_MAKS = 80
export const GOVDE_MAKS = 180

export interface WebPushAdresi {
  tur: 'webpush'
  endpoint: string
  // base64url, from PushSubscription.getKey().
  p256dh: string
  auth: string
  // What this device wants to hear about; senders skip the rest.
  turler: BildirimTuru[]
}

export type BildirimAdresi = WebPushAdresi

// Push services api/bildir delivers to. Anything else is refused, so the
// route can't be used to send requests to other hosts.
const PUSH_SUNUCULARI = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
  '.push.apple.com',
  '.notify.windows.com',
]

export function pushAdresiGecerliMi(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return PUSH_SUNUCULARI.some((s) => (s.startsWith('.') ? host.endsWith(s) : host === s))
}

// One delivery in a POST to api/bildir.
export interface Gonderim {
  endpoint: string
  // The RFC 8291 (aes128gcm) body, base64url.
  govde: string
  aciliyet?: 'normal' | 'high'
}

export const AZAMI_GONDERIM = 25
// Push services accept 4 KB bodies; the payload is kept well below that.
export const AZAMI_GOVDE_BAYT = 4096
