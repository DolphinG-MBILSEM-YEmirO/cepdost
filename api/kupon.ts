// Discount codes for people who come to a business through the app. The
// business decides the discount in its profile (src/sosyal/isletme.ts);
// this only makes and checks the codes.
//
//   POST { isletme, kullanici }    → { kod, tarih }
//   GET  ?i=<business>&kod=<code>  → { gecerli, tarih }
//
// No database: a code is a MAC over the business, the day and the person
// (see shared/yakinMekanlar.ts), so the business's page can check it with
// the same secret. A code is good for the day it was made, in Turkey's time.
//
// Settings: KUPON_GIZLI (falls back to EPOSTA_GIZLI).

import { createHmac } from 'node:crypto'
import { baytlardanKod, bugunTR, koduBicimle, koduTemizle } from '../shared/yakinMekanlar.js'
import { jsonGovdeOku, kaynakReddi, metinAl, yanit } from './_lib/http.js'

export const config = { maxDuration: 10 }

const ACIK_ANAHTAR = /^[0-9a-f]{64}$/

// Checking is cheap, so guessing is slowed per address (per instance, best
// effort): a few dozen tries per window is plenty at a till.
const PENCERE_MS = 10 * 60_000
const PENCERE_BASINA = 30
const sayaclar = new Map<string, { sayi: number; bitis: number }>()

export function kuponSayaclariniSifirla(): void {
  sayaclar.clear()
}

function sinirAsildiMi(anahtar: string): boolean {
  const simdi = Date.now()
  const sayac = sayaclar.get(anahtar)
  if (!sayac || sayac.bitis < simdi) {
    sayaclar.set(anahtar, { sayi: 1, bitis: simdi + PENCERE_MS })
    return false
  }
  sayac.sayi++
  return sayac.sayi > PENCERE_BASINA
}

function gizli(): string | null {
  return process.env.KUPON_GIZLI?.trim() || process.env.EPOSTA_GIZLI?.trim() || null
}

function mac(anahtar: string, metin: string, uzunluk: number): string {
  return baytlardanKod(createHmac('sha256', anahtar).update(metin).digest(), uzunluk)
}

export function kodUret(anahtar: string, isletme: string, kullanici: string, gun: string): string {
  const ilk = mac(anahtar, `kisi|${kullanici}|${gun}`, 4)
  return ilk + mac(anahtar, `kupon|${isletme}|${gun}|${ilk}`, 4)
}

export function kodGecerliMi(anahtar: string, isletme: string, kod: string, gun: string): boolean {
  return kod.slice(4) === mac(anahtar, `kupon|${isletme}|${gun}|${kod.slice(0, 4)}`, 4)
}

export async function POST(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red
  const anahtar = gizli()
  if (!anahtar) return yanit({ error: 'İndirim kodları şu an verilemiyor.' }, 503)
  const govde = await jsonGovdeOku(request, 2048)
  if (!govde.ok) return govde.yanit
  const veri = govde.girdi
  const kullanici = metinAl(veri?.kullanici)
  const isletme = metinAl(veri?.isletme)
  if (!ACIK_ANAHTAR.test(kullanici)) return yanit({ error: 'Kod için giriş yapmış olmalısın.' }, 400)
  if (!ACIK_ANAHTAR.test(isletme) || isletme === kullanici) return yanit({ error: 'Bu işletme bulunamadı.' }, 400)
  const bugun = bugunTR()
  return yanit({ kod: koduBicimle(kodUret(anahtar, isletme, kullanici, bugun)), tarih: bugun })
}

export async function GET(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red
  const anahtar = gizli()
  if (!anahtar) return yanit({ error: 'Kod doğrulama şu an kullanılamıyor.' }, 503)
  const adres = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'bilinmiyor'
  if (sinirAsildiMi(adres)) return yanit({ error: 'Çok fazla deneme. Biraz sonra tekrar dene.' }, 429)
  const params = new URL(request.url).searchParams
  const isletme = params.get('i') ?? ''
  if (!ACIK_ANAHTAR.test(isletme)) return yanit({ error: 'Bu sayfayı işletme panelindeki bağlantıdan açın.' }, 400)
  const bugun = bugunTR()
  const kod = koduTemizle(params.get('kod') ?? '')
  return yanit({ gecerli: kod !== null && kodGecerliMi(anahtar, isletme, kod, bugun), tarih: bugun })
}
