import { useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { arkadasTakvimi, type ArkadasTakvimi, type MusaitlikBlogu, type Profil } from '../sosyal/api'
import { addDays, toDateString, formatDate, formatRelativeTime } from '../lib/format'
import { ETKINLIK_EMOJILERI } from '../lib/kisisellestirme'
import { planiKur } from '../lib/planPaylasimi'
import { EmojiSecici, TumGunAnahtari } from './Seciciler'
import { useGeriIleKapat } from '../lib/geriTusu'

// The Müsaitlik tab of a friend's profile (ArkadasProfili): their busy
// ranges for the coming week, and a quick invite for any day.

// Kaç günlük müsaitlik gösterilsin. Bir haftalık pencere, "bu hafta ne
// zaman buluşabiliriz" sorusunun doğal kapsamı.
const GUN_SAYISI = 7

// Older than this, the screen says the calendar may have changed since.
const ESKI_TAKVIM_MS = 3 * 24 * 60 * 60 * 1000

export function ArkadasMusaitlik({ arkadas }: { arkadas: Profil }) {
  // null while loading.
  const [takvim, setTakvim] = useState<ArkadasTakvimi | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [davetGunu, setDavetGunu] = useState<string | null>(null)

  const gunler = useMemo(() => {
    const bugun = new Date()
    return Array.from({ length: GUN_SAYISI }, (_, i) => toDateString(addDays(bugun, i)))
  }, [])

  useEffect(() => {
    let iptal = false
    setTakvim(null)
    setHata(null)

    arkadasTakvimi(arkadas.id, gunler[0], gunler[gunler.length - 1])
      .then((sonuc) => {
        if (!iptal) setTakvim(sonuc)
      })
      .catch((err) => {
        if (!iptal) setHata(err instanceof Error ? err.message : 'Müsaitlik alınamadı')
      })

    return () => {
      iptal = true
    }
  }, [arkadas.id, gunler])

  const gunBazli = useMemo(() => {
    const harita = new Map<string, MusaitlikBlogu[]>()
    for (const g of gunler) harita.set(g, [])
    for (const b of takvim?.bloklar ?? []) {
      harita.get(b.tarih)?.push(b)
    }
    return harita
  }, [takvim, gunler])

  // Paylaşımı kapatmış bir arkadaşta hiç blok gelmez — bunu "tamamen boş"
  // gibi göstermek yanıltıcı olur, ayrıca belirtiyoruz. Paylaşımı açık ama
  // takvimi bu cihaza henüz ulaşmamış biri de aynı şekilde "bilinmiyor".
  const paylasimKapali = !arkadas.musaitlik_paylas
  const henuzGelmedi = !paylasimKapali && takvim !== null && takvim.bloklar === null

  return (
    <div className="px-4 pt-1 pb-8 space-y-3">
      {hata && (
        <div className="flex items-start gap-2 bg-white border border-rose-200 rounded-xl px-4 py-3">
          <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700">{hata}</p>
        </div>
      )}

      {paylasimKapali && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
          <Icon name="Info" className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            {arkadas.ad} müsaitlik paylaşımını kapatmış. Yine de plan daveti gönderebilirsin.
          </p>
        </div>
      )}

      {henuzGelmedi && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
          <Icon name="Info" className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            {arkadas.ad} takvimini paylaşıyor ama henüz bu cihaza ulaşmadı. Yine de plan daveti gönderebilirsin.
          </p>
        </div>
      )}

      {takvim?.bloklar && <TakvimDurumu takvim={takvim} />}

      {takvim === null && !hata ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-3xl" />
          ))}
        </div>
      ) : (
        gunler.map((gun) => (
          <GunSatiri
            key={gun}
            tarih={gun}
            bloklar={gunBazli.get(gun) ?? []}
            paylasimKapali={paylasimKapali}
            bilinmiyor={henuzGelmedi}
            onDavet={() => setDavetGunu(gun)}
          />
        ))
      )}

      <p className="text-[11px] text-ink-400 text-center pt-2 leading-relaxed">
        Sadece dolu saat aralıkları görünür — {arkadas.ad} o saatte ne yaptığını paylaşmıyor.
      </p>

      {davetGunu && <DavetModal arkadas={arkadas} tarih={davetGunu} onClose={() => setDavetGunu(null)} />}
    </div>
  )
}

// How current the shared calendar is, and the hours they're usually free.
function TakvimDurumu({ takvim }: { takvim: ArkadasTakvimi }) {
  const { guncelleme, pencere } = takvim
  const eski = guncelleme !== null && Date.now() - guncelleme > ESKI_TAKVIM_MS
  const ne = guncelleme === null ? null : formatRelativeTime(guncelleme)
  const parcalar = [
    ne && `Takvimi ${ne === 'şimdi' ? 'az önce' : ne} güncellendi${eski ? '; o zamandan beri değişmiş olabilir' : ''}`,
    pencere && `genelde ${pencere.baslangic}–${pencere.bitis} arası müsait`,
  ].filter(Boolean)
  if (parcalar.length === 0) return null
  return (
    <p className={`flex items-center gap-1.5 text-xs ${eski ? 'text-amber-700' : 'text-ink-400'}`}>
      <Icon name={eski ? 'AlertCircle' : 'RefreshCw'} className="w-3.5 h-3.5 shrink-0" />
      {parcalar.join(' · ')}
    </p>
  )
}

function GunSatiri({
  tarih,
  bloklar,
  paylasimKapali,
  bilinmiyor,
  onDavet,
}: {
  tarih: string
  bloklar: MusaitlikBlogu[]
  paylasimKapali: boolean
  bilinmiyor: boolean
  onDavet: () => void
}) {
  const bilgiYok = paylasimKapali || bilinmiyor
  const bos = bloklar.length === 0
  const etiket = formatDate(tarih) ?? tarih

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink-700">{etiket}</span>
          {!bilgiYok && (
            <span
              className={`chip text-xs py-1 ${
                bos ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {bos ? 'Tamamen müsait' : `${bloklar.length} dolu aralık`}
            </span>
          )}
        </div>
        <button
          onClick={onDavet}
          className="text-xs font-semibold text-brand-600 active:opacity-80 transition-transform shrink-0"
        >
          Davet et
        </button>
      </div>

      {bilgiYok ? (
        <p className="text-xs text-ink-400">
          {paylasimKapali ? 'Müsaitlik bilgisi paylaşılmıyor' : 'Müsaitlik bilgisi henüz yok'}
        </p>
      ) : bos ? (
        <p className="text-xs text-ink-400">Bu gün için kayıtlı planı yok</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {bloklar.map((b) => (
            <span
              key={b.id}
              className="inline-flex items-center gap-1.5 rounded-xl bg-mist-100 border border-ink-100 px-2.5 py-1.5 text-xs font-medium text-ink-500"
            >
              <Icon name="Clock" className="w-3.5 h-3.5 text-ink-400" />
              {b.baslangic.slice(0, 5) === '00:00' && b.bitis.slice(0, 5) >= '23:59'
                ? 'Bütün gün'
                : `${b.baslangic.slice(0, 5)} – ${b.bitis.slice(0, 5)}`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function DavetModal({
  arkadas,
  tarih,
  onClose,
}: {
  arkadas: Profil
  tarih: string
  onClose: () => void
}) {
  useGeriIleKapat(onClose)
  const [baslik, setBaslik] = useState('')
  const [saat, setSaat] = useState('')
  const [sure, setSure] = useState('')
  const [tumGun, setTumGun] = useState(false)
  const [konum, setKonum] = useState('')
  const [mesaj, setMesaj] = useState('')
  const [emoji, setEmoji] = useState<string | null>(null)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [basarili, setBasarili] = useState(false)

  async function gonder() {
    if (!baslik.trim()) {
      setHata('Bir başlık yaz — arkadaşın neye davet edildiğini görmeli.')
      return
    }
    setGonderiliyor(true)
    setHata(null)
    try {
      await planiKur(
        {
          baslik: baslik.trim(),
          tarih,
          saat: saat || null,
          sure: sure ? Number(sure) : null,
          tumGun,
          konum: konum.trim() || null,
          not: mesaj.trim() || null,
          emoji,
        },
        { tur: 'arkadaslar', kisiler: [arkadas] },
      )
      setBasarili(true)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Davet gönderilemedi')
    } finally {
      setGonderiliyor(false)
    }
  }

  if (basarili) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/40 animate-fade-in px-4">
        <div className="card w-full max-w-sm p-6 text-center animate-slide-up">
          <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
            <Icon name="CheckCircle2" className="w-7 h-7 text-teal-600" />
          </div>
          <p className="text-title text-ink-800 mb-1">Davet gönderildi</p>
          <p className="text-sm text-ink-400 mb-5">
            Plan takvimine eklendi. {arkadas.ad} kabul ederse onun takvimine de düşecek.
          </p>
          <button onClick={onClose} className="btn-primary w-full">
            Tamam
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink-900/40 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm mx-4 mb-4 sm:mb-0 p-5 animate-slide-up max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center shrink-0">
            <Icon name="CalendarClock" className="w-5 h-5 text-bolum-koyu" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-ink-700 truncate">{arkadas.ad} davet et</h3>
            <p className="text-xs text-ink-400">{formatDate(tarih) ?? tarih}</p>
          </div>
        </div>

        <FieldLabel>Ne yapacaksınız?</FieldLabel>
        <input
          value={baslik}
          onChange={(e) => setBaslik(e.target.value)}
          placeholder="Akşam yemeği"
          className="input-field mb-4"
          autoFocus
        />

        <FieldLabel>Simge</FieldLabel>
        <div className="mb-4">
          <EmojiSecici secenekler={ETKINLIK_EMOJILERI} secili={emoji} onSec={setEmoji} />
        </div>

        {!tumGun && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <FieldLabel>Saat</FieldLabel>
              <input type="time" value={saat} onChange={(e) => setSaat(e.target.value)} className="input-field" />
            </div>
            <div>
              <FieldLabel>Süre (dk)</FieldLabel>
              <input
                type="number"
                value={sure}
                onChange={(e) => setSure(e.target.value)}
                placeholder="90"
                min="0"
                className="input-field"
              />
            </div>
          </div>
        )}
        <div className="mb-4">
          <TumGunAnahtari acik={tumGun} onDegistir={setTumGun} />
        </div>

        <FieldLabel>Nerede</FieldLabel>
        <input
          value={konum}
          onChange={(e) => setKonum(e.target.value)}
          placeholder="Opsiyonel"
          className="input-field mb-4"
        />

        <FieldLabel>Mesaj</FieldLabel>
        <textarea
          value={mesaj}
          onChange={(e) => setMesaj(e.target.value)}
          placeholder="Opsiyonel bir not..."
          rows={2}
          className="input-field resize-none mb-4"
        />

        {hata && (
          <div className="flex items-start gap-2 bg-white border border-rose-200 rounded-xl px-4 py-3 mb-4">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1 border border-ink-100" disabled={gonderiliyor}>
            Vazgeç
          </button>
          <button
            onClick={gonder}
            disabled={gonderiliyor}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {gonderiliyor ? (
              <>
                <Icon name="Loader2" className="w-5 h-5 animate-spin" />
                Gönderiliyor
              </>
            ) : (
              <>
                <Icon name="Send" className="w-4 h-4" />
                Gönder
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-label text-ink-500 mb-2">
      {children}
    </label>
  )
}

