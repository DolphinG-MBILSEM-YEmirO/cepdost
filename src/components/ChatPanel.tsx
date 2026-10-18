import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Avatar, GrupAvatari } from './Avatar'
import type { Kayit } from '../db'
import { sohbetGonder, type PlanOnerisi, type SohbetMesaji } from '../chat'
import { CATEGORY_COLORS, CATEGORY_ICON_NAME, formatDate, formatDuration } from '../lib/format'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'
import { planiKur, type PlanKitlesi } from '../lib/planPaylasimi'
import { useAuth } from '../sosyal/auth'
import { asistanBaglamiHazirla, type AsistanBaglami } from '../sosyal/asistanBaglami'
import type { Profil } from '../sosyal/api'
import type { Grup } from '../sosyal/gruplar'

interface ChatPanelProps {
  kayitlar: Kayit[]
  onClose: () => void
}

type PlanDurumu = 'bekliyor' | 'kuruluyor' | 'kaydedildi' | 'vazgecildi'

// One message on screen. Richer than the SohbetMesaji sent to the API: when
// the assistant prepared a plan, the plan, who it's for (resolved from the
// context of that moment) and whether the user has set it up yet live here.
// `metin` may be null when the model only handed back a plan.
interface GosterilenMesaj {
  rol: 'kullanici' | 'asistan'
  metin: string | null
  plan?: HazirPlan
  planDurumu?: PlanDurumu
}

// The assistant's plan with its handles mapped back to people and groups.
interface HazirPlan {
  oneri: PlanOnerisi
  kisiler: Profil[]
  grup: Grup | null
}

// Shown without an API call: instant feedback, and one Gemini request saved.
const KARSILAMA_MESAJI: GosterilenMesaj = {
  rol: 'asistan',
  metin:
    'Merhaba! Planların hakkında sorabilir ya da tek mesajla plan kurdurabilirsin. Kimle, ne yapmak istediğini yazman yeterli; herkesin boş olduğu saati bulup planı hazırlarım, sen tek dokunuşla gönderirsin.',
}

// Plain text sent to Gemini as history, so a message that only carried a
// plan still means something in later turns.
function apiMetni(m: GosterilenMesaj): string {
  if (m.metin) return m.metin
  if (m.plan) return `[Plan önerisi: ${m.plan.oneri.baslik}]`
  return ''
}

function planaCevir(oneri: PlanOnerisi, baglam: AsistanBaglami | null): HazirPlan {
  return {
    oneri,
    kisiler: oneri.kisiler.flatMap((r) => baglam?.kisiler.get(r) ?? []),
    grup: (oneri.grup && baglam?.gruplar.get(oneri.grup)) || null,
  }
}

// Ready-made requests for the first screen, using a real friend or group
// when there is one, so the user sees what a single message can do.
function ornekIstekler(baglam: AsistanBaglami | null): string[] {
  const grup = baglam?.gruplar.values().next().value
  const arkadas = baglam?.istek.kisiler.find((k) => k.arkadas)
  return [
    'Bugün ve yarın neler var?',
    grup
      ? `${grup.ad} ile bu hafta sonu herkesin boş olduğu bir akşam yemek planla`
      : arkadas
        ? `Cumartesi ${arkadas.ad.split(' ')[0]} ile kahve planla`
        : 'Yarın akşam 1 saat spor ekle',
    'Bu hafta en boş günüm hangisi?',
  ]
}

export function ChatPanel({ kayitlar, onClose }: ChatPanelProps) {
  useEscapeIleKapat(onClose)
  const { kullanici } = useAuth()
  const [mesajlar, setMesajlar] = useState<GosterilenMesaj[]>([KARSILAMA_MESAJI])
  const [girdi, setGirdi] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Friends, groups and their busy times, refreshed before each message; the
  // first copy feeds the example requests.
  const [baglam, setBaglam] = useState<AsistanBaglami | null>(null)
  const sonRef = useRef<HTMLDivElement>(null)
  const girdiRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    sonRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mesajlar, loading])

  useEffect(() => {
    girdiRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!kullanici) return
    let iptal = false
    asistanBaglamiHazirla()
      .then((b) => {
        if (!iptal) setBaglam(b)
      })
      .catch(() => {})
    return () => {
      iptal = true
    }
  }, [kullanici])

  async function gonder(metinGirdisi?: string) {
    const metin = (metinGirdisi ?? girdi).trim()
    if (!metin || loading) return
    setGirdi('')
    setError(null)
    const yeniMesajlar: GosterilenMesaj[] = [...mesajlar, { rol: 'kullanici', metin }]
    setMesajlar(yeniMesajlar)
    setLoading(true)
    try {
      // Without the social context the assistant still works for the
      // user's own plans.
      const guncel = kullanici ? await asistanBaglamiHazirla().catch(() => null) : null
      if (guncel) setBaglam(guncel)
      const apiGecmisi: SohbetMesaji[] = yeniMesajlar.map((m) => ({ rol: m.rol, metin: apiMetni(m) }))
      const sonuc = await sohbetGonder(apiGecmisi, kayitlar, guncel?.istek ?? null)
      setMesajlar((m) => [
        ...m,
        {
          rol: 'asistan',
          metin: sonuc.yanit,
          plan: sonuc.planOnerisi ? planaCevir(sonuc.planOnerisi, guncel) : undefined,
          planDurumu: sonuc.planOnerisi ? 'bekliyor' : undefined,
        },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  function durumYaz(index: number, planDurumu: PlanDurumu) {
    setMesajlar((m) => m.map((msg, i) => (i === index ? { ...msg, planDurumu } : msg)))
  }

  // One tap sets up everything: my calendar entry plus the group plan or the
  // invites, each landing in the right chat as a card.
  async function planiKurVeKaydet(index: number, plan: HazirPlan) {
    const { oneri } = plan
    const kitle: PlanKitlesi = plan.grup
      ? { tur: 'grup', grup: plan.grup }
      : plan.kisiler.length > 0
        ? { tur: 'arkadaslar', kisiler: plan.kisiler }
        : { tur: 'tek' }
    durumYaz(index, 'kuruluyor')
    try {
      await planiKur(
        {
          baslik: oneri.baslik,
          tarih: oneri.tarih,
          saat: oneri.saat,
          sure: oneri.sure,
          tumGun: oneri.tumGun,
          konum: oneri.konum,
          not: oneri.ozetNot,
          emoji: oneri.emoji,
          kategori: oneri.kategori,
          oncelik: oneri.oncelik,
        },
        kitle,
      )
      durumYaz(index, 'kaydedildi')
    } catch (err) {
      durumYaz(index, 'bekliyor')
      setError(err instanceof Error ? err.message : 'Plan kurulamadı')
    }
  }

  const sadeceKarsilama = mesajlar.length === 1

  return (
    <div className="panel-tam z-50">
      <div className="flex items-center justify-between px-5 pt-[calc(1rem+var(--safe-top))] pb-4 border-b border-ink-100/40 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center">
            <Icon name="MessageCircle" className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-ink-700 leading-tight">CepDost Asistanı</h2>
            <p className="text-xs text-ink-400">Sor ya da tek mesajla plan kurdur</p>
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
              {(m.metin || !m.plan) && (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap self-start ${
                    m.rol === 'kullanici' ? 'bg-sky-500 text-white rounded-br-md self-end' : 'card rounded-bl-md'
                  }`}
                >
                  {m.metin ?? 'İşte bir öneri:'}
                </div>
              )}

              {m.plan && (
                <PlanKarti
                  plan={m.plan}
                  durum={m.planDurumu ?? 'bekliyor'}
                  onKur={() => void planiKurVeKaydet(i, m.plan!)}
                  onVazgec={() => durumYaz(i, 'vazgecildi')}
                />
              )}
            </div>
          </div>
        ))}

        {sadeceKarsilama && (
          <div className="flex flex-col items-start gap-2 pt-1">
            {ornekIstekler(baglam).map((o) => (
              <button
                key={o}
                onClick={() => void gonder(o)}
                className="chip bg-sky-50 text-sky-700 border border-sky-100 text-left active:scale-95"
              >
                <Icon name="Sparkles" className="w-4 h-4 shrink-0" />
                {o}
              </button>
            ))}
          </div>
        )}

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
                void gonder()
              }
            }}
            placeholder="Ör. Cumartesi Ayşe'yle kahvaltı ayarla"
            rows={1}
            className="flex-1 bg-cream-50 border border-ink-100/40 rounded-2xl px-4 py-3 text-ink-700 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-sky-200 transition-all resize-none max-h-32"
          />
          <button
            onClick={() => void gonder()}
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

function adlariBirlestir(adlar: string[]): string {
  return adlar.length <= 1 ? (adlar[0] ?? '') : `${adlar.slice(0, -1).join(', ')} ve ${adlar[adlar.length - 1]}`
}

// Whether the chosen time suits everyone, as the server checked it.
function UygunlukSatiri({ plan }: { plan: HazirPlan }) {
  const { uygunluk, saat, tarih, tumGun } = plan.oneri
  const birlikte = plan.grup !== null || plan.kisiler.length > 0
  if (!saat && !tumGun) {
    return <p className="text-xs text-ink-400">Saat belirtilmedi, gün içinde serbest.</p>
  }
  if (!uygunluk) {
    // A time without a check: the date is further out than shared calendars
    // reach (or missing, which the card already flags).
    return tarih ? <p className="text-xs text-ink-400">Bu tarih için müsaitlik henüz görünmüyor.</p> : null
  }
  const digerleri = uygunluk.mesgul.filter((a) => a !== 'Sen')
  return (
    <div className="space-y-1">
      {uygunluk.mesgul.length === 0 ? (
        <p className="text-xs font-medium text-teal-700 flex items-center gap-1.5">
          <Icon name="CheckCircle2" className="w-3.5 h-3.5 shrink-0" />
          {tumGun
            ? birlikte
              ? 'O gün herkes müsait görünüyor'
              : 'O gün başka planın yok'
            : birlikte
              ? 'Bu saatte herkes müsait görünüyor'
              : 'Bu saatte başka planın yok'}
        </p>
      ) : (
        <p className="text-xs font-medium text-amber-700 flex items-start gap-1.5">
          <Icon name="AlertCircle" className="w-3.5 h-3.5 shrink-0 mt-px" />
          {[
            uygunluk.mesgul.includes('Sen') ? (tumGun ? 'O gün başka bir planın var' : 'Bu saatte başka bir planın var') : null,
            digerleri.length > 0
              ? `${adlariBirlestir(digerleri)} ${tumGun ? 'o gün meşgul' : 'bu saatte dolu'} görünüyor`
              : null,
          ]
            .filter(Boolean)
            .join('; ')}
        </p>
      )}
      {uygunluk.bilinmiyor.length > 0 && (
        <p className="text-xs text-ink-400">{adlariBirlestir(uygunluk.bilinmiyor)} takvimini paylaşmıyor.</p>
      )}
    </div>
  )
}

// The plan the assistant prepared. Nothing is saved or sent until the user
// taps the main button.
function PlanKarti({
  plan,
  durum,
  onKur,
  onVazgec,
}: {
  plan: HazirPlan
  durum: PlanDurumu
  onKur: () => void
  onVazgec: () => void
}) {
  const { oneri, kisiler, grup } = plan
  const adlar = adlariBirlestir(kisiler.map((k) => k.ad))

  if (durum === 'kaydedildi') {
    return (
      <div className="flex items-start gap-2 text-sm text-teal-700 bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3 mt-2">
        <Icon name="CheckCircle2" className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <strong>{oneri.baslik}</strong>{' '}
          {grup
            ? `${grup.ad} sohbetine düştü ve takvimine eklendi.`
            : kisiler.length > 0
              ? `takvimine eklendi, davet ${adlar} ile sohbetine gitti.`
              : 'takvimine eklendi.'}
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

  const renk = CATEGORY_COLORS[oneri.kategori]
  const zaman = [formatDate(oneri.tarih), oneri.tumGun ? 'Tüm gün' : oneri.saat, formatDuration(oneri.sure)]
    .filter(Boolean)
    .join(' · ')
  const birlikte = grup !== null || kisiler.length > 0
  const tarihEksik = birlikte && !oneri.tarih
  const dugme = grup
    ? `${grup.ad} ile paylaş`
    : kisiler.length === 1
      ? `${kisiler[0].ad.split(' ')[0]} ile paylaş`
      : kisiler.length > 1
        ? `${kisiler.length} kişiye davet gönder`
        : 'Plana ekle'
  const kuruluyor = durum === 'kuruluyor'

  return (
    <div className="card p-4 mt-2 space-y-3">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${renk.bg} flex items-center justify-center shrink-0 text-xl`}>
          {oneri.emoji ?? <Icon name={CATEGORY_ICON_NAME[oneri.kategori]} className={`w-5 h-5 ${renk.text}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-700">{oneri.baslik}</p>
          <p className="text-xs text-ink-400">{zaman || 'Tarih belirtilmedi'}</p>
          {oneri.konum && (
            <p className="text-xs text-ink-500 flex items-center gap-1 mt-0.5">
              <Icon name="MapPin" className="w-3 h-3 text-coral-500 shrink-0" />
              {oneri.konum}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 bg-cream-100 rounded-xl px-3 py-2">
        {grup ? (
          <>
            <GrupAvatari grup={grup} boyut="sm" />
            <p className="text-xs text-ink-500 min-w-0">
              <span className="font-semibold text-ink-700">{grup.ad}</span> grup planı olarak
            </p>
          </>
        ) : kisiler.length > 0 ? (
          <>
            <div className="flex -space-x-2 shrink-0">
              {kisiler.slice(0, 4).map((k) => (
                <Avatar key={k.id} ad={k.ad} foto={k.avatar} emoji={k.emoji} renk={k.renk} boyut="sm" />
              ))}
            </div>
            <p className="text-xs text-ink-500 min-w-0">
              <span className="font-semibold text-ink-700">{adlar}</span> davet edilecek
            </p>
          </>
        ) : (
          <p className="text-xs text-ink-500">Sadece senin takvimine eklenecek</p>
        )}
      </div>

      <UygunlukSatiri plan={plan} />
      {oneri.ozetNot && <p className="text-xs text-ink-400">{oneri.ozetNot}</p>}
      {tarihEksik && (
        <p className="text-xs text-amber-700">Davet için bir tarih gerekiyor; asistana hangi gün olduğunu yaz.</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onVazgec}
          disabled={kuruluyor}
          className="btn-ghost flex-1 border border-ink-100/40 text-sm py-2.5 disabled:opacity-50"
        >
          Vazgeç
        </button>
        <button
          onClick={onKur}
          disabled={kuruluyor || tarihEksik}
          className="btn-primary flex-[1.4] text-sm py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Icon
            name={kuruluyor ? 'Loader2' : birlikte ? 'Send' : 'Check'}
            className={`w-4 h-4 shrink-0 ${kuruluyor ? 'animate-spin' : ''}`}
          />
          <span className="truncate">{dugme}</span>
        </button>
      </div>
    </div>
  )
}
