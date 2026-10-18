// F16 — "a plan that suits everyone": a shared plan suggestion for friends
// or a group.
//
// The input is the participants' BUSY time ranges (the only thing the
// availability layer shares anyway). Event titles, locations and categories
// do NOT come here and must not: all the model needs to know is "this range
// is taken". So this route never sees a detail friends don't show each other.
//
// The free slots are computed by code (shared/bosluklar.ts), NOT by the
// model. The model only picks the best fit among them and writes a human
// title, duration and reason. Leaving clock arithmetic to the model would
// produce "everyone is free" suggestions that are not.

import {
  bosluklariHesapla,
  dakikaya,
  enAzDakikaSinirla,
  saate,
  saatliAralik,
  yolPayiSinirla,
  type Aralik,
  type DoluBlok,
  type Katilimci,
  type SaatPenceresi,
} from '../shared/bosluklar.js'
import { anahtarEksikYaniti, geminiAnahtari, geminiCagir, geminiParcalari } from './_lib/gemini.js'
import { jsonGovdeOku, kaynakReddi, metinAl, yanit } from './_lib/http.js'

export const config = { maxDuration: 30 }

// Up to 20 participants with up to 21 days of busy blocks each; a busy
// imported calendar is a few hundred blocks per person.
const AZAMI_ISTEK = 256 * 1024

const SECENEK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    baslik: { type: 'STRING', description: 'Kısa, davetkâr başlık (max 60 karakter)' },
    tarih: { type: 'STRING', description: 'Seçilen tarih, YYYY-MM-DD — SADECE verilen uygun aralıklardan biri' },
    saat: { type: 'STRING', description: 'Başlangıç saati HH:MM — seçilen aralığın içinde olmalı' },
    sure: { type: 'STRING', description: 'Dakika (sayı, string olarak)' },
    konum: { type: 'STRING', description: 'Yer önerisi ya da boş string — uydurma bir adres yazma' },
    gerekce: { type: 'STRING', description: 'Bu fikri ve saati neden seçtiğin, tek cümle, Türkçe' },
  },
  required: ['baslik', 'tarih', 'saat', 'sure', 'konum', 'gerekce'],
}

// Several ideas instead of one: when the user comes with a vague request like
// "let's do something", alternatives to choose from beat imposing one option.
const ONER_FONKSIYONU = {
  name: 'ortak_plan_oner',
  description:
    'Verilen uygun zaman aralıklarını kullanarak gruba 1-3 somut plan fikri önerir. İlk seçenek en güçlü öneridir. Sadece listelenen aralıkların içinden saat seç.',
  parameters: {
    type: 'OBJECT',
    properties: {
      secenekler: {
        type: 'ARRAY',
        description:
          'En fazla 3 farklı fikir. İstek belirsizse birbirinden farklı aktiviteler öner (ör. kahve / yürüyüş / sinema); istek netse tek bir fikrin farklı saatlerini öner.',
        items: SECENEK_SCHEMA,
      },
    },
    required: ['secenekler'],
  },
}

interface OnerilenPlan {
  baslik: string
  tarih: string
  saat: string
  sure: number
  konum: string | null
  gerekce: string | null
}

function sistemPrompt(istek: string, katilimcilar: Katilimci[], bosluklar: Aralik[], bugun: string): string {
  const isimler = katilimcilar.map((k) => k.ad).join(', ')
  const paylasmayanlar = katilimcilar.filter((k) => !k.paylasiyor).map((k) => k.ad)

  const aralikMetni = bosluklar.map((b) => `- ${b.tarih} ${saate(b.baslangic)}–${saate(b.bitis)}`).join('\n')

  return `Sen CepDost'un ortak plan asistanısın. Türkiye'de yaşayan genç bir arkadaş grubuna, HERKESİN müsait olduğu bir saatte buluşma planı öneriyorsun.

Katılımcılar: ${isimler}
${paylasmayanlar.length > 0 ? `Not: ${paylasmayanlar.join(', ')} takvimini paylaşmıyor, onların uygunluğu bilinmiyor.` : ''}

Kullanıcının isteği: "${istek}"

Aşağıdaki aralıklarda katılımcıların HEPSİ boş (bu listeyi ben hesapladım, doğruluğundan eminim):
${aralikMetni}

Kurallar:
- ortak_plan_oner fonksiyonunu çağırarak 1-3 seçenek ver. İlk seçenek en iyi önerin olsun.
- İstek belirsizse ("bir şeyler yapalım", "canım sıkıldı") birbirinden FARKLI aktiviteler öner; istek netse aynı fikrin farklı saatlerini öner.
- Tarih ve saat MUTLAKA yukarıdaki aralıklardan birinin içinde olmalı. Listede olmayan bir zaman ASLA önerme.
- Süreyi seçilen aralığa sığdır.
- İsteğe uygun bir saat seç: kahvaltı sabah, akşam yemeği akşam, sinema akşamüstü/akşam gibi.
- Konum için ancak kullanıcı bir yer belirttiyse yaz; yoksa boş bırak — mekan adı UYDURMA.
- Gerekçe tek cümle, samimi ve Türkçe olsun.

Bugünün tarihi: ${bugun}`
}

// We VERIFY that the time the model picked really lies in one of the free
// slots. Without this check the model could offer a busy hour as "everyone
// is free" and the feature's one promise would collapse.
function planDogrula(args: Record<string, unknown>, araliklar: Aralik[]): OnerilenPlan | null {
  const metin = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

  const baslik = metin(args.baslik)
  const tarih = metin(args.tarih)
  const saat = metin(args.saat)
  if (!baslik || !/^\d{4}-\d{2}-\d{2}$/.test(tarih) || !/^\d{2}:\d{2}$/.test(saat)) return null

  const bas = dakikaya(saat)
  const uygun = araliklar.find((a) => a.tarih === tarih && bas >= a.baslangic && bas < a.bitis)
  if (!uygun) return null

  let sure = Number(args.sure)
  if (Number.isNaN(sure) || sure <= 0) sure = 60
  // The duration cannot run past the slot.
  sure = Math.min(Math.round(sure), uygun.bitis - bas)
  if (sure < 15) return null

  return {
    baslik: baslik.slice(0, 60),
    tarih,
    saat,
    sure,
    konum: metin(args.konum) || null,
    gerekce: metin(args.gerekce) || null,
  }
}

// Untrusted JSON to the shapes bosluklar.ts expects. Malformed entries are
// dropped instead of crashing the slot arithmetic.
function bloklariOku(ham: unknown): DoluBlok[] {
  if (!Array.isArray(ham)) return []
  return ham.filter(
    (b): b is DoluBlok =>
      typeof b === 'object' &&
      b !== null &&
      typeof b.tarih === 'string' &&
      typeof b.baslangic === 'string' &&
      typeof b.bitis === 'string',
  )
}

function katilimcilariOku(ham: unknown): Katilimci[] {
  const liste = Array.isArray(ham) ? ham.slice(0, 20) : []
  return liste
    .filter((k): k is Record<string, unknown> => typeof k === 'object' && k !== null)
    .map((k) => ({
      ad: String(k.ad ?? ''),
      bloklar: bloklariOku(k.bloklar),
      // Someone who does not share availability arrives with an empty list;
      // that is "unknown", not "free all day", and the prompt says so.
      paylasiyor: Boolean(k.paylasiyor),
      pencere: pencereOku(k.pencere),
    }))
}

function pencereOku(ham: unknown): SaatPenceresi | null {
  if (typeof ham !== 'object' || ham === null) return null
  const { baslangic, bitis } = ham as Record<string, unknown>
  return typeof baslangic === 'string' && typeof bitis === 'string' ? { baslangic, bitis } : null
}

export async function POST(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red

  const anahtar = geminiAnahtari()
  if (!anahtar) return anahtarEksikYaniti()

  const govde = await jsonGovdeOku(request, AZAMI_ISTEK)
  if (!govde.ok) return govde.yanit
  const girdi = govde.girdi

  const istek = String(girdi.istek ?? '').slice(0, 500).trim()
  const katilimcilar = katilimcilariOku(girdi.katilimcilar)
  const gunler = (Array.isArray(girdi.gunler) ? girdi.gunler.slice(0, 21) : []).filter(
    (g): g is string => typeof g === 'string',
  )

  if (!istek) return yanit({ error: 'Ne yapmak istediğini yaz.' }, 400)
  if (katilimcilar.length === 0 || gunler.length === 0) {
    return yanit({ error: 'Katılımcı ve tarih aralığı gerekli.' }, 400)
  }

  // The server runs in UTC, so "now" comes from the client; otherwise a past
  // hour could be suggested for today.
  const simdiTarih = String(girdi.simdiTarih ?? '')
  const simdiSaat = String(girdi.simdiSaat ?? '')

  const enAz = enAzDakikaSinirla(girdi.enAzDakika)

  const bosluklar = bosluklariHesapla({
    gunler,
    katilimcilar,
    enErken: metinAl(girdi.enErken) || undefined,
    enGec: metinAl(girdi.enGec) || undefined,
    enAzDakika: enAz,
    yolPayiDk: yolPayiSinirla(girdi.yolPayiDk),
    simdiTarih,
    simdiSaat,
  })

  if (bosluklar.length === 0) {
    // Return without calling the model: leave it nothing to make up.
    return yanit({
      plan: null,
      bosluklar: [],
      mesaj:
        'Seçtiğin günlerde herkesin birden boş olduğu yeterli bir aralık yok. Tarih aralığını genişletmeyi ya da süreyi kısaltmayı deneyebilirsin.',
    })
  }

  // At most 25 slots go to the model: more is wasted tokens and makes the
  // choice harder.
  const sunulan = bosluklar.slice(0, 25)
  // Use the client's local date when present: the server's UTC "today" can be
  // a day behind in Turkey around midnight.
  const bugun = simdiTarih || new Date().toISOString().slice(0, 10)

  const veri = await geminiCagir(
    anahtar,
    {
      systemInstruction: {
        parts: [{ text: sistemPrompt(istek, katilimcilar, sunulan, bugun) }],
      },
      contents: [{ role: 'user', parts: [{ text: istek }] }],
      tools: [{ functionDeclarations: [ONER_FONKSIYONU] }],
      toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['ortak_plan_oner'] } },
      generationConfig: { maxOutputTokens: 900 },
    },
    { etiket: 'ortak-plan' },
  )
  if (!veri) return yanit({ error: 'Öneri üretilemedi.' }, 502)

  const cagri = geminiParcalari(veri).find((p) => p.functionCall?.name === 'ortak_plan_oner')?.functionCall
  const secenekArgumani = cagri?.args?.secenekler
  const hamSecenekler: unknown[] = Array.isArray(secenekArgumani) ? secenekArgumani : []

  // Each option is checked on its own and invalid ones are dropped (if all
  // of them are invalid, the fallback below kicks in).
  const secenekler = hamSecenekler
    .slice(0, 3)
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s) => planDogrula(s, sunulan))
    .filter((s): s is OnerilenPlan => s !== null)

  const bosluklarYanit = sunulan.map(saatliAralik)

  if (secenekler.length === 0) {
    // The model picked a time outside the list: discard it and fall back to
    // the first free slot. A plain correct answer beats showing the user a
    // wrong "everyone is free" time.
    const ilk = sunulan[0]
    const yedek: OnerilenPlan = {
      baslik: istek.slice(0, 60),
      tarih: ilk.tarih,
      saat: saate(ilk.baslangic),
      sure: Math.min(enAz, ilk.bitis - ilk.baslangic),
      konum: null,
      gerekce: 'Herkesin boş olduğu en yakın aralık.',
    }
    return yanit({ plan: yedek, secenekler: [yedek], bosluklar: bosluklarYanit })
  }

  // `plan` is kept for backwards compatibility: first option = main suggestion.
  return yanit({ plan: secenekler[0], secenekler, bosluklar: bosluklarYanit })
}
