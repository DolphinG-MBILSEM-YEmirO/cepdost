// F8 — CepDost Asistanı: kullanıcının kayıtlı planları hakkında sohbet
// (2026-08-06), + F9: sohbet sırasında yeni plan ÖNERME (2026-08-06).
// Aynı Gemini sağlayıcısını kullanır (bkz. classify/index.ts üstündeki
// not) — GEMINI_API_KEY yalnızca bu sunucu-taraflı secret'ta, istemci
// hiçbir zaman görmüyor. Kayıtların TAMAMI değil, istemcinin ürettiği
// kompakt bir metin özeti (planOzeti) gönderiliyor — hem token hem de
// gizlilik açısından daha ölçülü (bkz. src/chat.ts planOzetiOlustur).
//
// F9: Gemini'nin resmi "function calling" (tools/functionDeclarations)
// mekanizması kullanılıyor — kullanıcı açıkça yeni bir plan eklemek
// istediğini belirtirse model plan_oner fonksiyonunu çağırır, biz de
// argümanlarını yapılandırılmış "planOnerisi" olarak istemciye döneriz.
// Fonksiyon çağrısı SADECE bir ÖNERİ — Dexie'ye hiçbir şey burada
// yazılmıyor, kullanıcı istemcide "Plana ekle"ye basmadan hiçbir kayıt
// oluşmuyor (bkz. src/components/ChatPanel.tsx).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const MODEL = 'gemini-3.5-flash-lite'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SohbetMesaji {
  rol: 'kullanici' | 'asistan'
  metin: string
}

interface Girdi {
  mesajlar: SohbetMesaji[]
  planOzeti?: string
  bugun?: string
}

// classify/index.ts'teki KAYIT_SCHEMA ile aynı alan sözleşmesi — istemci
// tarafında aynı Kayit/PlanOnerisi şekline map'lenebilsin diye bilerek
// aynı tutuldu.
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
  if (!baslik) return null // başlıksız bir öneri kullanışsız — gösterme

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }
  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY tanımlı değil' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let girdi: Girdi
  try {
    girdi = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'geçersiz JSON gövdesi' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const mesajlar = Array.isArray(girdi.mesajlar) ? girdi.mesajlar : []
  if (mesajlar.length === 0) {
    return new Response(JSON.stringify({ error: 'boş mesaj listesi' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Aşırı uzun geçmişi/istismarı sınırla — son 20 mesaj + makul uzunluk.
  const sinirliMesajlar = mesajlar.slice(-20).map((m) => ({
    rol: m.rol === 'kullanici' ? ('kullanici' as const) : ('asistan' as const),
    metin: String(m.metin ?? '').slice(0, 2000),
  }))

  const bugun = girdi.bugun || new Date().toISOString().slice(0, 10)
  const planOzeti = String(girdi.planOzeti ?? '').slice(0, 6000)

  const contents = sinirliMesajlar.map((m) => ({
    role: m.rol === 'kullanici' ? 'user' : 'model',
    parts: [{ text: m.metin }],
  }))

  const geminiRes = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistemPrompt(planOzeti, bugun) }] },
      contents,
      tools: [{ functionDeclarations: [PLAN_ONER_FONKSIYONU] }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      generationConfig: { maxOutputTokens: 500 },
    }),
  })

  if (!geminiRes.ok) {
    console.error('Gemini API hatası (chat)', geminiRes.status, await geminiRes.text())
    return new Response(JSON.stringify({ error: 'sohbet başarısız' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const geminiData = await geminiRes.json()
  const parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> =
    geminiData.candidates?.[0]?.content?.parts ?? []

  const metinParcasi = parts.find((p) => typeof p.text === 'string' && p.text.trim())?.text ?? null
  const fonksiyonCagrisi = parts.find((p) => p.functionCall?.name === 'plan_oner')?.functionCall ?? null

  const planOnerisi = fonksiyonCagrisi ? planOnerisiDogrula(fonksiyonCagrisi.args ?? {}) : null

  if (!metinParcasi && !planOnerisi) {
    return new Response(JSON.stringify({ error: 'yanıt üretilemedi' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ yanit: metinParcasi?.trim() ?? null, planOnerisi }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
