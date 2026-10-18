import type { Kayit, Kategori, Oncelik } from './db'
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

// Gemini'ye gönderilecek kompakt plan özeti — tüm Kayit alanlarını değil,
// sohbet için anlamlı olanları tek satırlık maddeler halinde derler.
// Bekleyenler önce, en yakın tarihliler üstte; token/gizlilik için en
// fazla ~25 kayıtla sınırlanır (bkz. supabase/functions/chat/index.ts).
export function planOzetiOlustur(kayitlar: Kayit[]): string {
  if (kayitlar.length === 0) return '(Henüz kayıtlı planı yok.)'

  const siraliVeSinirli = [...kayitlar]
    .sort((a, b) => {
      if (a.durum !== b.durum) return a.durum === 'bekliyor' ? -1 : 1
      const at = a.tarih ?? '9999-99-99'
      const bt = b.tarih ?? '9999-99-99'
      return at.localeCompare(bt)
    })
    .slice(0, 25)

  return siraliVeSinirli
    .map((k) => {
      const parcalar = [
        `- [${k.durum === 'yapildi' ? '✓' : '•'}]`,
        k.kategori ? `(${CATEGORY_LABELS[k.kategori]})` : '',
        k.baslik ?? '(başlıksız)',
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
