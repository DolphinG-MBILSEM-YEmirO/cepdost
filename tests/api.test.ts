// Tests for the Vercel functions (api/) and the shared free-slot logic.
// DNS is mocked so the SSRF guard can be tested without network access.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import dnsPromises from 'node:dns/promises'
import { syncBuiltinESMExports } from 'node:module'


// ---------- DNS mock (must be installed before modules import lookup) ----------
const dnsTablosu: Record<string, string[]> = {
  'public.example': ['93.184.216.34'],
  'fdx.com': ['93.184.216.35'],
  'evil.example': ['10.0.0.5'],
  'mixed.example': ['93.184.216.36', '127.0.0.1'],
  'v6evil.example': ['fd12:3456::1'],
  'mapped.example': ['::ffff:169.254.169.254'],
  'www.instagram.com': ['157.240.1.174'],
  'calendar.example': ['93.184.216.40'],
}
const dnsCagrilari: string[] = []
;(dnsPromises as unknown as { lookup: unknown }).lookup = async (host: string, opts: { all?: boolean }) => {
  dnsCagrilari.push(host)
  const adresler = dnsTablosu[host]
  if (!adresler) {
    const e = new Error(`getaddrinfo ENOTFOUND ${host}`) as Error & { code: string }
    e.code = 'ENOTFOUND'
    throw e
  }
  const liste = adresler.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  return opts?.all ? liste : liste[0]
}
syncBuiltinESMExports()

const { POST: chatPOST } = await import('../api/chat.ts')
const { POST: classifyPOST } = await import('../api/classify.ts')
const { POST: ortakPOST } = await import('../api/ortak-plan.ts')
const { POST: takvimPOST } = await import('../api/takvim.ts')
const guvenli = await import('../api/_lib/guvenliFetch.ts')
const gemini = await import('../api/_lib/gemini.ts')
const bos = await import('../shared/bosluklar.ts')

// ---------- fetch mock ----------
type Isleyici = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>
let fetchIsleyici: Isleyici = () => {
  throw new Error('beklenmeyen fetch')
}
const fetchCagrilari: Array<{ url: URL; init?: RequestInit }> = []
globalThis.fetch = (async (girdi: string | URL | Request, init?: RequestInit) => {
  const url = new URL(girdi instanceof Request ? girdi.url : String(girdi))
  fetchCagrilari.push({ url, init })
  return fetchIsleyici(url, init)
}) as typeof fetch

const HOST = 'cepdost.vercel.app'
function istek(yol: string, govde: unknown, ek: { origin?: string | null; host?: string; ham?: BodyInit; headers?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json', host: ek.host ?? HOST, ...ek.headers }
  if (ek.origin !== null) headers.origin = ek.origin ?? `https://${HOST}`
  return new Request(`https://${HOST}${yol}`, {
    method: 'POST',
    headers,
    body: ek.ham ?? JSON.stringify(govde),
    // @ts-expect-error node needs duplex for stream bodies
    duplex: 'half',
  })
}
async function json(res: Response): Promise<any> {
  return JSON.parse(await res.text())
}
function geminiMetin(metin: string): Response {
  return Response.json({ candidates: [{ content: { parts: [{ text: metin }] } }] })
}
function geminiParcalar(parts: unknown[]): Response {
  return Response.json({ candidates: [{ content: { parts } }] })
}

beforeEach(() => {
  fetchCagrilari.length = 0
  dnsCagrilari.length = 0
  process.env.GEMINI_API_KEY = 'test-key'
  delete process.env.GEMINI_MODEL
  delete process.env.FOURSQUARE_API_KEY
  fetchIsleyici = () => {
    throw new Error('beklenmeyen fetch')
  }
})

// ======================= http: origin + body limit =======================

test('origin: different host -> 403, no Gemini call', async () => {
  const res = await chatPOST(istek('/api/chat', { mesajlar: [{ rol: 'kullanici', metin: 'x' }] }, { origin: 'https://evil.com' }))
  assert.equal(res.status, 403)
  assert.equal((await json(res)).error, 'İzin verilmeyen kaynak.')
  assert.equal(fetchCagrilari.length, 0)
})

test('origin: "null" -> 403; subdomain lookalike -> 403', async () => {
  for (const origin of ['null', 'https://cepdost.vercel.app.evil.com', 'http://cepdost.vercel.app:8080']) {
    const res = await chatPOST(istek('/api/chat', {}, { origin }))
    assert.equal(res.status, 403, origin)
  }
})

test('origin: missing Origin allowed; explicit default port allowed', async () => {
  delete process.env.GEMINI_API_KEY
  const a = await chatPOST(istek('/api/chat', {}, { origin: null }))
  assert.equal(a.status, 503) // got past origin check
  const b = await chatPOST(istek('/api/chat', {}, { host: 'cepdost.vercel.app:443' }))
  assert.equal(b.status, 503)
  const c = await chatPOST(istek('/api/chat', {}, { origin: 'http://localhost:5173', host: 'localhost:5173' }))
  assert.equal(c.status, 503)
})

test('missing GEMINI_API_KEY -> 503 on chat, classify, ortak-plan', async () => {
  delete process.env.GEMINI_API_KEY
  for (const [h, yol] of [[chatPOST, '/api/chat'], [classifyPOST, '/api/classify'], [ortakPOST, '/api/ortak-plan']] as const) {
    const res = await h(istek(yol, {}))
    assert.equal(res.status, 503, yol)
    assert.deepEqual(await json(res), { error: 'GEMINI_API_KEY tanımlı değil' })
    assert.match(res.headers.get('content-type') ?? '', /application\/json/)
  }
  process.env.GEMINI_API_KEY = '   '
  assert.equal((await chatPOST(istek('/api/chat', {}))).status, 503)
})

test('body limit: content-length over limit -> 413', async () => {
  const buyuk = JSON.stringify({ mesajlar: [{ rol: 'kullanici', metin: 'a'.repeat(200 * 1024) }] })
  const res = await chatPOST(istek('/api/chat', null, { ham: buyuk }))
  assert.equal(res.status, 413)
  assert.equal((await json(res)).error, 'İstek gövdesi çok büyük.')
})

test('body limit: chunked stream without content-length -> 413', async () => {
  const parca = new TextEncoder().encode('a'.repeat(64 * 1024))
  let n = 0
  const akis = new ReadableStream<Uint8Array>({
    pull(c) {
      if (n++ < 10) c.enqueue(parca)
      else c.close()
    },
  })
  const req = istek('/api/ortak-plan', null, { ham: akis })
  assert.equal(req.headers.get('content-length'), null)
  const res = await ortakPOST(req)
  assert.equal(res.status, 413)
  assert.ok(n < 10, `stream read stopped early (pulled ${n})`)
})

test('invalid JSON / non-object body -> 400', async () => {
  for (const ham of ['{nope', 'null', '[1,2]', '"x"']) {
    const res = await chatPOST(istek('/api/chat', null, { ham }))
    assert.equal(res.status, 400, ham)
    assert.equal((await json(res)).error, 'geçersiz JSON gövdesi')
  }
})

// ======================= chat =======================

test('chat: empty messages -> 400', async () => {
  const res = await chatPOST(istek('/api/chat', { mesajlar: [] }))
  assert.equal(res.status, 400)
  assert.equal((await json(res)).error, 'boş mesaj listesi')
})

test('chat: text + plan_oner function call, validated; request shape', async () => {
  process.env.GEMINI_MODEL = 'gemini-test-model'
  fetchIsleyici = (url, init) => {
    assert.equal(url.host, 'generativelanguage.googleapis.com')
    assert.equal(url.pathname, '/v1beta/models/gemini-test-model:generateContent')
    assert.equal((init!.headers as Record<string, string>)['x-goog-api-key'], 'test-key')
    const govde = JSON.parse(String(init?.body))
    assert.equal(govde.contents.length, 20) // last 20 only
    assert.equal(govde.contents[0].role, 'model')
    assert.equal(govde.contents.at(-1).role, 'user')
    assert.equal(govde.contents.at(-1).parts[0].text.length, 2000)
    assert.match(govde.systemInstruction.parts[0].text, /Bugünün tarihi: 2026-10-18/)
    assert.match(govde.systemInstruction.parts[0].text, /- \[•\] Kahve/)
    assert.equal(govde.tools[0].functionDeclarations[0].name, 'plan_oner')
    assert.equal(govde.toolConfig.functionCallingConfig.mode, 'AUTO')
    assert.equal(govde.generationConfig.maxOutputTokens, 500)
    return geminiParcalar([
      { text: '  İşte bir öneri!  ' },
      { functionCall: { name: 'plan_oner', args: { kategori: 'uydurma', baslik: ' Sinema ', tarih: '', saat: '20:00', konum: '', oncelik: 'x', sure: '130.4', ozet_not: '' } } },
    ])
  }
  const mesajlar = Array.from({ length: 25 }, (_, i) => ({ rol: i % 2 ? 'asistan' : 'kullanici', metin: i === 24 ? 'z'.repeat(3000) : `m${i}` }))
  const res = await chatPOST(istek('/api/chat', { mesajlar, planOzeti: '- [•] Kahve', bugun: '2026-10-18' }))
  assert.equal(res.status, 200)
  assert.deepEqual(await json(res), {
    yanit: 'İşte bir öneri!',
    planOnerisi: { kategori: 'not', baslik: 'Sinema', tarih: null, saat: '20:00', konum: null, oncelik: 'orta', sure: 130, ozetNot: null },
  })
})

test('chat: Gemini HTTP error -> 502 sohbet başarısız; no parts -> 502 yanıt üretilemedi', async () => {
  fetchIsleyici = () => new Response('quota', { status: 429 })
  let res = await chatPOST(istek('/api/chat', { mesajlar: [{ rol: 'kullanici', metin: 'selam' }] }))
  assert.equal(res.status, 502)
  assert.equal((await json(res)).error, 'sohbet başarısız')

  fetchIsleyici = () => geminiParcalar([{ text: '   ' }])
  res = await chatPOST(istek('/api/chat', { mesajlar: [{ rol: 'kullanici', metin: 'selam' }] }))
  assert.equal(res.status, 502)
  assert.equal((await json(res)).error, 'yanıt üretilemedi')

  fetchIsleyici = () => new Response('not json', { status: 200 })
  res = await chatPOST(istek('/api/chat', { mesajlar: [{ rol: 'kullanici', metin: 'selam' }] }))
  assert.equal(res.status, 502)
})

test('chat: malformed message entries do not crash', async () => {
  fetchIsleyici = (_u, init) => {
    const govde = JSON.parse(String(init?.body))
    assert.equal(govde.contents.length, 1)
    return geminiMetin('ok')
  }
  const res = await chatPOST(istek('/api/chat', { mesajlar: [null, 5, { rol: 'kullanici', metin: 'x' }], bugun: 'bozuk' }))
  assert.equal(res.status, 200)
  assert.deepEqual(await json(res), { yanit: 'ok', planOnerisi: null })
})

test('gemini: call times out -> null', async () => {
  fetchIsleyici = (_u, init) =>
    new Promise((_, reddet) => init?.signal?.addEventListener('abort', () => reddet(init.signal!.reason)))
  const eskiHata = console.error
  console.error = () => {}
  const t0 = Date.now()
  // AbortSignal.timeout timers are unref'd; keep the loop alive like a server would.
  const canli = setInterval(() => {}, 1000)
  const sonuc = await gemini.geminiCagir('k', {}, { etiket: 'test', zamanAsimiMs: 50 })
  clearInterval(canli)
  console.error = eskiHata
  assert.equal(sonuc, null)
  assert.ok(Date.now() - t0 < 2000)
})

// ======================= classify =======================

const KAYIT = { kategori: 'etkinlik', baslik: 'Konser', tarih: '2026-10-20', saat: '21:00', konum: '', oncelik: 'yuksek', sure: '180', ozet_not: '' }

test('classify: text only', async () => {
  fetchIsleyici = (url, init) => {
    assert.equal(url.host, 'generativelanguage.googleapis.com')
    const govde = JSON.parse(String(init?.body))
    assert.equal(govde.contents[0].parts[0].text, 'Başlık: B\nMetin: M')
    assert.equal(govde.generationConfig.response_mime_type, 'application/json')
    assert.ok(govde.generationConfig.response_schema.required.includes('ozet_not'))
    assert.match(govde.systemInstruction.parts[0].text, /varsayılabilir\): 2026-10-18$/)
    return geminiMetin(JSON.stringify(KAYIT))
  }
  const res = await classifyPOST(istek('/api/classify', { hamBaslik: 'B', hamMetin: 'M', bugun: '2026-10-18' }))
  assert.equal(res.status, 200)
  assert.deepEqual(await json(res), {
    kategori: 'etkinlik', baslik: 'Konser', tarih: '2026-10-20', saat: '21:00', konum: null, oncelik: 'yuksek', sure: 180, ozetNot: null, mekanOnerisi: null, yakinOneriler: null,
  })
})

test('classify: empty -> 400 boş girdi', async () => {
  const res = await classifyPOST(istek('/api/classify', { hamBaslik: '', gorselBase64: '' }))
  assert.equal(res.status, 400)
  assert.equal((await json(res)).error, 'boş girdi')
})

test('classify: image only, 3 MB body accepted; 5 MB -> 413', async () => {
  fetchIsleyici = (_u, init) => {
    const govde = JSON.parse(String(init?.body))
    assert.equal(govde.contents[0].parts[0].inlineData.mimeType, 'image/png')
    return geminiMetin(JSON.stringify({ ...KAYIT, kategori: 'bozuk', oncelik: 'acil' }))
  }
  let res = await classifyPOST(istek('/api/classify', { gorselBase64: 'A'.repeat(3 * 1024 * 1024), gorselMime: 'image/png' }))
  assert.equal(res.status, 200)
  const veri = await json(res)
  assert.equal(veri.kategori, 'not')
  assert.equal(veri.oncelik, 'orta')
  res = await classifyPOST(istek('/api/classify', { gorselBase64: 'A'.repeat(5 * 1024 * 1024) }))
  assert.equal(res.status, 413)
})

test('classify: link to private IP is never fetched, classification still works', async () => {
  const eskiUyari = console.warn
  console.warn = () => {}
  for (const hamLink of ['http://127.0.0.1/admin', 'http://169.254.169.254/latest/meta-data/', 'http://evil.example/', 'http://instagram.com.evil.example/', 'http://[::1]/']) {
    fetchCagrilari.length = 0
    fetchIsleyici = (url) => {
      assert.equal(url.host, 'generativelanguage.googleapis.com', `fetched ${url}`)
      return geminiMetin(JSON.stringify({ ...KAYIT, kategori: 'not' }))
    }
    const res = await classifyPOST(istek('/api/classify', { hamLink }))
    assert.equal(res.status, 200, hamLink)
    assert.equal(fetchCagrilari.length, 1, hamLink)
  }
  console.warn = eskiUyari
})

test('classify: generic unfurl via safe fetch, redirect followed, og tags in prompt', async () => {
  fetchIsleyici = (url, init) => {
    if (url.host === 'public.example' && url.pathname === '/r') {
      assert.equal(init?.redirect, 'manual')
      return new Response(null, { status: 301, headers: { location: '/sayfa' } })
    }
    if (url.host === 'public.example' && url.pathname === '/sayfa') {
      return new Response('<html><head><title>T</title><meta property="og:title" content="Kafe &amp; Bar"><meta name="description" content="Moda&#39;da"></head>' + 'x'.repeat(3 * 1024 * 1024), { headers: { 'content-type': 'text/html' } })
    }
    const govde = JSON.parse(String(init?.body))
    assert.match(govde.contents[0].parts[0].text, /Linkten çekilen içerik: Kafe & Bar — Moda'da/)
    return geminiMetin(JSON.stringify(KAYIT))
  }
  const res = await classifyPOST(istek('/api/classify', { hamLink: 'https://public.example/r' }))
  assert.equal(res.status, 200)
  assert.equal(fetchCagrilari.length, 3)
})

test('classify: tiktok oembed + instagram og:description', async () => {
  fetchIsleyici = (url, init) => {
    if (url.host === 'www.tiktok.com') {
      assert.equal(url.pathname, '/oembed')
      return Response.json({ title: 'Lahmacun tarifi', author_name: 'sef' })
    }
    const govde = JSON.parse(String(init?.body))
    assert.match(govde.contents[0].parts[0].text, /Linkten çekilen içerik: Lahmacun tarifi \(@sef\)/)
    return geminiMetin(JSON.stringify(KAYIT))
  }
  let res = await classifyPOST(istek('/api/classify', { hamLink: 'https://www.tiktok.com/@sef/video/1' }))
  assert.equal(res.status, 200)

  fetchIsleyici = (url, init) => {
    if (url.host === 'www.instagram.com') return new Response('<meta property="og:description" content="Harika &quot;mekan&quot;">')
    const govde = JSON.parse(String(init?.body))
    assert.match(govde.contents[0].parts[0].text, /Linkten çekilen içerik: Harika "mekan"/)
    return geminiMetin(JSON.stringify(KAYIT))
  }
  res = await classifyPOST(istek('/api/classify', { hamLink: 'https://www.instagram.com/p/abc/' }))
  assert.equal(res.status, 200)
})

test('classify: mekan with konum -> mekanOnerisi; without konum + coords -> Foursquare', async () => {
  let geminiSayisi = 0
  fetchIsleyici = (url, init) => {
    geminiSayisi++
    const govde = JSON.parse(String(init?.body))
    if (govde.systemInstruction) return geminiMetin(JSON.stringify({ ...KAYIT, kategori: 'mekan', konum: 'Kronotrop' }))
    assert.match(govde.contents[0].parts[0].text, /^"Kronotrop" hakkında/)
    assert.equal(govde.generationConfig.maxOutputTokens, 150)
    return geminiMetin(' Kahvesi övülür. ')
  }
  let res = await classifyPOST(istek('/api/classify', { hamMetin: 'Kronotrop kahve' }))
  let veri = await json(res)
  assert.equal(veri.mekanOnerisi, 'Kahvesi övülür.')
  assert.equal(veri.yakinOneriler, null)
  assert.equal(geminiSayisi, 2)

  process.env.FOURSQUARE_API_KEY = 'fsq'
  fetchIsleyici = (url, init) => {
    if (url.host === 'places-api.foursquare.com') {
      assert.equal(url.searchParams.get('ll'), '41,29')
      assert.equal(url.searchParams.get('query'), 'akşam yemeği')
      assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer fsq')
      return Response.json({ results: [
        { name: 'Uzak', location: { formatted_address: 'A' }, distance: 900 },
        { name: '', distance: 1 },
        { name: 'Yakın', distance: 100 },
      ] })
    }
    return geminiMetin(JSON.stringify({ ...KAYIT, kategori: 'mekan', konum: '' }))
  }
  res = await classifyPOST(istek('/api/classify', { hamMetin: 'akşam yemeği', enlem: 41, boylam: 29 }))
  veri = await json(res)
  assert.deepEqual(veri.yakinOneriler, [
    { isim: 'Yakın', adres: null, puan: null, mesafeMetre: 100 },
    { isim: 'Uzak', adres: 'A', puan: null, mesafeMetre: 900 },
  ])
  // Strings for coords are ignored rather than forwarded.
  fetchCagrilari.length = 0
  res = await classifyPOST(istek('/api/classify', { hamMetin: 'akşam yemeği', enlem: '41', boylam: 29 }))
  assert.equal((await json(res)).yakinOneriler, null)
  assert.equal(fetchCagrilari.length, 1)
})

test('classify: unparseable model output -> 502', async () => {
  const eski = console.error
  console.error = () => {}
  fetchIsleyici = () => geminiMetin('{bozuk')
  let res = await classifyPOST(istek('/api/classify', { hamMetin: 'x' }))
  assert.equal(res.status, 502)
  assert.equal((await json(res)).error, 'geçersiz model çıktısı')
  fetchIsleyici = () => geminiParcalar([])
  res = await classifyPOST(istek('/api/classify', { hamMetin: 'x' }))
  assert.equal((await json(res)).error, 'yapılandırılmış çıktı yok')
  fetchIsleyici = () => new Response('err', { status: 500 })
  res = await classifyPOST(istek('/api/classify', { hamMetin: 'x' }))
  assert.equal((await json(res)).error, 'sınıflandırma başarısız')
  console.error = eski
})

// ======================= ortak-plan =======================

const KATILIMCILAR = [
  { ad: 'Ben', paylasiyor: true, bloklar: [{ tarih: '2026-10-20', baslangic: '09:00', bitis: '18:00' }] },
  { ad: 'Ayşe', paylasiyor: true, bloklar: [{ tarih: '2026-10-20', baslangic: '17:00', bitis: '20:00' }] },
  { ad: 'Can', paylasiyor: false, bloklar: [] },
]

test('ortak-plan: validation errors', async () => {
  let res = await ortakPOST(istek('/api/ortak-plan', { istek: '  ', katilimcilar: KATILIMCILAR, gunler: ['2026-10-20'] }))
  assert.equal(res.status, 400)
  assert.equal((await json(res)).error, 'Ne yapmak istediğini yaz.')
  res = await ortakPOST(istek('/api/ortak-plan', { istek: 'kahve', katilimcilar: [], gunler: ['2026-10-20'] }))
  assert.equal((await json(res)).error, 'Katılımcı ve tarih aralığı gerekli.')
})

test('ortak-plan: no free slot -> message without model call', async () => {
  const res = await ortakPOST(istek('/api/ortak-plan', {
    istek: 'kahve',
    katilimcilar: [{ ad: 'A', paylasiyor: true, bloklar: [{ tarih: '2026-10-20', baslangic: '00:00', bitis: '23:59' }] }],
    gunler: ['2026-10-20'],
  }))
  assert.equal(res.status, 200)
  const veri = await json(res)
  assert.equal(veri.plan, null)
  assert.deepEqual(veri.bosluklar, [])
  assert.match(veri.mesaj, /herkesin birden boş/)
  assert.equal(fetchCagrilari.length, 0)
})

test('ortak-plan: options validated against free slots', async () => {
  fetchIsleyici = (_u, init) => {
    const govde = JSON.parse(String(init?.body))
    const sistem = govde.systemInstruction.parts[0].text
    assert.match(sistem, /Katılımcılar: Ben, Ayşe, Can/)
    assert.match(sistem, /Not: Can takvimini paylaşmıyor/)
    assert.match(sistem, /- 2026-10-20 20:00–23:00/)
    assert.match(sistem, /- 2026-10-21 09:00–23:00/)
    assert.equal(govde.toolConfig.functionCallingConfig.mode, 'ANY')
    return geminiParcalar([{ functionCall: { name: 'ortak_plan_oner', args: { secenekler: [
      { baslik: 'Sinema', tarih: '2026-10-20', saat: '21:30', sure: '240', konum: '', gerekce: 'Akşam.' }, // clipped to 90
      { baslik: 'Kahve', tarih: '2026-10-20', saat: '18:30', sure: '60', konum: '', gerekce: '' }, // busy -> dropped
      { baslik: 'Kahvaltı', tarih: '2026-10-21', saat: '10:00', sure: 'x', konum: 'Moda', gerekce: 'Sabah.' },
      { baslik: 'Dördüncü', tarih: '2026-10-21', saat: '12:00', sure: '60' }, // beyond 3 -> ignored
    ] } } }])
  }
  const res = await ortakPOST(istek('/api/ortak-plan', { istek: 'bir şeyler yapalım', katilimcilar: KATILIMCILAR, gunler: ['2026-10-20', '2026-10-21'], simdiTarih: '2026-10-19', simdiSaat: '10:00' }))
  assert.equal(res.status, 200)
  const veri = await json(res)
  assert.deepEqual(veri.secenekler, [
    { baslik: 'Sinema', tarih: '2026-10-20', saat: '21:30', sure: 90, konum: null, gerekce: 'Akşam.' },
    { baslik: 'Kahvaltı', tarih: '2026-10-21', saat: '10:00', sure: 60, konum: 'Moda', gerekce: 'Sabah.' },
  ])
  assert.deepEqual(veri.plan, veri.secenekler[0])
  assert.deepEqual(veri.bosluklar, [
    { tarih: '2026-10-20', baslangic: '20:00', bitis: '23:00' },
    { tarih: '2026-10-21', baslangic: '09:00', bitis: '23:00' },
  ])
})

test('ortak-plan: all invalid -> first-slot fallback; Gemini failure -> 502', async () => {
  fetchIsleyici = () => geminiParcalar([{ text: 'no call' }])
  let res = await ortakPOST(istek('/api/ortak-plan', { istek: 'kahve içelim', katilimcilar: KATILIMCILAR, gunler: ['2026-10-20'], enAzDakika: 90 }))
  const veri = await json(res)
  const yedek = { baslik: 'kahve içelim', tarih: '2026-10-20', saat: '20:00', sure: 90, konum: null, gerekce: 'Herkesin boş olduğu en yakın aralık.' }
  assert.deepEqual(veri, { plan: yedek, secenekler: [yedek], bosluklar: [{ tarih: '2026-10-20', baslangic: '20:00', bitis: '23:00' }] })

  const eski = console.error
  console.error = () => {}
  fetchIsleyici = () => new Response('x', { status: 503 })
  res = await ortakPOST(istek('/api/ortak-plan', { istek: 'kahve', katilimcilar: KATILIMCILAR, gunler: ['2026-10-20'] }))
  console.error = eski
  assert.equal(res.status, 502)
  assert.equal((await json(res)).error, 'Öneri üretilemedi.')
})

test('ortak-plan: malformed participants/blocks do not crash', async () => {
  fetchIsleyici = () => geminiParcalar([])
  const res = await ortakPOST(istek('/api/ortak-plan', {
    istek: 'kahve',
    katilimcilar: [null, { ad: 'A', bloklar: 'x' }, { ad: 'B', bloklar: [null, { tarih: 1 }, { tarih: '2026-10-20', baslangic: '10:00', bitis: '22:00' }] }],
    gunler: ['2026-10-20', 5],
    enErken: 7,
  }))
  assert.equal(res.status, 200)
  const veri = await json(res)
  assert.deepEqual(veri.bosluklar, [
    { tarih: '2026-10-20', baslangic: '09:00', bitis: '10:00' },
    { tarih: '2026-10-20', baslangic: '22:00', bitis: '23:00' },
  ])
})

// ======================= takvim (ICS proxy + SSRF) =======================

const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n'

test('takvim: private / local targets rejected before any fetch', async () => {
  const adresler = [
    'http://127.0.0.1/x.ics', 'http://[::1]/x.ics', 'http://10.0.0.1/x.ics', 'http://169.254.169.254/latest/meta-data/',
    'http://[::ffff:127.0.0.1]/', 'http://[::ffff:169.254.169.254]/', 'http://[fc00::1]/', 'http://[fd00::1]/', 'http://[fe80::1]/',
    'http://0x7f.1/', 'http://2130706433/', 'http://0.0.0.0/', 'http://100.64.0.1/', 'http://192.168.1.1/', 'http://172.16.5.5/',
    'http://224.0.0.1/', 'http://localhost/', 'http://LOCALHOST./', 'http://foo.internal/', 'http://printer.local/',
    'http://evil.example/', 'http://mixed.example/', 'http://v6evil.example/', 'http://mapped.example/',
    'http://public.example:8080/', 'https://public.example:22/', 'ftp://public.example/', 'file:///etc/passwd', 'javascript:alert(1)', 'nonsense', '',
  ]
  for (const url of adresler) {
    const res = await takvimPOST(istek('/api/takvim', { url }))
    assert.equal(res.status, 400, url)
    assert.equal((await json(res)).error, 'Geçersiz takvim adresi.', url)
  }
  assert.equal(fetchCagrilari.length, 0)
})

test('takvim: happy path, webcal://, fdx.com hostname allowed', async () => {
  fetchIsleyici = (url, init) => {
    if (url.host === 'calendar.example') assert.equal(url.protocol, 'https:') // webcal -> https
    assert.equal(init?.redirect, 'manual')
    assert.match((init!.headers as Record<string, string>).Accept, /text\/calendar/)
    return new Response(ICS)
  }
  let res = await takvimPOST(istek('/api/takvim', { url: ' webcal://calendar.example/basic.ics ' }))
  assert.equal(res.status, 200)
  assert.deepEqual(await json(res), { ics: ICS })
  res = await takvimPOST(istek('/api/takvim', { url: 'https://fdx.com/cal.ics' }))
  assert.equal(res.status, 200)
  res = await takvimPOST(istek('/api/takvim', { url: 'http://public.example:443/cal.ics' }))
  assert.equal(res.status, 200)
})

test('takvim: redirect to private IP / private-resolving host blocked; each hop validated', async () => {
  for (const hedef of ['http://127.0.0.1/', 'http://169.254.169.254/latest', 'http://evil.example/cal.ics', 'gopher://public.example/']) {
    fetchCagrilari.length = 0
    fetchIsleyici = (url) => {
      assert.equal(url.host, 'public.example', `must not fetch ${url}`)
      return new Response(null, { status: 302, headers: { location: hedef } })
    }
    const res = await takvimPOST(istek('/api/takvim', { url: 'https://public.example/cal.ics' }))
    assert.equal(res.status, 400, hedef)
    assert.equal(fetchCagrilari.length, 1)
  }
})

test('takvim: redirect chain followed up to 5 hops, 6th -> 502', async () => {
  let n = 0
  fetchIsleyici = () => (++n <= 5 ? new Response(null, { status: 307, headers: { location: `/hop${n}` } }) : new Response(ICS))
  let res = await takvimPOST(istek('/api/takvim', { url: 'https://public.example/cal.ics' }))
  assert.equal(res.status, 200)
  assert.equal(fetchCagrilari.at(-1)?.url.pathname, '/hop5')

  fetchCagrilari.length = 0
  fetchIsleyici = () => new Response(null, { status: 302, headers: { location: '/loop' } })
  res = await takvimPOST(istek('/api/takvim', { url: 'https://public.example/cal.ics' }))
  assert.equal(res.status, 502)
  assert.equal((await json(res)).error, 'Takvim adresine ulaşılamadı.')
  assert.equal(fetchCagrilari.length, 6)
})

test('takvim: upstream errors, size limits, non-calendar', async () => {
  fetchIsleyici = () => new Response('nope', { status: 404 })
  let res = await takvimPOST(istek('/api/takvim', { url: 'https://public.example/cal.ics' }))
  assert.equal(res.status, 502)
  assert.equal((await json(res)).error, 'Takvim alınamadı (HTTP 404).')

  fetchIsleyici = () => new Response('<html>hi</html>')
  res = await takvimPOST(istek('/api/takvim', { url: 'https://public.example/cal.ics' }))
  assert.equal(res.status, 422)
  assert.equal((await json(res)).error, 'Bu adres bir takvim (.ics) dosyası değil.')

  fetchIsleyici = () => new Response('x', { headers: { 'content-length': String(6 * 1024 * 1024) } })
  res = await takvimPOST(istek('/api/takvim', { url: 'https://public.example/cal.ics' }))
  assert.equal(res.status, 413)

  let gonderilen = 0
  fetchIsleyici = () => new Response(new ReadableStream<Uint8Array>({
    pull(c) {
      gonderilen++
      c.enqueue(new Uint8Array(1024 * 1024).fill(65))
      if (gonderilen > 50) c.close()
    },
  }))
  res = await takvimPOST(istek('/api/takvim', { url: 'https://public.example/cal.ics' }))
  assert.equal(res.status, 413)
  assert.equal((await json(res)).error, 'Takvim dosyası çok büyük.')
  assert.ok(gonderilen < 10, `stopped reading early (${gonderilen} MB pulled)`)

  fetchIsleyici = () => {
    throw new TypeError('fetch failed')
  }
  res = await takvimPOST(istek('/api/takvim', { url: 'https://public.example/cal.ics' }))
  assert.equal(res.status, 502)

  res = await takvimPOST(istek('/api/takvim', { url: 'https://nxdomain.example/cal.ics' }))
  assert.equal(res.status, 502)
  assert.equal((await json(res)).error, 'Takvim adresine ulaşılamadı.')
})

test('takvim: secret URL never appears in responses or logs', async () => {
  const loglar: string[] = []
  const eski = [console.error, console.warn, console.log]
  console.error = console.warn = console.log = (...a: unknown[]) => loglar.push(a.map(String).join(' '))
  fetchIsleyici = () => new Response('x', { status: 500 })
  const res = await takvimPOST(istek('/api/takvim', { url: 'https://public.example/private/SECRET123/basic.ics' }))
  ;[console.error, console.warn, console.log] = eski
  assert.ok(!(await res.text()).includes('SECRET123'))
  assert.ok(!loglar.join('\n').includes('SECRET123'))
})

test('takvim: origin check applies', async () => {
  const res = await takvimPOST(istek('/api/takvim', { url: 'https://public.example/x.ics' }, { origin: 'https://evil.com' }))
  assert.equal(res.status, 403)
  assert.equal(fetchCagrilari.length, 0)
})

// ======================= ipOzelMi unit =======================

test('ipOzelMi', () => {
  const ozel = ['127.0.0.1', '127.255.255.254', '10.1.2.3', '0.0.0.0', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.0.1',
    '100.64.0.1', '100.127.255.255', '224.0.0.1', '255.255.255.255', '192.0.0.8', '198.18.0.1',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:10.0.0.1', '::127.0.0.1', 'fc00::1', 'fdff:ffff::1',
    'fe80::1', 'fe80::1%eth0', 'febf::1', 'fec0::1', 'ff02::1', '64:ff9b::7f00:1', '64:ff9b:1::1', '2001:db8::1', '2001:0:4136:e378::1',
    '2002:7f00:1::1', '2002:c0a8:101::1', '100::1', '::ffff:0:7f00:1', 'not-an-ip', 'fdx.com', '1.2.3']
  const genel = ['8.8.8.8', '93.184.216.34', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '169.253.1.1', '223.255.255.255',
    '2606:4700:4700::1111', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8', '::ffff:808:808', '64:ff9b::808:808', '2002:808:808::1', 'fb00::1', 'fe00::1']
  for (const ip of ozel) assert.equal(guvenli.ipOzelMi(ip), true, `${ip} should be private`)
  for (const ip of genel) assert.equal(guvenli.ipOzelMi(ip), false, `${ip} should be public`)
})

// ======================= shared/bosluklar =======================

test('bosluklar: helpers', () => {
  assert.equal(bos.dakikaya('09:30'), 570)
  assert.equal(bos.dakikaya('bozuk'), 0)
  assert.equal(bos.saate(570), '09:30')
  assert.equal(bos.saate(1440), '24:00')
  assert.deepEqual(bos.saatliAralik({ tarih: 'd', baslangic: 545, bitis: 1380 }), { tarih: 'd', baslangic: '09:05', bitis: '23:00' })
  assert.equal(bos.enAzDakikaSinirla(undefined), 60)
  assert.equal(bos.enAzDakikaSinirla(0), 60)
  assert.equal(bos.enAzDakikaSinirla(5), 15)
  assert.equal(bos.enAzDakikaSinirla(1000), 480)
  assert.equal(bos.enAzDakikaSinirla('90'), 90)
  assert.equal(bos.HAZIRLIK_DK, 30)
  assert.equal(bos.VARSAYILAN_ERKEN, '09:00')
  assert.equal(bos.VARSAYILAN_GEC, '23:00')
  assert.equal(bos.VARSAYILAN_EN_AZ, 60)
})

test('bosluklar: gunBosluklari merges overlaps, honours window and minimum', () => {
  const D = '2026-10-20'
  const k = [
    { bloklar: [{ tarih: D, baslangic: '10:00', bitis: '12:00' }, { tarih: D, baslangic: '18:00', bitis: '19:00' }, { tarih: '2026-10-21', baslangic: '00:00', bitis: '23:59' }] },
    { bloklar: [{ tarih: D, baslangic: '11:00', bitis: '13:00' }, { tarih: D, baslangic: '15:00', bitis: '14:00' }] },
  ]
  const s = (a: { tarih: string; baslangic: number; bitis: number }[]) => a.map(bos.saatliAralik).map((x) => `${x.baslangic}-${x.bitis}`)
  assert.deepEqual(s(bos.gunBosluklari(D, k, 540, 1380, 60)), ['09:00-10:00', '13:00-18:00', '19:00-23:00'])
  assert.deepEqual(s(bos.gunBosluklari(D, k, 540, 1380, 90)), ['13:00-18:00', '19:00-23:00'])
  assert.deepEqual(s(bos.gunBosluklari(D, [], 540, 1380, 60)), ['09:00-23:00'])
  // block starting before the window and one running past its end
  assert.deepEqual(s(bos.gunBosluklari(D, [{ bloklar: [{ tarih: D, baslangic: '07:00', bitis: '09:30' }, { tarih: D, baslangic: '22:30', bitis: '23:59' }] }], 540, 1380, 60)), ['09:30-22:30'])
  // short tail gap dropped
  assert.deepEqual(s(bos.gunBosluklari(D, [{ bloklar: [{ tarih: D, baslangic: '09:00', bitis: '22:30' }] }], 540, 1380, 60)), [])
})

test('bosluklar: bosluklariHesapla handles today, defaults and custom window', () => {
  const k = [{ bloklar: [] }]
  const s = (a: { tarih: string; baslangic: number; bitis: number }[]) => a.map(bos.saatliAralik).map((x) => `${x.tarih} ${x.baslangic}-${x.bitis}`)
  assert.deepEqual(s(bos.bosluklariHesapla({ gunler: ['2026-10-18', '2026-10-19'], katilimcilar: k, simdiTarih: '2026-10-18', simdiSaat: '20:10' })), ['2026-10-18 20:40-23:00', '2026-10-19 09:00-23:00'])
  assert.deepEqual(s(bos.bosluklariHesapla({ gunler: ['2026-10-18'], katilimcilar: k, simdiTarih: '2026-10-18', simdiSaat: '22:45' })), [])
  assert.deepEqual(s(bos.bosluklariHesapla({ gunler: ['2026-10-18'], katilimcilar: k, simdiTarih: '2026-10-18', simdiSaat: 'bozuk' })), ['2026-10-18 09:00-23:00'])
  assert.deepEqual(s(bos.bosluklariHesapla({ gunler: ['2026-10-18'], katilimcilar: k, enErken: '18:00', enGec: '21:00', enAzDakika: 240 })), [])
  assert.deepEqual(s(bos.bosluklariHesapla({ gunler: ['2026-10-18'], katilimcilar: k, enErken: '18:00', enGec: '21:00', enAzDakika: 180 })), ['2026-10-18 18:00-21:00'])
  // today, 08:00 local: preparation time does not push before the window start
  assert.deepEqual(s(bos.bosluklariHesapla({ gunler: ['2026-10-18'], katilimcilar: k, simdiTarih: '2026-10-18', simdiSaat: '08:00' })), ['2026-10-18 09:00-23:00'])
})
