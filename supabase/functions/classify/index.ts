// F2 — otomatik anlama ve sınıflandırma (bkz. spikes/classify/, proje
// notları). İstemci ham paylaşım verisini (hamBaslik/hamMetin/hamLink,
// varsa görsel) gönderir; bu fonksiyon gerekirse linki zenginleştirir
// (TikTok resmi oEmbed / Instagram og:description / genel og:title+
// og:description), tek bir Gemini çağrısıyla yapılandırılmış bir kayda
// çevirip döner. Görseller doğrudan Gemini'ye gönderiliyor (OCR yok —
// bilinçli tercih, bkz. proje notları: basitlik + doğruluk, gizlilikten
// taviz). İstemci sonucu kendi Dexie kaydına yazar — burada hiçbir
// kullanıcı verisi saklanmıyor.
//
// Sağlayıcı: Gemini (Anthropic'in aksine kalıcı ücretsiz kademesi var).
// GEMINI_API_KEY yalnızca bu sunucu-taraflı secret'tan okunuyor — istemci
// hiçbir zaman kendi anahtarını göndermiyor/görmüyor (Hallet referansındaki
// "kullanıcı kendi anahtarını girsin" deseninin bilerek benimsenmediği yer).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const FOURSQUARE_API_KEY = Deno.env.get('FOURSQUARE_API_KEY')
const MODEL = 'gemini-3.5-flash-lite'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SISTEM_PROMPT = `Sen kullanıcının kaydettiği içerikleri (ekran görüntüsü, paylaşılan link, paylaşılan düz metin) tek bir yapılandırılmış planlama kaydına çeviren bir sınıflandırıcısın. Girdi gürültülü olabilir (hashtag'ler, kullanıcı adları, emoji, OCR benzeri metin).

Kategori seçimi:
- "mekan": restoran, kafe, bar, mağaza, gezilecek yer
- "tarif": bir yemek/içecek tarifi
- "urun": alınacak bir ürün
- "etkinlik": konser, tiyatro, randevu, buluşma
- "not": genel not/fikir/hatırlatma — belirsizse son çare bu

Öncelik (oncelik) seçimi:
- "yuksek": bugün/yakında yapılması gereken, zamanı geçmiş, önemli randevu
- "orta": normal, planlanması gereken ama acil olmayan (varsayılan)
- "dusuk": sadece bilgi amaçlı, zaman baskısı yok

Süre (sure) tahmini (dakika, sayı olarak string, örn. "60"):
- Tipik süreler: konser ~180, tiyatro ~120, kahve/yemek ~60-90, alışveriş ~45
- Belirsizse/uygun değilse boş string

Kurallar:
- Tarih (tarih) metinde açıkça geçiyorsa YYYY-MM-DD, geçmiyorsa boş string — uydurma.
- Saat (saat) metinde açıkça geçiyorsa HH:MM, geçmiyorsa boş string.
- Konum metinde geçmiyorsa boş string.
- Girdide olmayan bilgiyi uydurma.
- Girdi yalnızca bir URL'den ibaretse ve başka bağlam yoksa, kategori tahmini yapma — "not" kategorisiyle linki ozet_not'a koy.
- Yalnızca verilen şemaya uygun JSON döndür.`

const KAYIT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kategori: { type: 'STRING', enum: ['mekan', 'tarif', 'urun', 'etkinlik', 'not'] },
    baslik: { type: 'STRING', description: 'Kısa, okunabilir başlık (max 60 karakter)' },
    tarih: { type: 'STRING', description: 'YYYY-MM-DD, belirsizse boş string' },
    saat: { type: 'STRING', description: 'HH:MM, belirsizse boş string' },
    konum: { type: 'STRING', description: 'Yer adı/adres, yoksa boş string' },
    oncelik: { type: 'STRING', enum: ['dusuk', 'orta', 'yuksek'] },
    sure: { type: 'STRING', description: 'Tahmini dakika (sayı, string olarak), yoksa boş string' },
    ozet_not: { type: 'STRING', description: 'Ana alanlara girmeyen ama kaybolmaması gereken ek bilgi, yoksa boş string' },
  },
  required: ['kategori', 'baslik', 'tarih', 'saat', 'konum', 'oncelik', 'sure', 'ozet_not'],
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

async function tiktokUnfurl(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    const data = await res.json()
    const parcalar = [data.title, data.author_name ? `(@${data.author_name})` : null].filter(Boolean)
    return parcalar.length > 0 ? parcalar.join(' ') : null
  } catch {
    return null
  }
}

async function instagramUnfurl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)',
      },
    })
    if (!res.ok) return null
    const html = await res.text()
    const match = html.match(/<meta property="og:description" content="([^"]*)"/)
    return match ? decodeHtmlEntities(match[1]) : null
  } catch {
    return null
  }
}

// TikTok/Instagram dışındaki linkler için genel og:title + og:description
// scrape'i — Hallet referansındaki fetchUrlMetadata fikrinden alındı.
async function genelUnfurl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CepDostBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    const descMatch = html.match(
      /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i,
    )
    const title = decodeHtmlEntities(ogTitleMatch?.[1] ?? titleMatch?.[1] ?? '')
    const desc = decodeHtmlEntities(descMatch?.[1] ?? '')
    const birlesik = [title, desc].filter(Boolean).join(' — ')
    return birlesik || null
  } catch {
    return null
  }
}

// Resmi API'si olan/olmayan her platform için farklı yöntem — bkz.
// spikes/classify/link-unfurl.md. Instagram/genel taraf sayfa scrape'i
// (kırılgan); başarısız olursa null döner, çağıran taraf bunu görmezden
// gelip yalnızca ham metinle devam eder.
async function linkUnfurl(url: string): Promise<string | null> {
  try {
    const host = new URL(url).hostname
    if (host.includes('tiktok.com')) return await tiktokUnfurl(url)
    if (host.includes('instagram.com')) return await instagramUnfurl(url)
    return await genelUnfurl(url)
  } catch {
    // geçersiz URL, yok say
  }
  return null
}

interface Girdi {
  hamBaslik?: string
  hamMetin?: string
  hamLink?: string
  gorselBase64?: string
  gorselMime?: string
  enlem?: number
  boylam?: number
}

interface YakinOneri {
  isim: string
  adres: string | null
  puan: number | null
  mesafeMetre: number | null
}

interface Cikti {
  kategori: string
  baslik: string | null
  tarih: string | null
  saat: string | null
  konum: string | null
  oncelik: string
  sure: number | null
  ozetNot: string | null
  mekanOnerisi: string | null
  yakinOneriler: YakinOneri[] | null
}

// --- F7: öneri katmanı (ücretsiz/kartsız hibrit, 2026-08-06) ---
// Önce Gemini grounding + Google Places (Enterprise, kart gerekli) denendi
// — kullanıcı ikisinden de vazgeçip kartsız yolu seçti (bkz.
// spikes/grounding/FINDINGS.md). Şimdiki tasarım:
// - Mekan adı YOKSA (sadece "akşam yemeği" gibi bir fikir): Foursquare
//   Places API ile GERÇEK yakın mekanlar (kartsız, ücretsiz kademe).
//   Foursquare'in ücretsiz kademesinde puan/yorum yok, sadece isim/adres/
//   mesafe/kategori var — dürüstçe öyle gösteriliyor.
// - Mekan adı VARSA: Foursquare/Places'ın yorum verisi ücretsizde yok, o
//   yüzden Gemini'nin KENDİ bilgisine (arama yapmadan) soruluyor. Bu
//   UYDURABİLİR — istemci tarafı bunu her zaman "doğrulanmamış" etiketiyle
//   göstermek ZORUNDA, gerçek yorum gibi sunmuyor.

interface FoursquareAday {
  isim: string
  adres: string | null
  mesafeMetre: number | null
}

async function foursquareYakinAra(
  sorgu: string,
  enlem: number,
  boylam: number,
  limit = 5,
): Promise<FoursquareAday[]> {
  if (!FOURSQUARE_API_KEY || !sorgu.trim()) return []
  try {
    // Not: eski api.foursquare.com/v3/places/search 2026'da kapatıldı
    // (410 Gone). Yeni "Places API" ayrı bir host + Bearer token + tarihli
    // versiyon header'ı istiyor — bkz. Foursquare migration guide.
    const url = new URL('https://places-api.foursquare.com/places/search')
    url.searchParams.set('query', sorgu)
    url.searchParams.set('ll', `${enlem},${boylam}`)
    url.searchParams.set('radius', '5000')
    url.searchParams.set('limit', String(limit))
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${FOURSQUARE_API_KEY}`,
        Accept: 'application/json',
        'X-Places-Api-Version': '2025-06-17',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.error('Foursquare search hatası', res.status, await res.text())
      return []
    }
    const data = await res.json()
    return (data.results || []).map(
      (p: { name?: string; location?: { formatted_address?: string }; distance?: number }) => ({
        isim: p.name ?? '',
        adres: p.location?.formatted_address ?? null,
        mesafeMetre: p.distance ?? null,
      }),
    )
  } catch (err) {
    console.error('Foursquare search beklenmeyen hata', err)
    return []
  }
}

// Mekan adı verilmiş ama gerçek yorum kaynağımız yok — Gemini'nin kendi
// (arama yapmadan) bilgisine soruluyor. Prompt bilinçli olarak modeli
// "emin değilsen söyle" yönünde zorluyor, ama yine de UYDURABİLİR — sonuç
// istemci tarafında her zaman "doğrulanmamış" olarak işaretlenmeli.
async function mekanBilgiTahmini(mekanAdi: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `"${mekanAdi}" hakkında kendi bilgine dayanarak (arama yapmadan): bu mekanda genelde neyin beğenildiği/öne çıktığı biliniyorsa tek Türkçe cümlede söyle. Bu mekan hakkında güvenilir bir bilgin yoksa veya emin değilsen, uydurma — sadece "Bu mekan hakkında güvenilir bir bilgim yok." yaz.`,
              },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 150 },
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const metin: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text
    return metin?.trim() || null
  } catch (err) {
    console.error('mekanBilgiTahmini beklenmeyen hata', err)
    return null
  }
}

function bosYoksaNull(s: string | undefined): string | null {
  return s && s.trim() ? s.trim() : null
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

  const hamBaslik = girdi.hamBaslik ?? ''
  const hamMetin = girdi.hamMetin ?? ''
  const hamLink = girdi.hamLink ?? ''

  const zenginlestirilmisIcerik = hamLink ? await linkUnfurl(hamLink) : null

  const girdiParcalari = [
    hamBaslik && `Başlık: ${hamBaslik}`,
    hamMetin && `Metin: ${hamMetin}`,
    hamLink && `Link: ${hamLink}`,
    zenginlestirilmisIcerik && `Linkten çekilen içerik: ${zenginlestirilmisIcerik}`,
  ].filter(Boolean)

  if (girdiParcalari.length === 0 && !girdi.gorselBase64) {
    return new Response(JSON.stringify({ error: 'boş girdi' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const bugun = new Date().toISOString().slice(0, 10)

  // Gemini "contents[].parts" — metin + (varsa) görsel aynı istekte.
  const parts: unknown[] = []
  if (girdiParcalari.length > 0) {
    parts.push({ text: girdiParcalari.join('\n') })
  }
  if (girdi.gorselBase64) {
    parts.push({
      inlineData: {
        mimeType: girdi.gorselMime || 'image/jpeg',
        data: girdi.gorselBase64,
      },
    })
  }
  if (parts.length === 0) {
    parts.push({ text: '(içerik yok)' })
  }

  const geminiRes = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: `${SISTEM_PROMPT}\n\nBugünün tarihi (girdi bu tarihte paylaşıldı varsayılabilir): ${bugun}` }],
      },
      contents: [{ parts }],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: KAYIT_SCHEMA,
      },
    }),
  })

  if (!geminiRes.ok) {
    console.error('Gemini API hatası', geminiRes.status, await geminiRes.text())
    return new Response(JSON.stringify({ error: 'sınıflandırma başarısız' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const geminiData = await geminiRes.json()
  const metinYaniti: string | undefined = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
  if (!metinYaniti) {
    return new Response(JSON.stringify({ error: 'yapılandırılmış çıktı yok' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let ham: {
    kategori: string
    baslik?: string
    tarih?: string
    saat?: string
    konum?: string
    oncelik?: string
    sure?: string
    ozet_not?: string
  }
  try {
    ham = JSON.parse(metinYaniti)
  } catch (err) {
    console.error('Gemini yanıtı JSON parse edilemedi', err, metinYaniti)
    return new Response(JSON.stringify({ error: 'geçersiz model çıktısı' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const gecerliOncelikler = ['dusuk', 'orta', 'yuksek']
  const oncelik = gecerliOncelikler.includes(ham.oncelik ?? '') ? (ham.oncelik as string) : 'orta'

  let sure: number | null = null
  if (ham.sure) {
    const n = Number(ham.sure)
    if (!Number.isNaN(n) && n > 0) sure = Math.min(Math.round(n), 1440)
  }

  const konum = bosYoksaNull(ham.konum)

  // F7: sadece "mekan" kategorisinde devreye girer. mekanOnerisi HER ZAMAN
  // doğrulanmamış Gemini tahmini (istemci bunu böyle etiketlemeli);
  // yakinOneriler Foursquare'den gerçek veri (FOURSQUARE_API_KEY yoksa bu
  // katman sessizce atlanır, F2 sonucu etkilenmez).
  let mekanOnerisi: string | null = null
  let yakinOneriler: YakinOneri[] | null = null

  if (ham.kategori === 'mekan') {
    if (konum) {
      // Belirli bir mekan adı verilmiş — gerçek yorum kaynağımız yok,
      // Gemini'nin kendi (doğrulanmamış) bilgisine soruluyor.
      mekanOnerisi = await mekanBilgiTahmini(konum)
    } else if (girdi.enlem != null && girdi.boylam != null && FOURSQUARE_API_KEY) {
      // Mekan adı yok, sadece bir fikir — Foursquare'den konuma göre
      // gerçek birkaç öneri (ücretsiz kademede puan/yorum yok).
      const sorgu = hamMetin || hamBaslik || 'akşam yemeği restoran'
      const adaylar = await foursquareYakinAra(sorgu, girdi.enlem, girdi.boylam, 5)
      yakinOneriler = adaylar
        .filter((a) => a.isim)
        .map((a) => ({ isim: a.isim, adres: a.adres, puan: null, mesafeMetre: a.mesafeMetre }))
        .sort((a, b) => (a.mesafeMetre ?? Infinity) - (b.mesafeMetre ?? Infinity))
    }
  }

  const sonuc: Cikti = {
    kategori: ham.kategori,
    baslik: bosYoksaNull(ham.baslik),
    tarih: bosYoksaNull(ham.tarih),
    saat: bosYoksaNull(ham.saat),
    konum,
    oncelik,
    sure,
    ozetNot: bosYoksaNull(ham.ozet_not),
    mekanOnerisi,
    yakinOneriler,
  }

  return new Response(JSON.stringify(sonuc), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
