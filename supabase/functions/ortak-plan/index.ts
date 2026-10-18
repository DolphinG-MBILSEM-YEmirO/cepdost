// F16 — "herkese uyan plan": arkadaşlarla/grupla ortak plan önerisi.
//
// Girdi olarak katılımcıların DOLU saat aralıkları geliyor (müsaitlik
// katmanının zaten paylaştığı tek şey — bkz. musaitlik_bloklari). Etkinlik
// başlıkları, konumları, kategorileri BURAYA GELMİYOR ve gelmemeli:
// modelin bilmesi gereken tek şey "bu aralık dolu". Yani bu fonksiyon
// arkadaşların birbirine göstermediği hiçbir detayı görmüyor.
//
// Uygun aralıkları model DEĞİL, aşağıdaki kod hesaplıyor. Modelin işi
// yalnızca bunlar arasından isteğe en uygun olanı seçip insanca bir başlık,
// süre ve gerekçe yazmak. Saat aritmetiğini modele bırakmak, "herkes müsait"
// dediği ama aslında değil olan öneriler üretirdi.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const MODEL = 'gemini-3.5-flash-lite'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Blok {
  tarih: string // YYYY-MM-DD
  baslangic: string // HH:MM
  bitis: string // HH:MM
}

interface Katilimci {
  ad: string
  // Müsaitliğini paylaşmayan biri için boş liste gelir; bu "her an müsait"
  // demek DEĞİL — yanıtta ayrıca belirtiliyor.
  bloklar: Blok[]
  paylasiyor: boolean
}

interface Girdi {
  istek: string
  katilimcilar: Katilimci[]
  gunler: string[] // aday tarihler, YYYY-MM-DD
  // Gün içinde makul buluşma penceresi.
  enErken?: string
  enGec?: string
  enAzDakika?: number
  // İstemcinin yerel "şimdi"si. Sunucu UTC çalıştığı için buradan gelmeli;
  // olmazsa bugün için geçmiş bir saat önerilebilirdi.
  simdiTarih?: string
  simdiSaat?: string
}

// Şu andan hemen sonrasını önermek de anlamsız — yola çıkmak için pay.
const HAZIRLIK_DK = 30

const VARSAYILAN_ERKEN = '09:00'
const VARSAYILAN_GEC = '23:00'
const VARSAYILAN_EN_AZ = 60

function dakikaya(saat: string): number {
  const [s, d] = saat.split(':').map(Number)
  if (Number.isNaN(s) || Number.isNaN(d)) return 0
  return s * 60 + d
}

function saate(dakika: number): string {
  const s = Math.floor(dakika / 60)
  const d = dakika % 60
  return `${String(s).padStart(2, '0')}:${String(d).padStart(2, '0')}`
}

interface Aralik {
  tarih: string
  baslangic: number
  bitis: number
}

// Bir gün için: pencereden tüm katılımcıların dolu bloklarını çıkar, geriye
// kalan boşluklardan yeterince uzun olanları döndür.
function gunBosluklari(
  tarih: string,
  katilimcilar: Katilimci[],
  erken: number,
  gec: number,
  enAz: number,
): Aralik[] {
  const dolu: Array<[number, number]> = []
  for (const k of katilimcilar) {
    for (const b of k.bloklar) {
      if (b.tarih !== tarih) continue
      const bas = dakikaya(b.baslangic)
      const bit = dakikaya(b.bitis)
      if (bit > bas) dolu.push([bas, bit])
    }
  }

  dolu.sort((a, b) => a[0] - b[0])

  // Çakışan blokları birleştir — üst üste binen iki kişinin dersi tek bir
  // dolu aralıktır.
  const birlesik: Array<[number, number]> = []
  for (const [bas, bit] of dolu) {
    const son = birlesik[birlesik.length - 1]
    if (son && bas <= son[1]) son[1] = Math.max(son[1], bit)
    else birlesik.push([bas, bit])
  }

  const bosluklar: Aralik[] = []
  let imlec = erken
  for (const [bas, bit] of birlesik) {
    if (bas > imlec) {
      const sonu = Math.min(bas, gec)
      if (sonu - imlec >= enAz) bosluklar.push({ tarih, baslangic: imlec, bitis: sonu })
    }
    imlec = Math.max(imlec, bit)
    if (imlec >= gec) break
  }
  if (imlec < gec && gec - imlec >= enAz) {
    bosluklar.push({ tarih, baslangic: imlec, bitis: gec })
  }

  return bosluklar
}

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

// Tek öneri yerine birkaç fikir: kullanıcı "bir şeyler yapalım" gibi
// belirsiz bir istekle geldiğinde tek bir seçenek dayatmak yerine
// seçebileceği alternatifler sunuluyor.
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

function sistemPrompt(
  istek: string,
  katilimcilar: Katilimci[],
  bosluklar: Aralik[],
  bugun: string,
): string {
  const isimler = katilimcilar.map((k) => k.ad).join(', ')
  const paylasmayanlar = katilimcilar.filter((k) => !k.paylasiyor).map((k) => k.ad)

  const aralikMetni = bosluklar
    .map((b) => `- ${b.tarih} ${saate(b.baslangic)}–${saate(b.bitis)}`)
    .join('\n')

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

function yanit(govde: unknown, durum = 200): Response {
  return new Response(JSON.stringify(govde), {
    status: durum,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  if (!GEMINI_API_KEY) return yanit({ error: 'GEMINI_API_KEY tanımlı değil' }, 500)

  let girdi: Girdi
  try {
    girdi = await req.json()
  } catch {
    return yanit({ error: 'geçersiz JSON gövdesi' }, 400)
  }

  const istek = String(girdi.istek ?? '').slice(0, 500).trim()
  const katilimcilar = (Array.isArray(girdi.katilimcilar) ? girdi.katilimcilar : []).slice(0, 20)
  const gunler = (Array.isArray(girdi.gunler) ? girdi.gunler : []).slice(0, 21)

  if (!istek) return yanit({ error: 'Ne yapmak istediğini yaz.' }, 400)
  if (katilimcilar.length === 0 || gunler.length === 0) {
    return yanit({ error: 'Katılımcı ve tarih aralığı gerekli.' }, 400)
  }

  const erken = dakikaya(girdi.enErken || VARSAYILAN_ERKEN)
  const gec = dakikaya(girdi.enGec || VARSAYILAN_GEC)
  const enAz = Math.max(15, Math.min(Number(girdi.enAzDakika) || VARSAYILAN_EN_AZ, 480))

  const simdiTarih = String(girdi.simdiTarih ?? '')
  const simdiSaat = String(girdi.simdiSaat ?? '')

  const bosluklar: Aralik[] = []
  for (const gun of gunler) {
    // Bugün için geçmiş saatleri pencereden çıkar.
    const gunErken =
      gun === simdiTarih && /^\d{2}:\d{2}$/.test(simdiSaat)
        ? Math.max(erken, dakikaya(simdiSaat) + HAZIRLIK_DK)
        : erken
    if (gunErken >= gec) continue
    bosluklar.push(...gunBosluklari(gun, katilimcilar, gunErken, gec, enAz))
  }

  if (bosluklar.length === 0) {
    // Model çağırmadan dönüyoruz: uyduracak bir şey bırakmamak lazım.
    return yanit({
      plan: null,
      bosluklar: [],
      mesaj:
        'Seçtiğin günlerde herkesin birden boş olduğu yeterli bir aralık yok. Tarih aralığını genişletmeyi ya da süreyi kısaltmayı deneyebilirsin.',
    })
  }

  // Modele en fazla 25 aralık gönderiyoruz — fazlası hem gereksiz token
  // hem de seçimi zorlaştırıyor.
  const sunulan = bosluklar.slice(0, 25)
  // İstemcinin yerel tarihi varsa onu kullan — sunucunun UTC "bugün"ü
  // Türkiye'de gece yarısı civarı bir gün geride kalabilir.
  const bugun = simdiTarih || new Date().toISOString().slice(0, 10)

  const geminiRes = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: sistemPrompt(istek, katilimcilar, sunulan, bugun) }],
      },
      contents: [{ role: 'user', parts: [{ text: istek }] }],
      tools: [{ functionDeclarations: [ONER_FONKSIYONU] }],
      toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['ortak_plan_oner'] } },
      generationConfig: { maxOutputTokens: 900 },
    }),
  })

  if (!geminiRes.ok) {
    console.error('Gemini API hatası (ortak-plan)', geminiRes.status, await geminiRes.text())
    return yanit({ error: 'Öneri üretilemedi.' }, 502)
  }

  const veri = await geminiRes.json()
  const parcalar: Array<{ functionCall?: { name: string; args: Record<string, unknown> } }> =
    veri.candidates?.[0]?.content?.parts ?? []
  const cagri = parcalar.find((p) => p.functionCall?.name === 'ortak_plan_oner')?.functionCall

  const hamSecenekler = Array.isArray((cagri?.args as { secenekler?: unknown[] })?.secenekler)
    ? ((cagri!.args as { secenekler: unknown[] }).secenekler as Record<string, unknown>[])
    : []

  // Her seçenek tek tek doğrulanıyor; geçersiz olan atılıyor (hepsi
  // geçersizse aşağıdaki yedek devreye giriyor).
  const secenekler = hamSecenekler
    .slice(0, 3)
    .map((s) => planDogrula(s, sunulan))
    .filter((s): s is NonNullable<ReturnType<typeof planDogrula>> => s !== null)

  const bosluklarYanit = sunulan.map((b) => ({
    tarih: b.tarih,
    baslangic: saate(b.baslangic),
    bitis: saate(b.bitis),
  }))

  if (secenekler.length === 0) {
    // Model listedışı zaman seçtiyse öneriyi çöpe atıp ilk uygun aralığa
    // düşüyoruz — kullanıcıya "herkes müsait" diye yanlış bir saat
    // göstermektense sade bir doğru cevap versin.
    const ilk = sunulan[0]
    const yedek = {
      baslik: istek.slice(0, 60),
      tarih: ilk.tarih,
      saat: saate(ilk.baslangic),
      sure: Math.min(enAz, ilk.bitis - ilk.baslangic),
      konum: null,
      gerekce: 'Herkesin boş olduğu en yakın aralık.',
    }
    return yanit({ plan: yedek, secenekler: [yedek], bosluklar: bosluklarYanit })
  }

  // `plan` alanı geriye dönük uyumluluk için: ilk seçenek = birincil öneri.
  return yanit({ plan: secenekler[0], secenekler, bosluklar: bosluklarYanit })
})

// Modelin seçtiği zamanın gerçekten uygun aralıklardan birinde olduğunu
// DOĞRULUYORUZ. Bu kontrol olmadan model "herkes müsait" diye dolu bir saat
// önerebilirdi ve özelliğin tek vaadi çökerdi.
function planDogrula(args: Record<string, unknown>, aralikar: Aralik[]) {
  const metin = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

  const baslik = metin(args.baslik)
  const tarih = metin(args.tarih)
  const saat = metin(args.saat)
  if (!baslik || !/^\d{4}-\d{2}-\d{2}$/.test(tarih) || !/^\d{2}:\d{2}$/.test(saat)) return null

  const bas = dakikaya(saat)
  const uygun = aralikar.find((a) => a.tarih === tarih && bas >= a.baslangic && bas < a.bitis)
  if (!uygun) return null

  let sure = Number(args.sure)
  if (Number.isNaN(sure) || sure <= 0) sure = 60
  // Süre aralığın dışına taşamaz.
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
