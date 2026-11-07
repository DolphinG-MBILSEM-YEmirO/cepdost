// SharPoint (shared/sharpoint.ts): points for going to the places Sharloop
// suggests, proved by the business's till scanning the customer's QR.
//
//   GET                                → { imzaci }  the key every points
//                                        record is signed with (null: off)
//   POST { islem: 'kasa', istek }      → { kasa }    a business proves it is
//                                        its account (a signed request) and
//                                        gets the key its till page keeps
//   POST { islem: 'dogrula', i, kod, k, p?, o?, kasa }
//                                      → { gecerli, sharpoint, odul }
//      i: business, kod: the day's code, k: the customer, p: plan hashes,
//      o: a reward to spend, kasa: the till key. Checks the discount code
//      like api/kupon.ts and, when the till key is right, counts the visit.
//
// Settings: KUPON_GIZLI (falls back to EPOSTA_GIZLI), SHARPOINT_ROLELERI.

import { timingSafeEqual } from 'node:crypto'
import { verifyEvent, type Event } from 'nostr-tools/pure'
import { KASA_ISTEK_TURU, KASA_ZAMAN_PAYI_SN, isaretleriTemizle } from '../shared/sharpoint.js'
import { bugunTR, kampanyaCanliMi, koduTemizle } from '../shared/yakinMekanlar.js'
import { KAMPANYALAR } from './_lib/kampanyalar.js'
import { jsonGovdeOku, kaynakReddi, metinAl, yanit } from './_lib/http.js'
import { ACIK_ANAHTAR, kodGecerliMi, kodUret, kuponGizlisi, sinirAsildiMi } from './_lib/kuponKodu.js'
import { roleErisimi, type RoleErisimi } from './_lib/roleler.js'
import { imzaAnahtari, imzaci, kasaAnahtari, ziyaretiIsle } from './_lib/sharpointDefteri.js'

export const config = { maxDuration: 25 }

// Tests swap the relays for an in-memory stand-in.
let roleUret: () => RoleErisimi & { kapat?: () => void } = () => roleErisimi()
export function sharpointRoleleriniAyarla(yeni: (() => RoleErisimi) | null): void {
  roleUret = yeni ?? (() => roleErisimi())
}

function esitMi(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function GET(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red
  const gizli = kuponGizlisi()
  return yanit({ imzaci: gizli ? imzaci(gizli) : null })
}

function kasaIstegi(gizli: string, istek: unknown): Response {
  const olay = istek as Event
  const simdi = Math.floor(Date.now() / 1000)
  const uygun =
    typeof istek === 'object' &&
    istek !== null &&
    olay.kind === KASA_ISTEK_TURU &&
    olay.content === 'sharloop-kasa' &&
    typeof olay.created_at === 'number' &&
    Math.abs(olay.created_at - simdi) <= KASA_ZAMAN_PAYI_SN &&
    ACIK_ANAHTAR.test(String(olay.pubkey)) &&
    verifyEvent(olay)
  if (!uygun) return yanit({ error: 'İstek doğrulanamadı. Telefonun saatini kontrol edip tekrar dene.' }, 400)
  return yanit({ kasa: kasaAnahtari(gizli, olay.pubkey) })
}

async function dogrula(gizli: string, veri: Record<string, unknown> | null): Promise<Response> {
  const isletme = metinAl(veri?.i)
  if (!ACIK_ANAHTAR.test(isletme)) return yanit({ error: 'Bu sayfayı işletme panelindeki bağlantıdan açın.' }, 400)
  const gun = bugunTR()
  const kod = koduTemizle(metinAl(veri?.kod))
  if (!kod || !kodGecerliMi(gizli, isletme, kod, gun)) return yanit({ gecerli: false, tarih: gun })

  const musteri = metinAl(veri?.k)
  // The code must be this customer's own code for today.
  if (!ACIK_ANAHTAR.test(musteri) || musteri === isletme || kodUret(gizli, isletme, musteri, gun) !== kod) {
    return yanit({ gecerli: true, tarih: gun, sharpoint: null })
  }
  const kasa = metinAl(veri?.kasa)
  if (!kasa || !esitMi(kasa, kasaAnahtari(gizli, isletme))) {
    return yanit({ gecerli: true, tarih: gun, sharpoint: null, kasaGerekli: true })
  }

  const odulId = metinAl(veri?.o)
  const role = roleUret()
  try {
    const sonuc = await ziyaretiIsle({
      role,
      sk: imzaAnahtari(gizli),
      isletme,
      musteri,
      gun,
      oneCikan: KAMPANYALAR.some((k) => k.isletme === isletme && kampanyaCanliMi(k, gun)),
      isaretler: isaretleriTemizle(veri?.p),
      odulId: /^[a-z0-9]{4,12}$/.test(odulId) ? odulId : null,
    })
    return yanit({
      gecerli: true,
      tarih: gun,
      sharpoint: { kazanilan: sonuc.kazanilan, bakiye: sonuc.ozet.bakiye, seviye: sonuc.ozet.seviye },
      odul: sonuc.odul,
    })
  } catch (err) {
    console.error('sharpoint', err)
    return yanit({ gecerli: true, tarih: gun, sharpoint: null, error: 'SharPoint şu an kaydedilemedi. İndirim geçerli.' })
  } finally {
    role.kapat?.()
  }
}

export async function POST(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red
  const gizli = kuponGizlisi()
  if (!gizli) return yanit({ error: 'SharPoint şu an kullanılamıyor.' }, 503)
  if (sinirAsildiMi(request)) return yanit({ error: 'Çok fazla deneme. Biraz sonra tekrar dene.' }, 429)
  const govde = await jsonGovdeOku(request, 4096)
  if (!govde.ok) return govde.yanit
  const veri = (govde.girdi ?? null) as Record<string, unknown> | null
  if (veri?.islem === 'kasa') return kasaIstegi(gizli, veri.istek)
  if (veri?.islem === 'dogrula') return dogrula(gizli, veri)
  return yanit({ error: 'Bilinmeyen istek.' }, 400)
}
