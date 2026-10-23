import { getPow } from 'nostr-tools/nip13'
import { finalizeEvent, getEventHash, type UnsignedEvent } from 'nostr-tools/pure'
import {
  ISTEK_TURU,
  ISTEK_ZORLUGU,
  epostaNormallestir,
  kodNormallestir,
  onayGecerliMi,
  type EpostaOnayi,
} from '../../shared/epostaOnayi'
import { profilGuncelle } from './api'
import { motor } from './cekirdek'
import { epostaImzacisi } from './epostaImzacisi'
import { kesfetSahibimiTazele } from './gruplar'

// The app side of email verification (see api/eposta.ts): asking for a
// code for my address and trading it for the server's attestation.
// Checking other people's attestations is in epostaImzacisi.ts.

export interface KodBileti {
  eposta: string
  bilet: string
  // When the code stops working (ms).
  son: number
}

// Mines the proof of work in slices, so the screen keeps animating.
async function isKanitiEkle(sablon: UnsignedEvent, zorluk: number): Promise<UnsignedEvent> {
  const olay = { ...sablon, tags: [...sablon.tags, ['nonce', '0', String(zorluk)]] }
  const nonce = olay.tags[olay.tags.length - 1]
  for (let sayac = 0; ; sayac++) {
    nonce[1] = String(sayac)
    if (getPow(getEventHash(olay)) >= zorluk) return olay
    if (sayac % 2000 === 1999) await new Promise((r) => setTimeout(r, 0))
  }
}

async function sunucuya(govde: unknown): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch('/api/eposta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new Error('Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.')
  }
  const veri = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(typeof veri.error === 'string' ? veri.error : `Sunucu hatası ${res.status}`)
  return veri
}

// Sends a code to `eposta`. The request is signed with this account's key,
// so the code only works for this account.
export async function kodIste(eposta: string): Promise<KodBileti> {
  const adres = epostaNormallestir(eposta)
  if (!adres) throw new Error('Geçerli bir e-posta adresi yaz.')
  const m = motor()
  const sablon: UnsignedEvent = {
    kind: ISTEK_TURU,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: adres,
    pubkey: m.benimId,
  }
  const istek = finalizeEvent(await isKanitiEkle(sablon, ISTEK_ZORLUGU), m.gizliAnahtar())
  const veri = await sunucuya({ islem: 'kod', istek })
  if (typeof veri.bilet !== 'string' || typeof veri.son !== 'number') throw new Error('Sunucu beklenmeyen bir yanıt verdi.')
  return { eposta: adres, bilet: veri.bilet, son: veri.son }
}

// Trades the code from the mail for the attestation.
export async function koduDogrula(bilet: KodBileti, kod: string): Promise<EpostaOnayi> {
  const temiz = kodNormallestir(kod)
  if (!temiz) throw new Error('E-postadaki kodu yaz.')
  const m = motor()
  const veri = await sunucuya({ islem: 'dogrula', pk: m.benimId, eposta: bilet.eposta, kod: temiz, bilet: bilet.bilet })
  const anahtar = await epostaImzacisi()
  if (!anahtar || !onayGecerliMi(veri.onay, m.benimId, anahtar)) throw new Error('Sunucu beklenmeyen bir yanıt verdi.')
  return veri.onay
}

// Saves a verified address on an existing account. The attestation goes
// out with my profile and directory entries; my Keşfet posts get it too.
export async function epostayiKaydet(eposta: string, onay: EpostaOnayi): Promise<void> {
  await profilGuncelle({ eposta, onay })
  await kesfetSahibimiTazele().catch((err) => console.warn('Keşfet paylaşımları tazelenemedi', err))
}
