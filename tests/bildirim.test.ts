// Push notifications: the RFC 8291 encryption, the api/bildir relay and
// what the service worker agrees to show.
//
//   npm test

import assert from 'node:assert/strict'
import { createECDH, createPublicKey, verify } from 'node:crypto'
import { afterEach, test } from 'node:test'
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { webPushSifrele } from '../src/bildirim/webPush'
import { bildirimMetni } from '../src/bildirim/goster'
import { linkOzeti, type Bilinenler } from '../src/bildirim/bilinenler'
import { BILDIRIM_OLAY_TURU, gitGecerliMi, pushAdresiGecerliMi, type BildirimIcerigi } from '../shared/bildirim'
import { GET, OPTIONS, POST } from '../api/bildir'

const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'))

// ---------- encryption ----------

test('encryption matches the worked example in RFC 8291 (appendix A)', async () => {
  const asOzel = Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url')
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(asOzel)
  const asAcik = ecdh.getPublicKey()
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: asOzel.toString('base64url'),
      x: asAcik.subarray(1, 33).toString('base64url'),
      y: asAcik.subarray(33).toString('base64url'),
    },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  )
  const publicKey = await crypto.subtle.importKey('raw', asAcik, { name: 'ECDH', namedCurve: 'P-256' }, true, [])

  const govde = await webPushSifrele(
    new TextEncoder().encode('When I grow up, I want to be a watermelon'),
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    'BTBZMqHH6r4Tts7J_aSIgg',
    { gecici: { privateKey, publicKey }, tuz: b64('DGv6ra1nlYgDCS1FRnbzlw') },
  )
  assert.equal(
    Buffer.from(govde).toString('base64url'),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  )
  await assert.rejects(webPushSifrele(new Uint8Array(1), 'kisa', 'BTBZMqHH6r4Tts7J_aSIgg'), /Geçersiz/)
  await assert.rejects(
    webPushSifrele(new Uint8Array(4096), 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg'),
    /uzun/,
  )
})

test('only known push services are accepted as addresses', () => {
  assert.ok(pushAdresiGecerliMi('https://fcm.googleapis.com/fcm/send/abc'))
  assert.ok(pushAdresiGecerliMi('https://updates.push.services.mozilla.com/wpush/v2/abc'))
  assert.ok(pushAdresiGecerliMi('https://web.push.apple.com/QGx'))
  assert.ok(pushAdresiGecerliMi('https://wns2-par02p.notify.windows.com/w/?token=x'))
  assert.equal(pushAdresiGecerliMi('http://fcm.googleapis.com/fcm/send/abc'), false)
  assert.equal(pushAdresiGecerliMi('https://fcm.googleapis.com:8443/x'), false)
  assert.equal(pushAdresiGecerliMi('https://evil.example/fcm.googleapis.com'), false)
  assert.equal(pushAdresiGecerliMi('https://fcm.googleapis.com.evil.example/x'), false)
  assert.equal(pushAdresiGecerliMi('https://user:pw@fcm.googleapis.com/x'), false)
  assert.equal(pushAdresiGecerliMi('bozuk'), false)
})

// ---------- api/bildir ----------

const GIZLI = 'bildirim-testi-icin-yeterince-uzun-bir-gizli-deger-1234'
const gercekFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = gercekFetch
  delete process.env.BILDIRIM_GIZLI
  delete process.env.EPOSTA_GIZLI
})

function istek(govde: unknown, basliklar: Record<string, string> = {}) {
  return new Request('https://sharloop.vercel.app/api/bildir', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'sharloop.vercel.app', ...basliklar },
    body: JSON.stringify(govde),
  })
}

const GOVDE = Buffer.alloc(200, 7).toString('base64url')

test('api/bildir: the public key, or null until the server is set up', async () => {
  assert.equal(((await (await GET()).json()) as { anahtar: unknown }).anahtar, null)
  process.env.EPOSTA_GIZLI = GIZLI
  const { anahtar } = (await (await GET()).json()) as { anahtar: string }
  assert.equal(b64(anahtar).length, 65)
  // Stable, and its own secret wins when set.
  assert.equal(((await (await GET()).json()) as { anahtar: string }).anahtar, anahtar)
  process.env.BILDIRIM_GIZLI = `${GIZLI}-baska`
  assert.notEqual(((await (await GET()).json()) as { anahtar: string }).anahtar, anahtar)
  assert.equal((await POST(istek({ gonderimler: [] }))).status, 400)
})

test('api/bildir: forwards with a valid VAPID signature and reports gone subscriptions', async () => {
  assert.equal((await POST(istek({ gonderimler: [{ endpoint: 'https://fcm.googleapis.com/x', govde: GOVDE }] }))).status, 503)
  process.env.EPOSTA_GIZLI = GIZLI
  const { anahtar } = (await (await GET()).json()) as { anahtar: string }

  const giden: { url: string; init: RequestInit }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    giden.push({ url, init })
    return new Response(null, { status: url.includes('gitti') ? 410 : 201 })
  }) as typeof fetch

  const cevap = await POST(
    istek({
      gonderimler: [
        { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', govde: GOVDE, aciliyet: 'high' },
        { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gitti', govde: GOVDE },
      ],
    }),
  )
  assert.equal(cevap.status, 200)
  assert.deepEqual(await cevap.json(), { sonuclar: ['ok', 'gecersiz'] })
  assert.equal(giden.length, 2)

  const basliklar = giden[0].init.headers as Record<string, string>
  assert.equal(basliklar['Content-Encoding'], 'aes128gcm')
  assert.equal(basliklar.Urgency, 'high')
  assert.equal(basliklar.TTL, '86400')
  assert.deepEqual(new Uint8Array(giden[0].init.body as Uint8Array), b64(GOVDE))
  assert.equal(giden[0].init.redirect, 'manual')

  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(basliklar.Authorization)!
  assert.equal(k, anahtar)
  const [h, c, imza] = jwt.split('.')
  const iddialar = JSON.parse(Buffer.from(c, 'base64url').toString()) as { aud: string; sub: string; exp: number }
  assert.equal(iddialar.aud, 'https://fcm.googleapis.com')
  assert.equal(iddialar.sub, 'https://sharloop.vercel.app')
  assert.ok(iddialar.exp > Date.now() / 1000 && iddialar.exp <= Date.now() / 1000 + 24 * 3600)
  const acik = b64(anahtar)
  const anahtarNesnesi = createPublicKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: Buffer.from(acik.subarray(1, 33)).toString('base64url'),
      y: Buffer.from(acik.subarray(33)).toString('base64url'),
    },
    format: 'jwk',
  })
  assert.ok(
    verify('sha256', Buffer.from(`${h}.${c}`), { key: anahtarNesnesi, dsaEncoding: 'ieee-p1363' }, Buffer.from(imza, 'base64url')),
  )
})

test('api/bildir: refuses other hosts, odd bodies and other sites', async () => {
  process.env.EPOSTA_GIZLI = GIZLI
  let cagrildi = false
  globalThis.fetch = (async () => {
    cagrildi = true
    return new Response(null, { status: 201 })
  }) as unknown as typeof fetch

  const red = async (gonderim: unknown, basliklar?: Record<string, string>) =>
    (await POST(istek({ gonderimler: [gonderim] }, basliklar))).status
  assert.equal(await red({ endpoint: 'https://169.254.169.254/latest', govde: GOVDE }), 400)
  assert.equal(await red({ endpoint: 'https://fcm.googleapis.com/x', govde: 'kisa' }), 400)
  assert.equal(await red({ endpoint: 'https://fcm.googleapis.com/x', govde: Buffer.alloc(5000).toString('base64url') }), 400)
  assert.equal(await red({ endpoint: 'https://fcm.googleapis.com/x', govde: `${GOVDE}=` }), 400)
  assert.equal(
    (await POST(istek({ gonderimler: Array(26).fill({ endpoint: 'https://fcm.googleapis.com/x', govde: GOVDE }) }))).status,
    400,
  )
  assert.equal(await red({ endpoint: 'https://fcm.googleapis.com/x', govde: GOVDE }, { origin: 'https://evil.example' }), 403)
  assert.equal(cagrildi, false)
})

test('api/bildir: Davet may post from its own addresses, with CORS, for one person at a time', async () => {
  process.env.EPOSTA_GIZLI = GIZLI
  globalThis.fetch = (async () => new Response(null, { status: 201 })) as unknown as typeof fetch
  const davet = 'https://dolphing-mbilsem-yemiro.github.io'
  const onUcus = (origin: string) =>
    OPTIONS(
      new Request('https://sharloop.vercel.app/api/bildir', {
        method: 'OPTIONS',
        headers: { origin, host: 'sharloop.vercel.app', 'access-control-request-method': 'POST' },
      }),
    )

  const izin = await onUcus(davet)
  assert.equal(izin.status, 204)
  assert.equal(izin.headers.get('access-control-allow-origin'), davet)
  assert.match(izin.headers.get('access-control-allow-headers') ?? '', /content-type/i)
  assert.equal((await onUcus('https://evil.example')).status, 403)

  const gonderim = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', govde: GOVDE }
  const cevap = await POST(istek({ gonderimler: [gonderim] }, { origin: davet }))
  assert.equal(cevap.status, 200)
  assert.equal(cevap.headers.get('access-control-allow-origin'), davet)
  assert.deepEqual(await cevap.json(), { sonuclar: ['ok'] })

  // One host's devices at most; the refusal is readable there too.
  const cok = await POST(istek({ gonderimler: Array(11).fill(gonderim) }, { origin: 'https://davet-gules.vercel.app' }))
  assert.equal(cok.status, 400)
  assert.equal(cok.headers.get('access-control-allow-origin'), 'https://davet-gules.vercel.app')

  // The app itself: no CORS headers, and its own limit.
  const ayniSite = await POST(istek({ gonderimler: Array(11).fill(gonderim) }))
  assert.equal(ayniSite.status, 200)
  assert.equal(ayniSite.headers.get('access-control-allow-origin'), null)

  // Lookalikes of Davet's addresses are still other sites.
  for (const origin of ['https://dolphing-mbilsem-yemiro.github.io.evil.example', 'http://dolphing-mbilsem-yemiro.github.io', 'https://evil.github.io']) {
    assert.equal((await POST(istek({ gonderimler: [gonderim] }, { origin }))).status, 403, origin)
  }
})

// ---------- what the service worker shows ----------

function imzali(sk: Uint8Array, icerik: Partial<BildirimIcerigi>, kind = BILDIRIM_OLAY_TURU): string {
  const tam: BildirimIcerigi = { tur: 'mesaj', baslik: 'Ali', govde: 'Akşam geliyor musun?', git: '', etiket: 'x', ...icerik }
  return JSON.stringify(finalizeEvent({ kind, created_at: 1, tags: [], content: JSON.stringify(tam) }, sk))
}

test('the service worker shows text only from people it knows', async () => {
  const arkadas = generateSecretKey()
  const yabanci = generateSecretKey()
  const linkAnahtari = 'A'.repeat(43)
  const davetGizlisi = 'D'.repeat(22)
  const bilinenler: Bilinenler = {
    kisiler: new Set([getPublicKey(arkadas)]),
    linkler: new Set([await linkOzeti(linkAnahtari), await linkOzeti(davetGizlisi)]),
  }
  const dm = `dm:${getPublicKey(arkadas)}`

  // A friend: their own words, and the way into the chat.
  assert.deepEqual(await bildirimMetni(imzali(arkadas, { git: dm, etiket: dm }), bilinenler), {
    baslik: 'Ali',
    govde: 'Akşam geliyor musun?',
    git: dm,
    etiket: dm,
  })
  // A stranger: a fixed sentence, whatever they wrote.
  const sahte = await bildirimMetni(imzali(yabanci, { baslik: 'Banka', govde: 'Hesabın kapandı', etiket: dm }), bilinenler)
  assert.equal(sahte.govde, 'Yeni bir mesajın var.')
  // ...and can't take the place of the friend's notification.
  assert.equal(sahte.etiket, 'mesaj')
  const istek = await bildirimMetni(imzali(yabanci, { tur: 'istek', govde: 'Ben Ali' }), bilinenler)
  assert.equal(istek.baslik, 'Yeni arkadaşlık isteği')
  assert.equal(istek.git, 'arkadaslar')
  // A guest answering my plan link holds the link's key.
  const link = `link:${linkAnahtari}`
  const yanit = await bildirimMetni(imzali(yabanci, { tur: 'link', baslik: 'Zeynep geliyor', govde: 'Piknik', git: link }), bilinenler)
  assert.deepEqual([yanit.baslik, yanit.git], ['Zeynep geliyor', link])
  const baskaLink = await bildirimMetni(imzali(yabanci, { tur: 'link', baslik: 'Zeynep', git: `link:${'B'.repeat(43)}` }), bilinenler)
  assert.equal(baskaLink.govde, 'Planına yeni bir yanıt geldi.')
  // The same for a plan shared as a Davet invite.
  const davet = `davet:${davetGizlisi}`
  const davetYaniti = await bildirimMetni(imzali(yabanci, { tur: 'link', baslik: 'Ayşe geliyor', govde: 'Kahvaltı', git: davet }), bilinenler)
  assert.deepEqual([davetYaniti.baslik, davetYaniti.git], ['Ayşe geliyor', davet])
  const baskaDavet = await bildirimMetni(imzali(yabanci, { tur: 'link', baslik: 'Ayşe', git: `davet:${'E'.repeat(22)}` }), bilinenler)
  assert.equal(baskaDavet.govde, 'Planına yeni bir yanıt geldi.')

  // Forged, unreadable or foreign payloads.
  const olay = JSON.parse(imzali(arkadas, {})) as { content: string }
  olay.content = olay.content.replace('Akşam', 'Gece')
  assert.equal((await bildirimMetni(JSON.stringify(olay), bilinenler)).govde, 'Yeni bir bildirimin var.')
  assert.equal((await bildirimMetni('bozuk', bilinenler)).govde, 'Yeni bir bildirimin var.')
  assert.equal((await bildirimMetni(null, bilinenler)).govde, 'Yeni bir bildirimin var.')
  assert.equal((await bildirimMetni(imzali(arkadas, {}, 1), bilinenler)).govde, 'Yeni bir bildirimin var.')
  assert.equal((await bildirimMetni(imzali(arkadas, { tur: 'baska' as never }), bilinenler)).govde, 'Yeni bir bildirimin var.')
  // Somewhere outside the app is never followed.
  assert.equal((await bildirimMetni(imzali(arkadas, { git: 'https://evil.example' }), bilinenler)).git, '')
  assert.ok(gitGecerliMi('arkadaslar') && gitGecerliMi('grup:abc_DEF-1') && !gitGecerliMi('dm:xyz'))
  assert.ok(gitGecerliMi(davet) && !gitGecerliMi('davet:kisa'))
  assert.ok(gitGecerliMi(`plan:${crypto.randomUUID()}`) && !gitGecerliMi('plan:') && !gitGecerliMi('plan:a/b'))
})
