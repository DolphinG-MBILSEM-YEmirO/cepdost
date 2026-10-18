// Email verification for accounts: a bot needs a working inbox for every
// account it makes. There is no database; the two steps are tied together
// by a ticket only this server can make.
//
//   GET                                   → { imzaci }  the public key that
//        signs attestations, or null while the deployment is not set up
//        (the app then skips verification instead of locking everyone out)
//   POST { islem: 'kod', istek }          → { bilet, son }
//        `istek` is a Nostr event the account signed: kind ISTEK_TURU, the
//        address as content, proof of work on its id. The code goes out by
//        mail; the ticket is an HMAC over account, address, code and expiry.
//   POST { islem: 'dogrula', pk, eposta, kod, bilet } → { onay }
//        Checks the code against the ticket and returns the attestation.
//
// Settings: EPOSTA_GIZLI (a long random secret; every key here is derived
// from it, so changing it voids existing attestations) plus the Gmail
// settings in _lib/postaci.ts.

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { getPow } from 'nostr-tools/nip13'
import { finalizeEvent, getPublicKey, verifyEvent, type Event } from 'nostr-tools/pure'
import {
  ISTEK_TURU,
  ISTEK_ZAMAN_PAYI_SN,
  ISTEK_ZORLUGU,
  KOD_ALFABESI,
  KOD_GECERLILIK_MS,
  KOD_UZUNLUGU,
  ONAY_TURU,
  epostaNormallestir,
  kodGoster,
  kodNormallestir,
} from '../shared/epostaOnayi.js'
import { jsonGovdeOku, kaynakReddi, metinAl, yanit } from './_lib/http.js'
import { postaAyarliMi, postaci } from './_lib/postaci.js'

export const config = { maxDuration: 30 }

const AZAMI_ISTEK = 8 * 1024

function gizli(): string | null {
  const deger = process.env.EPOSTA_GIZLI?.trim()
  // Short secrets are refused: the tickets are only as strong as this.
  return deger && deger.length >= 32 ? deger : null
}

function anahtarTuret(gizliDeger: string, amac: string): Buffer {
  return createHmac('sha256', gizliDeger).update(`cepdost-eposta/${amac}`).digest()
}

function imzaAnahtari(gizliDeger: string): Uint8Array {
  return new Uint8Array(anahtarTuret(gizliDeger, 'imza'))
}

function ayarliMi(): string | null {
  const g = gizli()
  return g && postaAyarliMi() ? g : null
}

function ayarEksikYaniti(): Response {
  return yanit({ error: 'E-posta doğrulaması bu sunucuda henüz ayarlanmamış.' }, 503)
}

function biletImzasi(gizliDeger: string, pk: string, eposta: string, kod: string, son: number): Buffer {
  return createHmac('sha256', anahtarTuret(gizliDeger, 'bilet')).update(`${pk}\n${eposta}\n${kod}\n${son}`).digest()
}

function yeniKod(): string {
  let kod = ''
  for (let i = 0; i < KOD_UZUNLUGU; i++) kod += KOD_ALFABESI[randomInt(KOD_ALFABESI.length)]
  return kod
}

function kodPostasi(alici: string, kod: string) {
  const gosterilen = kodGoster(kod)
  const dakika = Math.round(KOD_GECERLILIK_MS / 60_000)
  return {
    alici,
    konu: `CepDost doğrulama kodun: ${gosterilen}`,
    metin:
      `CepDost'ta e-posta adresini doğrulamak için bu kodu gir:\n\n${gosterilen}\n\n` +
      `Kod ${dakika} dakika geçerli. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`,
    html: `<!doctype html>
<html lang="tr"><body style="margin:0;padding:32px 16px;background:#eef2fb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2340">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dde3f3">
    <div style="padding:28px 28px 22px;background:linear-gradient(135deg,#2563eb 0%,#4f46e5 55%,#7c6cf2 100%);color:#ffffff">
      <div style="font-size:20px;font-weight:700">CepDost</div>
      <div style="font-size:14px;opacity:.85;margin-top:4px">E-posta doğrulama</div>
    </div>
    <div style="padding:28px">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5">CepDost'ta e-posta adresini doğrulamak için bu kodu gir:</p>
      <div style="font-size:30px;font-weight:700;letter-spacing:6px;text-align:center;padding:16px;border-radius:14px;background:#f1f4fd;color:#2f3fc4">${gosterilen}</div>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#5a6488">Kod ${dakika} dakika geçerli. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.</p>
    </div>
  </div>
</body></html>`,
  }
}

export function GET(): Response {
  const g = ayarliMi()
  return yanit({ imzaci: g ? getPublicKey(imzaAnahtari(g)) : null })
}

export async function POST(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red

  const govde = await jsonGovdeOku(request, AZAMI_ISTEK)
  if (!govde.ok) return govde.yanit
  const g = ayarliMi()
  if (!g) return ayarEksikYaniti()

  const islem = metinAl(govde.girdi.islem)
  if (islem === 'kod') return kodGonder(g, govde.girdi.istek)
  if (islem === 'dogrula') return dogrula(g, govde.girdi)
  return yanit({ error: 'bilinmeyen işlem' }, 400)
}

async function kodGonder(g: string, istek: unknown): Promise<Response> {
  const olay = istek as Event
  const simdiSn = Math.floor(Date.now() / 1000)
  let gecerli = false
  try {
    gecerli =
      typeof istek === 'object' &&
      istek !== null &&
      olay.kind === ISTEK_TURU &&
      typeof olay.created_at === 'number' &&
      Math.abs(olay.created_at - simdiSn) <= ISTEK_ZAMAN_PAYI_SN &&
      typeof olay.id === 'string' &&
      getPow(olay.id) >= ISTEK_ZORLUGU &&
      verifyEvent(olay)
  } catch {
    gecerli = false
  }
  if (!gecerli) return yanit({ error: 'Geçersiz istek. Uygulamayı yenileyip tekrar dene.' }, 400)

  const eposta = epostaNormallestir(metinAl(olay.content))
  if (!eposta) return yanit({ error: 'Geçerli bir e-posta adresi yaz.' }, 400)

  const kod = yeniKod()
  const son = Date.now() + KOD_GECERLILIK_MS
  try {
    await postaci.gonder(kodPostasi(eposta, kod))
  } catch (err) {
    // The address stays out of the log; the reason is enough to debug.
    console.error('[eposta] gönderilemedi:', err instanceof Error ? err.message : err)
    return yanit({ error: 'Kod gönderilemedi. Adresi kontrol edip tekrar dene.' }, 502)
  }
  const imza = biletImzasi(g, olay.pubkey, eposta, kod, son).toString('base64url')
  return yanit({ bilet: `${son}.${imza}`, son })
}

function dogrula(g: string, girdi: Record<string, unknown>): Response {
  const pk = metinAl(girdi.pk)
  const eposta = epostaNormallestir(metinAl(girdi.eposta))
  const kod = kodNormallestir(metinAl(girdi.kod))
  const [sonMetni, imzaMetni] = metinAl(girdi.bilet).split('.')
  const son = Number(sonMetni)
  if (!/^[0-9a-f]{64}$/.test(pk) || !eposta || !Number.isSafeInteger(son) || !imzaMetni) {
    return yanit({ error: 'Geçersiz istek.' }, 400)
  }
  if (son < Date.now()) return yanit({ error: 'Kodun süresi doldu. Yeni bir kod iste.' }, 410)

  const beklenen = biletImzasi(g, pk, eposta, kod, son)
  const gelen = Buffer.from(imzaMetni, 'base64url')
  if (kod.length !== KOD_UZUNLUGU || gelen.length !== beklenen.length || !timingSafeEqual(gelen, beklenen)) {
    return yanit({ error: 'Kod hatalı.' }, 400)
  }

  const ozet = createHmac('sha256', anahtarTuret(g, 'ozet')).update(eposta).digest('base64url').slice(0, 22)
  const onay = finalizeEvent(
    { kind: ONAY_TURU, created_at: Math.floor(Date.now() / 1000), tags: [['p', pk], ['ozet', ozet]], content: '' },
    imzaAnahtari(g),
  )
  return yanit({ onay })
}
