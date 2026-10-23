// F15 — calendar (.ics) proxy.
//
// The browser cannot read a Google/Apple/Outlook calendar's .ics address
// directly because of CORS. This route only "fetches and returns the text":
// nothing is stored, logged or written anywhere.
//
// A user's .ics address is a SECRET (Google calls it the "secret address":
// whoever knows it can read the calendar). So the URL is never logged here
// and never appears in error messages.
//
// Supabase's verify_jwt used to limit this to signed-in users. There is no
// session on Vercel; the origin check, the SSRF guard (only public hosts on
// 80/443) and the VCALENDAR check keep it from being a general-purpose proxy.

import { GuvenliOlmayanAdresHatasi, guvenliFetch } from './_lib/guvenliFetch.js'
import { akisiOku, jsonGovdeOku, kaynakReddi, metinAl, yanit } from './_lib/http.js'

export const config = { maxDuration: 30 }

// A calendar over 5 MB is not a real use case.
const AZAMI_BOYUT = 5 * 1024 * 1024

// The request body is only `{ url }`.
const AZAMI_ISTEK = 16 * 1024

// Covers DNS, redirects and the download together.
const ZAMAN_ASIMI_MS = 15_000

export async function POST(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red

  const govde = await jsonGovdeOku(request, AZAMI_ISTEK)
  if (!govde.ok) return govde.yanit

  // webcal:// is the scheme calendar apps use; it is the same address as https.
  const adres = metinAl(govde.girdi.url).trim().replace(/^webcal:\/\//i, 'https://')
  if (!adres) return yanit({ error: 'Geçersiz takvim adresi.' }, 400)

  let res: Response
  try {
    res = await guvenliFetch(adres, {
      headers: { Accept: 'text/calendar, text/plain, */*' },
      zamanAsimiMs: ZAMAN_ASIMI_MS,
    })
  } catch (err) {
    if (err instanceof GuvenliOlmayanAdresHatasi) return yanit({ error: 'Geçersiz takvim adresi.' }, 400)
    return yanit({ error: 'Takvim adresine ulaşılamadı.' }, 502)
  }

  if (!res.ok) {
    await res.body?.cancel().catch(() => {})
    // The status code is shared, the URL NEVER: the address is a secret key.
    return yanit({ error: `Takvim alınamadı (HTTP ${res.status}).` }, 502)
  }

  const uzunluk = Number(res.headers.get('content-length') ?? '0')
  if (uzunluk > AZAMI_BOYUT) {
    await res.body?.cancel().catch(() => {})
    return yanit({ error: 'Takvim dosyası çok büyük.' }, 413)
  }

  let bayt: Uint8Array | null
  try {
    // Streamed with a cap: Content-Length can be missing or wrong.
    bayt = await akisiOku(res.body, AZAMI_BOYUT)
  } catch {
    return yanit({ error: 'Takvim adresine ulaşılamadı.' }, 502)
  }
  if (!bayt) return yanit({ error: 'Takvim dosyası çok büyük.' }, 413)

  const metin = new TextDecoder().decode(bayt)
  if (!metin.includes('BEGIN:VCALENDAR')) {
    return yanit({ error: 'Bu adres bir takvim (.ics) dosyası değil.' }, 422)
  }

  return yanit({ ics: metin })
}
