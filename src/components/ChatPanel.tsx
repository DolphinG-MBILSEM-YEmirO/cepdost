import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { kayitOlustur, type Kayit } from '../db'
import { sohbetGonder, type PlanOnerisi, type SohbetMesaji } from '../chat'
import { CATEGORY_LABELS, CATEGORY_COLORS, CATEGORY_ICON_NAME } from '../lib/format'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'

interface ChatPanelProps {
  kayitlar: Kayit[]
  onClose: () => void
}

type PlanDurumu = 'bekliyor' | 'kaydedildi' | 'vazgecildi'

// Sohbette gösterilen tek bir mesaj — API'ye giden SohbetMesaji'den (rol +
// düz metin) daha zengin: F9 ile Gemini bir plan önerdiyse (function
// calling), o öneri + kullanıcının henüz "Plana ekle"ye basıp basmadığı da
// burada tutuluyor. metin null olabilir (model sadece fonksiyon çağırıp
// düz metin döndürmediyse) — o durumda arayüz varsayılan bir başlık gösterir.
interface GosterilenMesaj {
  rol: 'kullanici' | 'asistan'
  metin: string | null
  planOnerisi?: PlanOnerisi
  planDurumu?: PlanDurumu
}

// Gerçek bir API çağrısı yapmadan gösterilen ilk mesaj — hem anında geri
// bildirim hem de gereksiz bir Gemini isteği tasarrufu.
const KARSILAMA_MESAJI: GosterilenMesaj = {
  rol: 'asistan',
  metin:
    'Merhaba! Planların hakkında konuşabiliriz — bugün ne var, hangi planların çakışıyor, ne önerirsin gibi sorular sorabilirsin. Yeni bir plan eklemek istersen de buradan söyleyebilirsin, önce sana bir öneri gösteririm, onaylarsan eklerim.',
}

// Gemini'ye geçmiş bağlamı olarak gönderilecek düz metin — bir plan
// önerisi taşıyan mesajların da (metin boş olsa bile) bir karşılığı olsun
// diye kompakt bir açıklamaya çevrilir.
function apiMetni(m: GosterilenMesaj): string {
  if (m.metin) return m.metin
  if (m.planOnerisi) return `[Plan önerisi: ${m.planOnerisi.baslik}]`
  return ''
}

export function ChatPanel({ kayitlar, onClose }: ChatPanelProps) {
  useEscapeIleKapat(onClose)
  const [mesajlar, setMesajlar] = useState<GosterilenMesaj[]>([KARSILAMA_MESAJI])
  const [girdi, setGirdi] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sonRef = useRef<HTMLDivElement>(null)
  const girdiRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    sonRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mesajlar, loading])

  useEffect(() => {
    girdiRef.current?.focus()
  }, [])

  async function gonder() {
    const metin = girdi.trim()
    if (!metin || loading) return
    setGirdi('')
    setError(null)
    const yeniMesajlar: GosterilenMesaj[] = [...mesajlar, { rol: 'kullanici', metin }]
    setMesajlar(yeniMesajlar)
    setLoading(true)
    try {
      const apiGecmisi: SohbetMesaji[] = yeniMesajlar.map((m) => ({ rol: m.rol, metin: apiMetni(m) }))
      const sonuc = await sohbetGonder(apiGecmisi, kayitlar)
      setMesajlar((m) => [
        ...m,
        {
          rol: 'asistan',
          metin: sonuc.yanit,
          planOnerisi: sonuc.planOnerisi ?? undefined,
          planDurumu: sonuc.planOnerisi ? 'bekliyor' : undefined,
        },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  async function planiKaydet(index: number, oneri: PlanOnerisi) {
    await kayitOlustur({
      kategori: oneri.kategori,
      baslik: oneri.baslik,
      tarih: oneri.tarih,
      saat: oneri.saat,
      konum: oneri.konum,
      oncelik: oneri.oncelik,
      sure: oneri.sure,
      ozetNot: oneri.ozetNot,
      mekanOnerisi: null,
      yakinOneriler: null,
      kaynakTipi: 'metin',
      hamBaslik: '',
      hamMetin: '',
      hamLink: '',
      gorseller: [],
    })
    setMesajlar((m) => m.map((msg, i) => (i === index ? { ...msg, planDurumu: 'kaydedildi' } : msg)))
  }

  function planiVazgec(index: number) {
    setMesajlar((m) => m.map((msg, i) => (i === index ? { ...msg, planDurumu: 'vazgecildi' } : msg)))
  }

  return (
    <div className="panel-tam z-50">
      <div className="flex items-center justify-between px-5 pt-[calc(1rem+var(--safe-top))] pb-4 border-b border-ink-100/40 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center">
            <Icon name="MessageCircle" className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-ink-700 leading-tight">CepDost Asistanı</h2>
            <p className="text-xs text-ink-400">Planların hakkında konuş</p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Kapat"
          className="w-10 h-10 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform"
        >
          <Icon name="X" className="w-5 h-5 text-ink-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {mesajlar.map((m, i) => (
          <div key={i} className={`flex ${m.rol === 'kullanici' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
            <div className="max-w-[85%] w-full flex flex-col items-stretch">
              {(m.metin || !m.planOnerisi) && (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap self-start ${
                    m.rol === 'kullanici' ? 'bg-sky-500 text-white rounded-br-md self-end' : 'card rounded-bl-md'
                  }`}
                >
                  {m.metin ?? 'İşte bir öneri:'}
                </div>
              )}

              {m.planOnerisi && (
                <PlanOnerisiKart
                  oneri={m.planOnerisi}
                  durum={m.planDurumu ?? 'bekliyor'}
                  onKaydet={() => planiKaydet(i, m.planOnerisi!)}
                  onVazgec={() => planiVazgec(i)}
                />
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start animate-fade-in">
            <div className="card rounded-bl-md px-4 py-3 flex items-center gap-2 text-sm text-ink-400">
              <Icon name="Loader2" className="w-4 h-4 animate-spin" />
              Düşünüyor...
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 animate-fade-in">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        )}

        <div ref={sonRef} />
      </div>

      <div className="px-5 pb-[calc(1rem+var(--safe-bottom))] pt-3 border-t border-ink-100/40 safe-x shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={girdiRef}
            value={girdi}
            onChange={(e) => setGirdi(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                gonder()
              }
            }}
            placeholder="Bir şey sor..."
            rows={1}
            className="flex-1 bg-cream-50 border border-ink-100/40 rounded-2xl px-4 py-3 text-ink-700 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-sky-200 transition-all resize-none max-h-32"
          />
          <button
            onClick={gonder}
            disabled={loading || !girdi.trim()}
            aria-label="Gönder"
            className="w-11 h-11 rounded-full bg-sky-500 text-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40 shrink-0"
          >
            <Icon name="Send" className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// F9: Gemini'nin sohbet içinde önerdiği plan — kullanıcı onaylamadan
// (dokunmadan) Dexie'ye hiçbir şey yazılmıyor, "kaydedildi" durumuna
// geçmeden önce her zaman "bekliyor" olarak gösterilir.
function PlanOnerisiKart({
  oneri,
  durum,
  onKaydet,
  onVazgec,
}: {
  oneri: PlanOnerisi
  durum: PlanDurumu
  onKaydet: () => void
  onVazgec: () => void
}) {
  if (durum === 'kaydedildi') {
    return (
      <div className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3 mt-2">
        <Icon name="CheckCircle2" className="w-4 h-4 shrink-0" />
        <span>
          <strong>{oneri.baslik}</strong> plana eklendi
        </span>
      </div>
    )
  }
  if (durum === 'vazgecildi') {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-400 bg-ink-50 border border-ink-100/60 rounded-2xl px-4 py-3 mt-2">
        <Icon name="X" className="w-4 h-4 shrink-0" />
        Bu öneri atlandı
      </div>
    )
  }

  const detay = [oneri.tarih, oneri.saat, oneri.konum].filter(Boolean).join(' · ')

  return (
    <div className="card p-4 mt-2">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-9 h-9 rounded-xl ${CATEGORY_COLORS[oneri.kategori].bg} flex items-center justify-center shrink-0`}>
          <Icon name={CATEGORY_ICON_NAME[oneri.kategori]} className={`w-4.5 h-4.5 ${CATEGORY_COLORS[oneri.kategori].text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-700 truncate">{oneri.baslik}</p>
          <p className="text-xs text-ink-400 truncate">{detay || CATEGORY_LABELS[oneri.kategori]}</p>
        </div>
      </div>
      {oneri.ozetNot && <p className="text-xs text-ink-400 mb-3">{oneri.ozetNot}</p>}
      <div className="flex gap-2">
        <button onClick={onVazgec} className="btn-ghost flex-1 border border-ink-100/40 text-sm py-2.5">
          Vazgeç
        </button>
        <button onClick={onKaydet} className="btn-primary flex-1 text-sm py-2.5 flex items-center justify-center gap-1.5">
          <Icon name="Check" className="w-4 h-4" />
          Plana ekle
        </button>
      </div>
    </div>
  )
}
