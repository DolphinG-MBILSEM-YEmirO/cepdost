// Push notification relay. Browsers can't post to push services themselves
// (no CORS, and each push must carry the app server's VAPID signature), so
// the sender's app hands the already-encrypted notification here and this
// route forwards it. It never sees the content, the sender or the person
// behind an address; there is no database.
//
//   GET                         → { anahtar }  the VAPID public key devices
//        subscribe with (base64url), or null while the deployment is not set up
//   POST { gonderimler: [{ endpoint, govde, aciliyet? }] }
//        → { sonuclar: ['ok' | 'gecersiz' | 'hata', ...] }
//        `govde` is the RFC 8291 body (base64url). 'gecersiz' means the
//        subscription is gone (the device turned notifications off).
//
// Settings: BILDIRIM_GIZLI, or EPOSTA_GIZLI when that isn't set. The VAPID
// key is derived from it; changing it makes every device subscribe again
// the next time the app opens (src/bildirim/cihaz.ts notices the new key).
//
// Native apps later: a delivery with { tur: 'fcm' | 'apns', token } goes to
// FCM/APNs from teslimEt(); nothing else here changes.

import { createECDH, createHmac, createPrivateKey, sign, type KeyObject } from 'node:crypto'
import {
  AZAMI_GONDERIM,
  AZAMI_GOVDE_BAYT,
  pushAdresiGecerliMi,
  type Gonderim,
} from '../shared/bildirim.js'
import { jsonGovdeOku, kaynakReddi, metinAl, yanit } from './_lib/http.js'

export const config = { maxDuration: 30 }

// Each delivery is ~5.5 KB of base64 at most, plus the endpoint.
const AZAMI_ISTEK = AZAMI_GONDERIM * 7 * 1024
// A notification nobody saw within a day is old news.
const TTL_SN = 24 * 60 * 60
const ZAMAN_ASIMI_MS = 10_000
// Order of the P-256 group.
const N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551')

interface Vapid {
  // Uncompressed public key, base64url.
  acik: string
  anahtar: KeyObject
}

let onbellek: { gizli: string; vapid: Vapid } | null = null

function gizli(): string | null {
  const deger = (process.env.BILDIRIM_GIZLI || process.env.EPOSTA_GIZLI)?.trim()
  return deger && deger.length >= 32 ? deger : null
}

export function vapidAnahtari(gizliDeger: string): Vapid {
  if (onbellek?.gizli === gizliDeger) return onbellek.vapid
  const ham = createHmac('sha256', gizliDeger).update('cepdost-bildirim/vapid').digest()
  // Any 32 bytes reduced into [1, n-1] is a valid private key.
  const d = (BigInt(`0x${ham.toString('hex')}`) % (N - 1n)) + 1n
  const dBayt = Buffer.from(d.toString(16).padStart(64, '0'), 'hex')
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(dBayt)
  const acik = ecdh.getPublicKey()
  const anahtar = createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: dBayt.toString('base64url'),
      x: acik.subarray(1, 33).toString('base64url'),
      y: acik.subarray(33).toString('base64url'),
    },
    format: 'jwk',
  })
  const vapid = { acik: acik.toString('base64url'), anahtar }
  onbellek = { gizli: gizliDeger, vapid }
  return vapid
}

// RFC 8292: a short-lived ES256 token for one push service.
export function vapidJwt(vapid: Vapid, hedef: string, iletisim: string, simdiSn = Math.floor(Date.now() / 1000)): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const imzalanan = `${b64({ typ: 'JWT', alg: 'ES256' })}.${b64({ aud: hedef, exp: simdiSn + 12 * 60 * 60, sub: iletisim })}`
  const imza = sign('sha256', Buffer.from(imzalanan), { key: vapid.anahtar, dsaEncoding: 'ieee-p1363' })
  return `${imzalanan}.${imza.toString('base64url')}`
}

export async function GET(): Promise<Response> {
  const g = gizli()
  return yanit({ anahtar: g ? vapidAnahtari(g).acik : null })
}

type Sonuc = 'ok' | 'gecersiz' | 'hata'

function gonderimAl(deger: unknown): (Gonderim & { bayt: Uint8Array }) | null {
  if (typeof deger !== 'object' || deger === null) return null
  const d = deger as Record<string, unknown>
  const endpoint = metinAl(d.endpoint)
  const govde = metinAl(d.govde)
  if (!pushAdresiGecerliMi(endpoint) || !/^[A-Za-z0-9_-]+$/.test(govde)) return null
  const bayt = new Uint8Array(Buffer.from(govde, 'base64url'))
  // Smaller than an empty RFC 8291 message, or bigger than a push may be.
  if (bayt.length < 21 + 65 + 17 || bayt.length > AZAMI_GOVDE_BAYT) return null
  return { endpoint, govde, bayt, aciliyet: d.aciliyet === 'high' ? 'high' : 'normal' }
}

async function teslimEt(g: Gonderim & { bayt: Uint8Array }, vapid: Vapid, iletisim: string): Promise<Sonuc> {
  try {
    const cevap = await fetch(g.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${vapidJwt(vapid, new URL(g.endpoint).origin, iletisim)}, k=${vapid.acik}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(TTL_SN),
        Urgency: g.aciliyet ?? 'normal',
      },
      body: g.bayt,
      redirect: 'manual',
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
    })
    if (cevap.status === 404 || cevap.status === 410) return 'gecersiz'
    return cevap.ok ? 'ok' : 'hata'
  } catch {
    return 'hata'
  }
}

export async function POST(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red

  const govde = await jsonGovdeOku(request, AZAMI_ISTEK)
  if (!govde.ok) return govde.yanit
  const g = gizli()
  if (!g) return yanit({ error: 'Bildirimler bu sunucuda henüz kurulmadı.' }, 503)

  const liste = govde.girdi.gonderimler
  if (!Array.isArray(liste) || liste.length === 0 || liste.length > AZAMI_GONDERIM) {
    return yanit({ error: 'gonderimler 1 ile 25 arasında olmalı' }, 400)
  }
  const gonderimler = liste.map(gonderimAl)
  if (gonderimler.some((x) => x === null)) return yanit({ error: 'geçersiz gönderim' }, 400)

  // The push service may contact this address about our traffic.
  const iletisim = `https://${(request.headers.get('host') ?? new URL(request.url).host).toLowerCase()}`
  const vapid = vapidAnahtari(g)
  const sonuclar = await Promise.all(gonderimler.map((x) => teslimEt(x!, vapid, iletisim)))
  return yanit({ sonuclar })
}
