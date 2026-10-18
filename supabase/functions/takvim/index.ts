// F15 — takvim (.ics) proxy'si.
//
// Tarayıcı, Google/Apple/Outlook takviminin .ics adresini CORS yüzünden
// doğrudan okuyamaz. Bu fonksiyon yalnızca "getir ve metni geri ver" işini
// yapıyor: hiçbir şey saklanmıyor, loglanmıyor, hiçbir yere yazılmıyor.
//
// Kullanıcının .ics adresi bir SIRDIR (Google buna "gizli adres" diyor —
// adresi bilen takvimi okuyabilir). Bu yüzden URL burada asla log'a
// yazılmıyor; hata mesajlarında da geçmiyor.
//
// verify_jwt açık: yalnızca giriş yapmış CepDost kullanıcıları çağırabilir,
// böylece bu uç nokta internete açık bir genel proxy'ye dönüşmüyor.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 5 MB'ın üzerindeki bir takvim gerçek bir kullanım değil.
const AZAMI_BOYUT = 5 * 1024 * 1024

// SSRF koruması: yalnızca http(s), ve iç ağa/bulut metadata uçlarına
// gitmeye çalışan adresler reddediliyor. Bu fonksiyon Supabase altyapısında
// çalışıyor — kullanıcıdan gelen bir URL'i sorgusuz çekmek, iç servisleri
// dışarı açmak olurdu.
//
// Not: tek bir regex yerine açık kontroller — önceki hâlinde tüm dallar
// tek bir `$` ile bitiyordu, yani "10." gibi ÖNEK dalları hiçbir zaman
// eşleşmiyordu ve özel IP'ler aslında engellenmiyordu.
function ozelAdresMi(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')

  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.endsWith('.internal') || h.endsWith('.local') || h.endsWith('.home.arpa')) return true

  // IPv6 loopback / link-local / unique-local.
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true
  // IPv4-mapped IPv6 — içindeki IPv4'e bakılmalı. URL sınıfı bunu hex'e
  // normalize ediyor (::ffff:127.0.0.1 → ::ffff:7f00:1), o yüzden iki
  // biçimi de çözüyoruz.
  let adayIpv4 = h
  const noktali = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(h)
  const onaltilik = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(h)
  if (noktali) {
    adayIpv4 = noktali[1]
  } else if (onaltilik) {
    const ust = parseInt(onaltilik[1], 16)
    const alt = parseInt(onaltilik[2], 16)
    adayIpv4 = `${ust >> 8}.${ust & 0xff}.${alt >> 8}.${alt & 0xff}`
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(adayIpv4)
  if (!ipv4) return false

  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
  if (a === 0 || a === 127 || a === 10) return true
  if (a === 169 && b === 254) return true // bulut metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast + ayrılmış
  return false
}

function urlGuvenliMi(ham: string): URL | null {
  let url: URL
  try {
    // webcal:// takvim uygulamalarının kullandığı şema — https ile aynı adres.
    url = new URL(ham.trim().replace(/^webcal:\/\//i, 'https://'))
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (ozelAdresMi(url.hostname)) return null
  return url
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

  let girdi: { url?: string }
  try {
    girdi = await req.json()
  } catch {
    return yanit({ error: 'geçersiz JSON gövdesi' }, 400)
  }

  const url = urlGuvenliMi(String(girdi.url ?? ''))
  if (!url) return yanit({ error: 'Geçersiz takvim adresi.' }, 400)

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Accept: 'text/calendar, text/plain, */*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    return yanit({ error: 'Takvim adresine ulaşılamadı.' }, 502)
  }

  if (!res.ok) {
    // Durum kodunu veriyoruz ama URL'i ASLA — adres gizli bir anahtar.
    return yanit({ error: `Takvim alınamadı (HTTP ${res.status}).` }, 502)
  }

  const uzunluk = Number(res.headers.get('content-length') ?? '0')
  if (uzunluk > AZAMI_BOYUT) return yanit({ error: 'Takvim dosyası çok büyük.' }, 413)

  const metin = await res.text()
  if (metin.length > AZAMI_BOYUT) return yanit({ error: 'Takvim dosyası çok büyük.' }, 413)
  if (!metin.includes('BEGIN:VCALENDAR')) {
    return yanit({ error: 'Bu adres bir takvim (.ics) dosyası değil.' }, 422)
  }

  return yanit({ ics: metin })
})
