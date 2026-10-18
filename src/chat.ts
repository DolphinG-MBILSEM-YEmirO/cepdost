import { goruntulemeBasligi, type Kayit, type Kategori, type Oncelik } from './db'
import { CATEGORY_LABELS, localDateString } from './lib/format'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export type SohbetRolu = 'kullanici' | 'asistan'

export interface SohbetMesaji {
  rol: SohbetRolu
  metin: string
}

// F9: sohbet sırasında Gemini'nin (function calling ile) önerdiği yeni
// plan — bkz. supabase/functions/chat/index.ts plan_oner. Bu sadece bir
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

// Sohbet geçmişini + kompakt plan özetini Edge Function'a gönderip
// asistanın yanıtını döner. Dexie'ye hiçbir şey yazmaz — mesaj geçmişi
// yalnızca ChatPanel'in React state'inde yaşar (kalıcı sohbet geçmişi
// bilinçli olarak yok, bkz. proje notları: basitlik).
export async function sohbetGonder(mesajlar: SohbetMesaji[], kayitlar: Kayit[]): Promise<SohbetYaniti> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase env değişkenleri eksik')
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      mesajlar,
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
