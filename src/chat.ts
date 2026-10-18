import { goruntulemeBasligi, type Kayit, type Kategori, type Oncelik } from './db'
import { CATEGORY_LABELS, localDateString } from './lib/format'

// The server reads only the last 20 messages (see api/chat.ts); sending the
// rest of a long conversation would only grow the request towards its size
// limit.
const GONDERILEN_MESAJ_SAYISI = 20

export type SohbetRolu = 'kullanici' | 'asistan'

export interface SohbetMesaji {
  rol: SohbetRolu
  metin: string
}

// The whole plan the assistant prepared from one message (see plan_kur in
// api/chat.ts). Only a suggestion: nothing is saved or sent until the user
// taps the card in ChatPanel.
export interface PlanOnerisi {
  kategori: Kategori
  baslik: string
  emoji: string | null
  tarih: string | null
  saat: string | null
  konum: string | null
  oncelik: Oncelik
  sure: number | null
  ozetNot: string | null
  // Handles from the assistant context (k1, g1); ChatPanel maps them back.
  kisiler: string[]
  grup: string | null
  // Checked by the server for the chosen time.
  uygunluk: { mesgul: string[]; bilinmiyor: string[] } | null
}

export interface SohbetYaniti {
  yanit: string | null
  planOnerisi: PlanOnerisi | null
}

// Compact plan summary sent to the assistant: one line per record with the
// fields that matter in a conversation. Capped at 25 records for tokens and
// privacy, picked so the ones the user is most likely to ask about survive:
// pending upcoming plans (nearest first), then undated ones, then overdue
// ones (most recent first), then done ones.
export function planOzetiOlustur(kayitlar: Kayit[], bugun = localDateString()): string {
  if (kayitlar.length === 0) return '(Henüz kayıtlı planı yok.)'

  const bekleyen = kayitlar.filter((k) => k.durum === 'bekliyor')
  const yaklasan = bekleyen
    .filter((k) => k.tarih && k.tarih >= bugun)
    .sort((a, b) => `${a.tarih} ${a.saat ?? ''}`.localeCompare(`${b.tarih} ${b.saat ?? ''}`))
  const tarihsiz = bekleyen.filter((k) => !k.tarih)
  const gecmis = bekleyen
    .filter((k) => k.tarih && k.tarih < bugun)
    .sort((a, b) => b.tarih!.localeCompare(a.tarih!))
  const yapilan = kayitlar
    .filter((k) => k.durum === 'yapildi')
    .sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''))

  const siraliVeSinirli = [...yaklasan, ...tarihsiz, ...gecmis, ...yapilan].slice(0, 25)

  return siraliVeSinirli
    .map((k) => {
      const parcalar = [
        `- [${k.durum === 'yapildi' ? '✓' : '•'}]`,
        k.kategori ? `(${CATEGORY_LABELS[k.kategori]})` : '',
        goruntulemeBasligi(k),
        k.tarih ? `— ${k.tarih}` : '',
        k.saat ?? '',
        k.konum ? `— ${k.konum}` : '',
        `— öncelik: ${k.oncelik}`,
      ]
      return parcalar.filter(Boolean).join(' ')
    })
    .join('\n')
}

// The server may call the model up to three times for one message.
const ZAMAN_ASIMI_MS = 60_000

// Sends the chat history, the compact plan summary and (when signed in) the
// friends/groups context to /api/chat and returns the assistant's answer.
// Writes nothing to Dexie: the message history lives only in ChatPanel's
// React state (no persistent chat history, on purpose: simplicity).
export async function sohbetGonder(
  mesajlar: SohbetMesaji[],
  kayitlar: Kayit[],
  baglam: unknown = null,
): Promise<SohbetYaniti> {
  const simdi = new Date()
  let res: Response
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mesajlar: mesajlar.slice(-GONDERILEN_MESAJ_SAYISI),
        planOzeti: planOzetiOlustur(kayitlar),
        bugun: localDateString(),
        simdiSaat: `${String(simdi.getHours()).padStart(2, '0')}:${String(simdi.getMinutes()).padStart(2, '0')}`,
        baglam,
      }),
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('Asistan gecikti, tekrar dener misin?')
    }
    throw new Error('Asistana ulaşılamadı. İnternet bağlantını kontrol et.')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Sunucu hatası ${res.status}` }))
    throw new Error(SUNUCU_HATALARI[err.error] ?? err.error ?? `Sunucu hatası ${res.status}`)
  }

  const data = await res.json()
  return {
    yanit: data.yanit ?? null,
    // Fields an older server doesn't send get their empty values.
    planOnerisi: data.planOnerisi
      ? { emoji: null, kisiler: [], grup: null, uygunluk: null, ...data.planOnerisi }
      : null,
  }
}

// The server's short error codes, in words for the user.
const SUNUCU_HATALARI: Record<string, string> = {
  'sohbet başarısız': 'Asistan şu an yanıt veremedi, birazdan tekrar dener misin?',
  'yanıt üretilemedi': 'Asistan bir yanıt üretemedi, isteğini biraz farklı yazmayı dener misin?',
  'GEMINI_API_KEY tanımlı değil': 'Asistan henüz açılmamış: sunucuda GEMINI_API_KEY tanımlı değil.',
}
