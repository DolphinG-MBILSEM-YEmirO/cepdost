import { verifyEvent, type Event } from 'nostr-tools/pure'
import {
  BASLIK_MAKS,
  BILDIRIM_OLAY_TURU,
  BILDIRIM_TURLERI,
  GOVDE_MAKS,
  gitGecerliMi,
  type BildirimTuru,
} from '../../shared/bildirim'
import { UYGULAMA_ADI } from '../../shared/marka'
import { linkOzeti, type Bilinenler } from './bilinenler'

// What the service worker shows for a push it received (the browser has
// already decrypted it). Kept apart from sw.ts so it can be tested.

export interface GosterilecekBildirim {
  baslik: string
  govde: string
  // In-app destination; '' opens the app's start.
  git: string
  etiket: string
}

// For senders who can't be vouched for (see bilinenler.ts), and for pushes
// that can't be read at all.
const SABIT: Record<BildirimTuru | 'bilinmiyor', { baslik: string; govde: string; git: string }> = {
  istek: { baslik: 'Yeni arkadaşlık isteği', govde: 'Biri seni arkadaş olarak eklemek istiyor. Görmek için dokun.', git: 'arkadaslar' },
  kabul: { baslik: UYGULAMA_ADI, govde: 'Arkadaşlık isteğin kabul edildi.', git: 'arkadaslar' },
  mesaj: { baslik: UYGULAMA_ADI, govde: 'Yeni bir mesajın var.', git: '' },
  davet: { baslik: UYGULAMA_ADI, govde: 'Yeni bir plan davetin var.', git: '' },
  grup: { baslik: UYGULAMA_ADI, govde: 'Grubunda yeni bir şey var.', git: '' },
  link: { baslik: UYGULAMA_ADI, govde: 'Planına yeni bir yanıt geldi.', git: '' },
  bilinmiyor: { baslik: UYGULAMA_ADI, govde: 'Yeni bir bildirimin var.', git: '' },
}

function metin(deger: unknown, azami: number): string {
  return typeof deger === 'string' ? deger.replace(/\s+/g, ' ').trim().slice(0, azami) : ''
}

// Tagged by kind, so a stranger can't replace a friend's notification by
// reusing its tag, and their pings pile up as one.
function sabit(tur: BildirimTuru | 'bilinmiyor'): GosterilecekBildirim {
  return { ...SABIT[tur], etiket: tur }
}

export async function bildirimMetni(veri: string | null, bilinenler: Bilinenler): Promise<GosterilecekBildirim> {
  let olay: Event
  try {
    olay = JSON.parse(veri ?? '') as Event
  } catch {
    return sabit('bilinmiyor')
  }
  if (typeof olay !== 'object' || olay === null || olay.kind !== BILDIRIM_OLAY_TURU || !verifyEvent(olay)) {
    return sabit('bilinmiyor')
  }

  let icerik: Record<string, unknown>
  try {
    icerik = JSON.parse(olay.content) as Record<string, unknown>
  } catch {
    return sabit('bilinmiyor')
  }
  const tur = BILDIRIM_TURLERI.find((t) => t === icerik.tur)
  if (!tur) return sabit('bilinmiyor')

  const git = metin(icerik.git, 120)
  const kendiMetni = {
    baslik: metin(icerik.baslik, BASLIK_MAKS) || UYGULAMA_ADI,
    govde: metin(icerik.govde, GOVDE_MAKS),
    git: gitGecerliMi(git) ? git : '',
    etiket: metin(icerik.etiket, 120) || tur,
  }

  if (bilinenler.kisiler.has(olay.pubkey)) return kendiMetni
  // Whoever answers my plan link (or my Davet invite) holds its key: that's
  // all a guest can show.
  const linkAnahtari = /^(link|davet):/.test(git) ? git.slice(git.indexOf(':') + 1) : null
  if (tur === 'link' && linkAnahtari && bilinenler.linkler.has(await linkOzeti(linkAnahtari))) {
    return kendiMetni
  }
  return sabit(tur)
}
