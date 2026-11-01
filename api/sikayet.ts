// Content reports (App Store and Google Play require a way to report
// objectionable content). There is no database: each report is mailed to
// the moderators, who answer within 24 hours.
//
//   POST Sikayet (shared/sikayet.ts) → { ok: true }
//
// Settings: SIKAYET_ADRESI (where reports go; defaults to GMAIL_ADRESI)
// plus the Gmail settings in _lib/postaci.ts.

import { SIKAYET_NEDENLERI, SIKAYET_SINIRLARI, type SikayetNedeni } from '../shared/sikayet.js'
import { UYGULAMA_ADI } from '../shared/marka.js'
import { jsonGovdeOku, kaynakReddi, metinAl, yanit } from './_lib/http.js'
import { postaAyarliMi, postaci } from './_lib/postaci.js'

export const config = { maxDuration: 20 }

const AZAMI_ISTEK = 8 * 1024
const HEDEF_TURLERI = new Set(['kisi', 'mesaj', 'ani'])
const ACIK_ANAHTAR = /^[0-9a-f]{64}$/

// A few reports per address per window is plenty for a person; this only
// slows down someone flooding the moderators' inbox. Per instance, best
// effort.
const PENCERE_MS = 10 * 60_000
const PENCERE_BASINA = 5
const sayaclar = new Map<string, { sayi: number; bitis: number }>()

export function sikayetSayaclariniSifirla(): void {
  sayaclar.clear()
}

function sinirAsildiMi(anahtar: string): boolean {
  const simdi = Date.now()
  const sayac = sayaclar.get(anahtar)
  if (!sayac || sayac.bitis < simdi) {
    sayaclar.set(anahtar, { sayi: 1, bitis: simdi + PENCERE_MS })
    return false
  }
  sayac.sayi++
  return sayac.sayi > PENCERE_BASINA
}

function kisalt(deger: unknown, azami: number): string {
  return metinAl(deger).trim().slice(0, azami)
}

function htmlKacir(metin: string): string {
  return metin.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function alici(): string | null {
  return process.env.SIKAYET_ADRESI?.trim() || process.env.GMAIL_ADRESI?.trim() || null
}

export async function POST(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red
  const adres = alici()
  if (!adres || !postaAyarliMi()) return yanit({ error: 'Şikâyet bildirimi şu an kullanılamıyor.' }, 503)

  const govde = await jsonGovdeOku(request, AZAMI_ISTEK)
  if (!govde.ok) return govde.yanit
  const { girdi } = govde

  const neden = metinAl(girdi.neden) as SikayetNedeni
  const hedef = (typeof girdi.hedef === 'object' && girdi.hedef !== null ? girdi.hedef : {}) as Record<string, unknown>
  const bildiren = (typeof girdi.bildiren === 'object' && girdi.bildiren !== null ? girdi.bildiren : {}) as Record<
    string,
    unknown
  >
  const kisiId = metinAl(hedef.kisiId)
  const bildirenId = metinAl(bildiren.id)
  if (!(neden in SIKAYET_NEDENLERI) || !HEDEF_TURLERI.has(metinAl(hedef.tur)) || !ACIK_ANAHTAR.test(kisiId) || !ACIK_ANAHTAR.test(bildirenId)) {
    return yanit({ error: 'Eksik veya geçersiz şikâyet.' }, 400)
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'bilinmiyor'
  if (sinirAsildiMi(`ip:${ip}`) || sinirAsildiMi(`kisi:${bildirenId}`)) {
    return yanit({ error: 'Çok fazla şikâyet gönderdin. Biraz sonra tekrar dene.' }, 429)
  }

  const satirlar: Array<[string, string]> = [
    ['Sebep', SIKAYET_NEDENLERI[neden]],
    ['Tür', metinAl(hedef.tur)],
    ['Şikâyet edilen', `${kisalt(hedef.ad, SIKAYET_SINIRLARI.ad) || '-'} (@${kisalt(hedef.kullaniciAdi, 40) || '-'})`],
    ['Şikâyet edilen hesap', kisiId],
    ['İçerik kimliği', kisalt(hedef.icerikId, 120) || '-'],
    ['İçerik', kisalt(hedef.metin, SIKAYET_SINIRLARI.metin) || '-'],
    ['Açıklama', kisalt(girdi.aciklama, SIKAYET_SINIRLARI.aciklama) || '-'],
    ['Bildiren', `@${kisalt(bildiren.kullaniciAdi, 40) || '-'} (${bildirenId})`],
    ['Zaman', new Date().toISOString()],
  ]

  try {
    await postaci.gonder({
      alici: adres,
      konu: `[${UYGULAMA_ADI} şikâyet] ${SIKAYET_NEDENLERI[neden]}`,
      metin: `${satirlar.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n24 saat içinde inceleyin.`,
      html: `<table>${satirlar
        .map(([k, v]) => `<tr><th align="left" valign="top">${htmlKacir(k)}</th><td>${htmlKacir(v).replace(/\n/g, '<br>')}</td></tr>`)
        .join('')}</table><p>24 saat içinde inceleyin.</p>`,
    })
  } catch (err) {
    console.error('[sikayet] gönderilemedi:', err instanceof Error ? err.message : err)
    return yanit({ error: 'Şikâyet gönderilemedi. Biraz sonra tekrar dene.' }, 502)
  }
  return yanit({ ok: true })
}
