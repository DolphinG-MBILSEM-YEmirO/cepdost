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

import { bugunTR, koduBicimle, koduTemizle } from '../shared/yakinMekanlar.js'
import { jsonGovdeOku, kaynakReddi, metinAl, yanit } from './_lib/http.js'
import { ACIK_ANAHTAR, kodGecerliMi, kodUret, kuponGizlisi, sinirAsildiMi } from './_lib/kuponKodu.js'

export { kodGecerliMi, kodUret, kuponSayaclariniSifirla } from './_lib/kuponKodu.js'

export const config = { maxDuration: 10 }

export async function POST(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red
  const anahtar = kuponGizlisi()
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
  const anahtar = kuponGizlisi()
  if (!anahtar) return yanit({ error: 'Kod doğrulama şu an kullanılamıyor.' }, 503)
  if (sinirAsildiMi(request)) return yanit({ error: 'Çok fazla deneme. Biraz sonra tekrar dene.' }, 429)
  const params = new URL(request.url).searchParams
  const isletme = params.get('i') ?? ''
  if (!ACIK_ANAHTAR.test(isletme)) return yanit({ error: 'Bu sayfayı işletme panelindeki bağlantıdan açın.' }, 400)
  const bugun = bugunTR()
  const kod = koduTemizle(params.get('kod') ?? '')
  return yanit({ gecerli: kod !== null && kodGecerliMi(anahtar, isletme, kod, bugun), tarih: bugun })
}
