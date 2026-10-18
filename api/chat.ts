// F8 — CepDost assistant: chat about the user's saved plans, + F9: SUGGEST a
// new plan during the chat. Uses the same Gemini provider as classify (see
// api/_lib/gemini.ts). Instead of ALL records the client sends a compact text
// summary it builds itself (planOzeti), which is lighter on both tokens and
// privacy (see src/chat.ts planOzetiOlustur).
//
// F9 uses Gemini's function calling (tools/functionDeclarations): when the
// user clearly asks to add a new plan, the model calls plan_oner and we hand
// its arguments to the client as a structured "planOnerisi". The call is
// ONLY a suggestion: nothing is written to Dexie here, and no record exists
// until the user taps "Plana ekle" on the client (see ChatPanel).

import { anahtarEksikYaniti, geminiAnahtari, geminiCagir, geminiParcalari } from './_lib/gemini.js'
import { jsonGovdeOku, kaynakReddi, metinAl, yanit } from './_lib/http.js'

export const config = { maxDuration: 30 }

// The server uses at most 20 messages of 2,000 characters plus a 6,000
// character summary; this leaves room for UTF-8 Turkish text and JSON.
const AZAMI_ISTEK = 128 * 1024

interface SohbetMesaji {
  rol: 'kullanici' | 'asistan'
  metin: string
}

// Same field contract as KAYIT_SCHEMA in classify, kept identical on purpose
// so the client can map both onto the same Kayit/PlanOnerisi shape.
const PLAN_ONERISI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kategori: { type: 'STRING', enum: ['mekan', 'tarif', 'urun', 'etkinlik', 'not'] },
    baslik: { type: 'STRING', description: 'Kısa, okunabilir başlık (max 60 karakter)' },
    tarih: { type: 'STRING', description: 'YYYY-MM-DD, belirsizse boş string — uydurma' },
    saat: { type: 'STRING', description: 'HH:MM, belirsizse boş string' },
    konum: { type: 'STRING', description: 'Yer adı/adres, yoksa boş string' },
    oncelik: { type: 'STRING', enum: ['dusuk', 'orta', 'yuksek'] },
    sure: { type: 'STRING', description: 'Tahmini dakika (sayı, string olarak), yoksa boş string' },
    ozet_not: { type: 'STRING', description: 'Ek not, yoksa boş string' },
  },
  required: ['kategori', 'baslik', 'tarih', 'saat', 'konum', 'oncelik', 'sure', 'ozet_not'],
}

const PLAN_ONER_FONKSIYONU = {
  name: 'plan_oner',
  description:
    'Kullanıcı sohbette CepDost\'a YENİ bir plan/hatırlatma/etkinlik/mekan fikri eklemek istediğini AÇIKÇA belirttiğinde ve en azından bir başlık çıkarılabilecek kadar bilgi verdiğinde çağrılır. Kullanıcı sadece mevcut planlarını soruyorsa, genel sohbet ediyorsa veya yeterli bilgi yoksa ASLA çağırma — bunun yerine metinle netleştirici bir soru sor.',
  parameters: PLAN_ONERISI_SCHEMA,
}

function sistemPrompt(planOzeti: string, bugun: string): string {
  return `Sen CepDost uygulamasının içinde yaşayan, dostane ve kısa konuşan bir kişisel planlama asistanısın. Kullanıcı Türkiye'de yaşayan genç bir yetişkin. Kullanıcının CepDost'ta kayıtlı planları aşağıda listelenmiş; görevin bu planlar hakkında sohbet etmek: hangi planı var, ne zaman, çakışma var mı, bugün/bu hafta önceliği ne olmalı, kısa öneriler sunmak.

Kurallar:
- Kısa ve sıcak yanıt ver — gereksiz uzatma, gerekirse madde işareti kullan.
- SADECE aşağıdaki plan listesindeki bilgilere dayan. Listede olmayan bir tarihi/mekanı/detayı ASLA uydurma.
- Kullanıcı sohbette YENİ bir plan eklemek isterse VE yeterince bilgi verdiyse (en azından ne olduğu belliyse), plan_oner fonksiyonunu çağırarak öner. Bu sadece bir ÖNERİ — kaydı SEN oluşturmuyorsun, kullanıcı ekranda "Plana ekle"ye basarsa kaydediliyor. Bu yüzden "ekledim" gibi kesin bir dille konuşma, "işte bir öneri, eklemek ister misin?" havasında ol.
- Yeterli bilgi yoksa (örn. sadece "bir şey eklemek istiyorum" derse) fonksiyonu çağırmadan önce kısa bir netleştirici soru sor.
- Türkçe yanıtla.

Bugünün tarihi: ${bugun}

Kullanıcının kayıtlı planları:
${planOzeti || '(Henüz kayıtlı planı yok.)'}`
}

interface GecerliPlanOnerisi {
  kategori: string
  baslik: string | null
  tarih: string | null
  saat: string | null
  konum: string | null
  oncelik: string
  sure: number | null
  ozetNot: string | null
}

function planOnerisiDogrula(args: Record<string, unknown>): GecerliPlanOnerisi | null {
  const gecerliKategoriler = ['mekan', 'tarif', 'urun', 'etkinlik', 'not']
  const gecerliOncelikler = ['dusuk', 'orta', 'yuksek']

  const bosYoksaNull = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s || null
  }

  const baslik = bosYoksaNull(args.baslik)
  if (!baslik) return null // a suggestion without a title is useless; don't show it

  let sure: number | null = null
  const sureSayi = Number(args.sure)
  if (!Number.isNaN(sureSayi) && sureSayi > 0) sure = Math.min(Math.round(sureSayi), 1440)

  return {
    kategori: gecerliKategoriler.includes(String(args.kategori)) ? String(args.kategori) : 'not',
    baslik,
    tarih: bosYoksaNull(args.tarih),
    saat: bosYoksaNull(args.saat),
    konum: bosYoksaNull(args.konum),
    oncelik: gecerliOncelikler.includes(String(args.oncelik)) ? String(args.oncelik) : 'orta',
    sure,
    ozetNot: bosYoksaNull(args.ozet_not),
  }
}

// Caps a long history and abuse: the last 20 messages, each of a sane length.
// Entries that are not objects are dropped rather than crashing the route.
function mesajlariSinirla(ham: unknown): SohbetMesaji[] {
  const mesajlar = Array.isArray(ham) ? ham : []
  return mesajlar
    .slice(-20)
    .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
    .map((m) => ({
      rol: m.rol === 'kullanici' ? ('kullanici' as const) : ('asistan' as const),
      metin: String(m.metin ?? '').slice(0, 2000),
    }))
}

export async function POST(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red

  const anahtar = geminiAnahtari()
  if (!anahtar) return anahtarEksikYaniti()

  const govde = await jsonGovdeOku(request, AZAMI_ISTEK)
  if (!govde.ok) return govde.yanit
  const girdi = govde.girdi

  const sinirliMesajlar = mesajlariSinirla(girdi.mesajlar)
  if (sinirliMesajlar.length === 0) return yanit({ error: 'boş mesaj listesi' }, 400)

  // The client's local date: the function runs in UTC, which lags Turkey by
  // three hours around midnight.
  const bugunHam = metinAl(girdi.bugun)
  const bugun = /^\d{4}-\d{2}-\d{2}$/.test(bugunHam) ? bugunHam : new Date().toISOString().slice(0, 10)
  const planOzeti = String(girdi.planOzeti ?? '').slice(0, 6000)

  const contents = sinirliMesajlar.map((m) => ({
    role: m.rol === 'kullanici' ? 'user' : 'model',
    parts: [{ text: m.metin }],
  }))

  const veri = await geminiCagir(
    anahtar,
    {
      systemInstruction: { parts: [{ text: sistemPrompt(planOzeti, bugun) }] },
      contents,
      tools: [{ functionDeclarations: [PLAN_ONER_FONKSIYONU] }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      generationConfig: { maxOutputTokens: 500 },
    },
    { etiket: 'chat' },
  )
  if (!veri) return yanit({ error: 'sohbet başarısız' }, 502)

  const parcalar = geminiParcalari(veri)
  const metinParcasi = parcalar.find((p) => typeof p.text === 'string' && p.text.trim())?.text ?? null
  const fonksiyonCagrisi = parcalar.find((p) => p.functionCall?.name === 'plan_oner')?.functionCall ?? null

  const planOnerisi = fonksiyonCagrisi ? planOnerisiDogrula(fonksiyonCagrisi.args ?? {}) : null

  if (!metinParcasi && !planOnerisi) return yanit({ error: 'yanıt üretilemedi' }, 502)

  return yanit({ yanit: metinParcasi?.trim() ?? null, planOnerisi })
}
