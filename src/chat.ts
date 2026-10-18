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

// F9: sohbet sırasında Gemini'nin (function calling ile) önerdiği yeni
// plan — bkz. api/chat.ts plan_oner. Bu sadece bir
// ÖNERİ, ChatPanel kullanıcı "Plana ekle"ye basmadan Dexie'ye yazmaz.
export interface PlanOnerisi {
  kategori: Kategori
  baslik: string
  tarih: string | null
  saat: string | null
  konum: string | null
  oncelik: Oncelik
  sure: number | null
  ozetNot: string | null
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

// Sends the chat history and the compact plan summary to /api/chat and
// returns the assistant's answer. Writes nothing to Dexie: the message
// history lives only in ChatPanel's React state (no persistent chat history,
// on purpose: simplicity).
export async function sohbetGonder(mesajlar: SohbetMesaji[], kayitlar: Kayit[]): Promise<SohbetYaniti> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mesajlar: mesajlar.slice(-GONDERILEN_MESAJ_SAYISI),
      planOzeti: planOzetiOlustur(kayitlar),
      bugun: localDateString(),
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Sunucu hatası ${res.status}` }))
    throw new Error(err.error ?? `Sunucu hatası ${res.status}`)
  }

  const data = await res.json()
  return { yanit: data.yanit ?? null, planOnerisi: data.planOnerisi ?? null }
}
