// F2 — automatic understanding and classification (see spikes/classify/).
// The client sends the raw shared data (hamBaslik/hamMetin/hamLink, an image
// if there is one); this route enriches the link when it can (TikTok's
// official oEmbed / Instagram og:description / generic og:title +
// og:description) and turns everything into one structured record with a
// single Gemini call. Images go straight to Gemini (no OCR: a deliberate
// trade of some privacy for simplicity and accuracy). The client writes the
// result into its own Dexie record; no user data is stored here.

import { anahtarEksikYaniti, geminiAnahtari, geminiCagir, geminiParcalari } from './_lib/gemini.js'
import { GuvenliOlmayanAdresHatasi, guvenliFetch } from './_lib/guvenliFetch.js'
import { akisiOku, jsonGovdeOku, kaynakReddi, metinAl, sayiAl, yanit } from './_lib/http.js'

// Link unfurl (8 s) + the main Gemini call (25 s) + the place-info call
// (8 s) can add up past 30 s in the worst case.
export const config = { maxDuration: 45 }

// The body can carry a base64 image (the client scales big ones down first).
// Vercel itself refuses bodies over 4.5 MB, so stay just under that.
const AZAMI_ISTEK = 4 * 1024 * 1024

const UNFURL_ZAMAN_ASIMI_MS = 8000

// og: tags live in <head>; there is no need to download a whole heavy page.
const HTML_AZAMI_BAYT = 1024 * 1024

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

const GECERLI_KATEGORILER = ['mekan', 'tarif', 'urun', 'etkinlik', 'not']
const GECERLI_ONCELIKLER = ['dusuk', 'orta', 'yuksek']

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// Reads at most HTML_AZAMI_BAYT of a page; the rest is never downloaded.
async function htmlOku(res: Response): Promise<string> {
  const bayt = await akisiOku(res.body, HTML_AZAMI_BAYT, 'kes')
  return new TextDecoder().decode(bayt ?? new Uint8Array(0))
}

// The oEmbed endpoint is a fixed TikTok host, so a plain fetch is safe here;
// the user's URL only travels as a query parameter.
async function tiktokUnfurl(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(UNFURL_ZAMAN_ASIMI_MS),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { title?: string; author_name?: string }
    const parcalar = [data.title, data.author_name ? `(@${data.author_name})` : null].filter(Boolean)
    return parcalar.length > 0 ? parcalar.join(' ') : null
  } catch {
    return null
  }
}

// "instagram.com" only has to appear somewhere in the hostname to land here
// (instagram.com.attacker.example would too), so this goes through the
// SSRF guard like any other user URL.
async function instagramUnfurl(url: string): Promise<string | null> {
  try {
    const res = await guvenliFetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)',
      },
      zamanAsimiMs: UNFURL_ZAMAN_ASIMI_MS,
    })
    if (!res.ok) return null
    const html = await htmlOku(res)
    const match = html.match(/<meta property="og:description" content="([^"]*)"/)
    return match ? decodeHtmlEntities(match[1]) : null
  } catch (err) {
    if (err instanceof GuvenliOlmayanAdresHatasi) console.warn('classify: skipped an unsafe link')
    return null
  }
}

// Generic og:title + og:description scrape for links other than TikTok and
// Instagram, taken from the fetchUrlMetadata idea in the Hallet reference.
async function genelUnfurl(url: string): Promise<string | null> {
  try {
    const res = await guvenliFetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SharOSBot/1.0)' },
      zamanAsimiMs: UNFURL_ZAMAN_ASIMI_MS,
    })
    if (!res.ok) return null
    const html = await htmlOku(res)
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    const descMatch = html.match(
      /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i,
    )
    const title = decodeHtmlEntities(ogTitleMatch?.[1] ?? titleMatch?.[1] ?? '')
    const desc = decodeHtmlEntities(descMatch?.[1] ?? '')
    const birlesik = [title, desc].filter(Boolean).join(' — ')
    return birlesik || null
  } catch (err) {
    if (err instanceof GuvenliOlmayanAdresHatasi) console.warn('classify: skipped an unsafe link')
    return null
  }
}

// A different method per platform, depending on whether it has an official
// API (see spikes/classify/link-unfurl.md). The Instagram and generic paths
// scrape the page (fragile); on failure they return null and the caller
// carries on with the raw text alone.
async function linkUnfurl(url: string): Promise<string | null> {
  try {
    const host = new URL(url).hostname
    if (host.includes('tiktok.com')) return await tiktokUnfurl(url)
    if (host.includes('instagram.com')) return await instagramUnfurl(url)
    return await genelUnfurl(url)
  } catch {
    // invalid URL, ignore
  }
  return null
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

// --- F7: suggestion layer (free, no-card hybrid, 2026-08-06) ---
// Gemini grounding + Google Places (Enterprise, card required) were tried
// first; the user dropped both for the no-card path (see
// spikes/grounding/FINDINGS.md). The current design:
// - NO place name (just an idea such as "dinner"): REAL nearby places from
//   the Foursquare Places API (no card, free tier). The free tier has no
//   rating/reviews, only name/address/distance/category, and is shown as such.
// - A place name IS given: Foursquare/Places review data is not free, so
//   Gemini's OWN knowledge (no search) is asked. That MAY BE MADE UP: the
//   client MUST always label it "unverified" and never present it as a review.

interface FoursquareAday {
  isim: string
  adres: string | null
  mesafeMetre: number | null
}

async function foursquareYakinAra(
  anahtar: string,
  sorgu: string,
  enlem: number,
  boylam: number,
  limit = 5,
): Promise<FoursquareAday[]> {
  if (!sorgu.trim()) return []
  try {
    // Note: the old api.foursquare.com/v3/places/search was shut down in 2026
    // (410 Gone). The new Places API wants a separate host, a Bearer token
    // and a dated version header (see the Foursquare migration guide).
    const url = new URL('https://places-api.foursquare.com/places/search')
    url.searchParams.set('query', sorgu)
    url.searchParams.set('ll', `${enlem},${boylam}`)
    url.searchParams.set('radius', '5000')
    url.searchParams.set('limit', String(limit))
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${anahtar}`,
        Accept: 'application/json',
        'X-Places-Api-Version': '2025-06-17',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.error('Foursquare search hatası', res.status, await res.text().catch(() => ''))
      return []
    }
    const data = (await res.json()) as {
      results?: Array<{ name?: string; location?: { formatted_address?: string }; distance?: number }>
    }
    return (data.results || []).map((p) => ({
      isim: p.name ?? '',
      adres: p.location?.formatted_address ?? null,
      mesafeMetre: p.distance ?? null,
    }))
  } catch (err) {
    console.error('Foursquare search beklenmeyen hata', err)
    return []
  }
}

// A place name was given but there is no real review source: Gemini's own
// knowledge (no search) is asked. The prompt pushes the model towards "say so
// if unsure", but it MAY STILL MAKE THINGS UP; the client must always mark
// the result as "unverified".
async function mekanBilgiTahmini(anahtar: string, mekanAdi: string): Promise<string | null> {
  const veri = await geminiCagir(
    anahtar,
    {
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
    },
    { etiket: 'classify/mekan', zamanAsimiMs: 8000 },
  )
  const metin = veri ? geminiParcalari(veri)[0]?.text : undefined
  return metin?.trim() || null
}

function bosYoksaNull(s: unknown): string | null {
  return typeof s === 'string' && s.trim() ? s.trim() : null
}

export async function POST(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red

  const anahtar = geminiAnahtari()
  if (!anahtar) return anahtarEksikYaniti()

  const govde = await jsonGovdeOku(request, AZAMI_ISTEK)
  if (!govde.ok) return govde.yanit
  const girdi = govde.girdi

  const hamBaslik = metinAl(girdi.hamBaslik)
  const hamMetin = metinAl(girdi.hamMetin)
  const hamLink = metinAl(girdi.hamLink)
  const gorselBase64 = metinAl(girdi.gorselBase64)

  const zenginlestirilmisIcerik = hamLink ? await linkUnfurl(hamLink) : null

  const girdiParcalari = [
    hamBaslik && `Başlık: ${hamBaslik}`,
    hamMetin && `Metin: ${hamMetin}`,
    hamLink && `Link: ${hamLink}`,
    zenginlestirilmisIcerik && `Linkten çekilen içerik: ${zenginlestirilmisIcerik}`,
  ].filter(Boolean)

  if (girdiParcalari.length === 0 && !gorselBase64) return yanit({ error: 'boş girdi' }, 400)

  // Prefer the client's local date; the function runs in UTC, which lags
  // Turkey by three hours around midnight.
  const bugunHam = metinAl(girdi.bugun)
  const bugun = /^\d{4}-\d{2}-\d{2}$/.test(bugunHam) ? bugunHam : new Date().toISOString().slice(0, 10)

  // Gemini "contents[].parts": text and (if any) image in the same request.
  const parts: unknown[] = []
  if (girdiParcalari.length > 0) {
    parts.push({ text: girdiParcalari.join('\n') })
  }
  if (gorselBase64) {
    parts.push({
      inlineData: {
        mimeType: metinAl(girdi.gorselMime) || 'image/jpeg',
        data: gorselBase64,
      },
    })
  }

  const veri = await geminiCagir(
    anahtar,
    {
      systemInstruction: {
        parts: [{ text: `${SISTEM_PROMPT}\n\nBugünün tarihi (girdi bu tarihte paylaşıldı varsayılabilir): ${bugun}` }],
      },
      contents: [{ parts }],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: KAYIT_SCHEMA,
      },
    },
    { etiket: 'classify' },
  )
  if (!veri) return yanit({ error: 'sınıflandırma başarısız' }, 502)

  const metinYaniti = geminiParcalari(veri)[0]?.text
  if (!metinYaniti) return yanit({ error: 'yapılandırılmış çıktı yok' }, 502)

  let ham: Record<string, unknown>
  try {
    const ayrisan: unknown = JSON.parse(metinYaniti)
    if (typeof ayrisan !== 'object' || ayrisan === null) throw new Error('not an object')
    ham = ayrisan as Record<string, unknown>
  } catch (err) {
    console.error('Gemini yanıtı JSON parse edilemedi', err)
    return yanit({ error: 'geçersiz model çıktısı' }, 502)
  }

  // The schema already restricts both enums; this only guards the client
  // against a model that ignores it.
  const kategori = GECERLI_KATEGORILER.includes(String(ham.kategori)) ? String(ham.kategori) : 'not'
  const oncelik = GECERLI_ONCELIKLER.includes(String(ham.oncelik)) ? String(ham.oncelik) : 'orta'

  let sure: number | null = null
  if (ham.sure) {
    const n = Number(ham.sure)
    if (!Number.isNaN(n) && n > 0) sure = Math.min(Math.round(n), 1440)
  }

  const konum = bosYoksaNull(ham.konum)

  // F7: only for the "mekan" category. mekanOnerisi is ALWAYS an unverified
  // Gemini guess (the client must label it so); yakinOneriler is real data
  // from Foursquare (without FOURSQUARE_API_KEY this layer is silently
  // skipped and the F2 result is unaffected).
  let mekanOnerisi: string | null = null
  let yakinOneriler: YakinOneri[] | null = null

  if (kategori === 'mekan') {
    const enlem = sayiAl(girdi.enlem)
    const boylam = sayiAl(girdi.boylam)
    const foursquareAnahtari = process.env.FOURSQUARE_API_KEY?.trim()
    if (konum) {
      // A specific place name was given: no real review source, so ask
      // Gemini's own (unverified) knowledge.
      mekanOnerisi = await mekanBilgiTahmini(anahtar, konum)
    } else if (enlem !== null && boylam !== null && foursquareAnahtari) {
      // No place name, only an idea: a few real places near the user from
      // Foursquare (no rating/reviews on the free tier).
      const sorgu = hamMetin || hamBaslik || 'akşam yemeği restoran'
      const adaylar = await foursquareYakinAra(foursquareAnahtari, sorgu, enlem, boylam, 5)
      yakinOneriler = adaylar
        .filter((a) => a.isim)
        .map((a) => ({ isim: a.isim, adres: a.adres, puan: null, mesafeMetre: a.mesafeMetre }))
        .sort((a, b) => (a.mesafeMetre ?? Infinity) - (b.mesafeMetre ?? Infinity))
    }
  }

  const sonuc: Cikti = {
    kategori,
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

  return yanit(sonuc)
}
