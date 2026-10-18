import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Icon } from './Icon'
import { Avatar, GrupAvatari } from './Avatar'
import { goruntulemeBasligi, tumKayitlar, type Kayit } from '../db'
import { formatDate } from '../lib/format'
import { paylasilabilirPlanlar, planiPaylas, type PaylasimHedefi } from '../lib/planPaylasimi'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'
import { arkadaslariGetir, type Profil } from '../sosyal/api'
import { gruplarimiGetir, type Grup } from '../sosyal/gruplar'

// Two ways to share a plan into a chat:
// - from a chat: pick one of my upcoming plans (PlanPaylasSheet),
// - from a plan: pick a friend or a group (PaylasimHedefiSheet).
// Both end in planiPaylas, which sends the invite or group plan and drops
// a card into the chat.

function Sheet({ baslik, onKapat, children }: { baslik: string; onKapat: () => void; children: ReactNode }) {
  useEscapeIleKapat(onKapat)
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onKapat}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={baslik}
        className="card w-full max-w-sm mx-4 mb-4 sm:mb-0 p-5 animate-slide-up max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="font-semibold text-ink-700">{baslik}</h3>
          <button
            onClick={onKapat}
            aria-label="Kapat"
            className="w-8 h-8 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform"
          >
            <Icon name="X" className="w-4 h-4 text-ink-500" />
          </button>
        </div>
        <div className="overflow-y-auto -mx-1 px-1">{children}</div>
      </div>
    </div>
  )
}

function Satir({
  onClick,
  disabled,
  sol,
  baslik,
  alt,
  sag,
}: {
  onClick: () => void
  disabled?: boolean
  sol: ReactNode
  baslik: string
  alt?: string | null
  sag?: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-cream-100 active:scale-[0.98] transition-all disabled:opacity-50"
    >
      {sol}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-700 truncate">{baslik}</p>
        {alt && <p className="text-xs text-ink-400 truncate">{alt}</p>}
      </div>
      {sag}
    </button>
  )
}

function planOzeti(k: Kayit): string {
  return [formatDate(k.tarih) ?? k.tarih, k.saat, k.konum].filter(Boolean).join(' · ')
}

// From a chat: choose which of my plans to share there. `onUygunSaat`
// adds the AI "find a time that suits everyone" option on top.
export function PlanPaylasSheet({
  hedef,
  onKapat,
  onUygunSaat,
}: {
  hedef: PaylasimHedefi
  onKapat: () => void
  onUygunSaat?: () => void
}) {
  const kayitlar = useLiveQuery(() => tumKayitlar(), [])
  const planlar = kayitlar ? paylasilabilirPlanlar(kayitlar) : null
  const [gonderilen, setGonderilen] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  async function paylas(k: Kayit) {
    setGonderilen(k.id)
    setHata(null)
    try {
      await planiPaylas(k, hedef)
      onKapat()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Paylaşılamadı')
      setGonderilen(null)
    }
  }

  return (
    <Sheet baslik="Plan paylaş" onKapat={onKapat}>
      {onUygunSaat && (
        <Satir
          onClick={onUygunSaat}
          sol={
            <span className="w-10 h-10 rounded-xl bg-coral-100 flex items-center justify-center shrink-0">
              <Icon name="Wand2" className="w-5 h-5 text-coral-500" />
            </span>
          }
          baslik="Herkese uyan saati bul"
          alt="Ne yapmak istediğini yaz, gerisini yapay zekâ halletsin"
          sag={<Icon name="ChevronRight" className="w-4 h-4 text-ink-300" />}
        />
      )}

      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mt-3 mb-1 px-1">Takvimimden</p>
      {planlar === null ? (
        <div className="skeleton h-14 rounded-2xl" />
      ) : planlar.length === 0 ? (
        <p className="text-sm text-ink-400 px-1 py-3">
          Takviminde yaklaşan bir plan yok. Alttaki + ile yeni bir plan kurup paylaşabilirsin.
        </p>
      ) : (
        planlar.map((k) => (
          <Satir
            key={k.id}
            onClick={() => void paylas(k)}
            disabled={gonderilen !== null}
            sol={
              <span className="w-10 h-10 rounded-xl bg-cream-100 flex items-center justify-center shrink-0">
                <Icon name="CalendarDays" className="w-5 h-5 text-ink-400" />
              </span>
            }
            baslik={goruntulemeBasligi(k)}
            alt={planOzeti(k)}
            sag={
              gonderilen === k.id ? (
                <Icon name="Loader2" className="w-4 h-4 animate-spin text-ink-300" />
              ) : (
                <Icon name="Send" className="w-4 h-4 text-coral-500" />
              )
            }
          />
        ))
      )}
      {hata && <p className="text-xs text-rose-600 mt-3 px-1">{hata}</p>}
    </Sheet>
  )
}

// From a plan: choose a friend or a group to share it with.
export function PaylasimHedefiSheet({ kayit, onKapat }: { kayit: Kayit; onKapat: () => void }) {
  const [arkadaslar, setArkadaslar] = useState<Profil[] | null>(null)
  const [gruplar, setGruplar] = useState<Grup[]>([])
  const [gonderilen, setGonderilen] = useState<string | null>(null)
  const [paylasildi, setPaylasildi] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    let iptal = false
    Promise.all([arkadaslariGetir(), gruplarimiGetir()])
      .then(([a, g]) => {
        if (iptal) return
        setArkadaslar(a.filter((x) => x.durum === 'kabul').map((x) => x.profil))
        setGruplar(g)
      })
      .catch((err) => {
        if (!iptal) {
          setHata(err instanceof Error ? err.message : 'Arkadaşların alınamadı')
          setArkadaslar([])
        }
      })
    return () => {
      iptal = true
    }
  }, [])

  async function paylas(anahtar: string, ad: string, hedef: PaylasimHedefi) {
    setGonderilen(anahtar)
    setHata(null)
    try {
      await planiPaylas(kayit, hedef)
      setPaylasildi(ad)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Paylaşılamadı')
    } finally {
      setGonderilen(null)
    }
  }

  if (paylasildi) {
    return (
      <Sheet baslik="Paylaşıldı" onKapat={onKapat}>
        <div className="text-center py-4">
          <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-3">
            <Icon name="CheckCircle2" className="w-7 h-7 text-teal-600" />
          </div>
          <p className="text-sm text-ink-500 mb-5">
            Plan <strong>{paylasildi}</strong> sohbetine kart olarak düştü; yanıtlar orada görünecek.
          </p>
          <button onClick={onKapat} className="btn-primary w-full">
            Tamam
          </button>
        </div>
      </Sheet>
    )
  }

  const bos = arkadaslar !== null && arkadaslar.length === 0 && gruplar.length === 0
  const sag = (anahtar: string) =>
    gonderilen === anahtar ? (
      <Icon name="Loader2" className="w-4 h-4 animate-spin text-ink-300" />
    ) : (
      <Icon name="Send" className="w-4 h-4 text-coral-500" />
    )

  return (
    <Sheet baslik="Kiminle paylaşalım?" onKapat={onKapat}>
      {arkadaslar === null ? (
        <div className="space-y-2">
          <div className="skeleton h-14 rounded-2xl" />
          <div className="skeleton h-14 rounded-2xl" />
        </div>
      ) : bos ? (
        <p className="text-sm text-ink-400 px-1 py-3">
          Henüz arkadaşın yok. Profil sekmesinden arkadaş ekleyince planlarını onlarla paylaşabilirsin.
        </p>
      ) : (
        <>
          {gruplar.length > 0 && (
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-1 px-1">Gruplar</p>
          )}
          {gruplar.map((g) => (
            <Satir
              key={g.id}
              onClick={() => void paylas(g.id, g.ad, { tur: 'grup', grup: g })}
              disabled={gonderilen !== null}
              sol={<GrupAvatari grup={g} boyut="sm" />}
              baslik={g.ad}
              alt="Grup planı olarak"
              sag={sag(g.id)}
            />
          ))}
          {arkadaslar.length > 0 && (
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mt-3 mb-1 px-1">Arkadaşlar</p>
          )}
          {arkadaslar.map((p) => (
            <Satir
              key={p.id}
              onClick={() => void paylas(p.id, p.ad, { tur: 'arkadas', id: p.id, ad: p.ad })}
              disabled={gonderilen !== null}
              sol={<Avatar ad={p.ad} foto={p.avatar} emoji={p.emoji} renk={p.renk} boyut="sm" />}
              baslik={p.ad}
              alt="Davet olarak"
              sag={sag(p.id)}
            />
          ))}
        </>
      )}
      {hata && <p className="text-xs text-rose-600 mt-3 px-1">{hata}</p>}
    </Sheet>
  )
}
