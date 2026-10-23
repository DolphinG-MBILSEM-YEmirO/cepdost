import { useCallback, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { AniGorseli } from './AniGorseli'
import { AniPenceresi } from './AniPenceresi'
import { useArsivAnilari } from './useArsivAnilari'
import { aniEkle, aniSil, type Ani } from '../sosyal/gruplar'
import type { Gizlilik, Profil } from '../sosyal/api'
import type { AniEtkilesimi } from '../sosyal/aniEtkilesimi'
import { arsivYerleri, aylaraBol, yerdekiAnilar } from '../lib/aniArsivi'
import { formatDate, toDateString } from '../lib/format'
import { useGeriIleKapat } from '../lib/geriTusu'
import { UYGULAMA_ADI } from '../../shared/marka'

// "Gidilen mekana özel foto yükleyip gidilen kişi veya grubun arşivine
// ekleme" — ortak hafıza. Bir grubun ya da bir arkadaşın arşivine bağlanır.
// Laid out by month, filterable by place; a photo opens large with its
// reactions and comments, and the arrows step through what's shown.
interface Props {
  grupId?: string | null
  arkadasId?: string | null
  benimId: string
  baslik: string
}

export function AniArsivi({ grupId, arkadasId, benimId, baslik }: Props) {
  // Memories and answers friends add show up after the next sync.
  const { arsiv, ulasilamaz, tazele } = useArsivAnilari(grupId, arkadasId)
  const [ekleAcik, setEkleAcik] = useState(false)
  const [yer, setYer] = useState<string | null>(null)
  const [acikId, setAcikId] = useState<string | null>(null)
  const kapat = useCallback(() => setAcikId(null), [])

  const anilar = useMemo(() => arsiv?.anilar ?? [], [arsiv])
  const yerler = useMemo(() => arsivYerleri(anilar), [anilar])
  // A place that's gone (its last photo deleted) stops filtering.
  const seciliYer = yer && yerdekiAnilar(anilar, yer).length > 0 ? yer : null
  const aylar = useMemo(() => aylaraBol(yerdekiAnilar(anilar, seciliYer)), [anilar, seciliYer])
  // What the arrows step through: what's on screen, in its order.
  const gorunenler = useMemo(() => aylar.flatMap((a) => a.anilar), [aylar])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Icon name="ImageIcon" className="w-4 h-4 text-ink-400" />
          <h2 className="text-sm font-semibold text-ink-500">Anılar</h2>
          {arsiv && <span className="text-xs text-ink-400">{anilar.length}</span>}
        </div>
        <button
          onClick={() => setEkleAcik(true)}
          className="text-xs font-semibold text-orchid-600 active:scale-95 transition-transform"
        >
          Fotoğraf ekle
        </button>
      </div>

      {ulasilamaz && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
          <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700">Anılar alınamadı.</p>
        </div>
      )}

      {yerler.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" role="group" aria-label="Mekana göre süz">
          {[{ ad: null, sayi: anilar.length }, ...yerler].map((y) => {
            const secili = y.ad === seciliYer
            return (
              <button
                key={y.ad ?? ''}
                onClick={() => setYer(y.ad)}
                aria-pressed={secili}
                className={`chip text-xs shrink-0 ${secili ? 'bg-gradient-orchid text-white' : 'bg-mist-50 text-ink-500 border border-ink-100'}`}
              >
                {y.ad ? <Icon name="MapPin" className="w-3.5 h-3.5" /> : null}
                {y.ad ?? 'Hepsi'}
                <span className={secili ? 'text-white/80' : 'text-ink-300'}>{y.sayi}</span>
              </button>
            )
          })}
        </div>
      )}

      {!arsiv && !ulasilamaz ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-36 rounded-2xl" />
          <div className="skeleton h-36 rounded-2xl" />
        </div>
      ) : arsiv && anilar.length === 0 ? (
        <div className="card p-5 text-center">
          <p className="text-sm text-ink-400">
            Henüz anı yok. Birlikte gittiğiniz bir mekanın fotoğrafını ekleyerek başla.
          </p>
        </div>
      ) : (
        aylar.map((ay) => (
          <section key={ay.ay} aria-label={ay.baslik} className="space-y-2">
            <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wide px-1 pt-1">{ay.baslik}</h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {ay.anilar.map((a) => (
                <AniKarti
                  key={a.id}
                  ani={a}
                  benimId={benimId}
                  etkilesim={arsiv?.etkilesimler.get(a.id)}
                  profiller={arsiv?.profiller}
                  onAc={() => setAcikId(a.id)}
                  onSilindi={tazele}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {acikId && arsiv && (
        <AniPenceresi
          anilar={gorunenler}
          baslangicId={acikId}
          baslik={baslik}
          etkilesimler={arsiv.etkilesimler}
          profiller={arsiv.profiller}
          benimId={benimId}
          onKapat={kapat}
        />
      )}

      {ekleAcik && (
        <AniEkleModal
          grupId={grupId}
          arkadasId={arkadasId}
          hedefAdi={baslik}
          onClose={() => setEkleAcik(false)}
          onEklendi={async () => {
            setEkleAcik(false)
            await tazele()
          }}
        />
      )}
    </div>
  )
}

function AniKarti({
  ani,
  benimId,
  etkilesim,
  profiller,
  onAc,
  onSilindi,
}: {
  ani: Ani
  benimId: string
  etkilesim?: AniEtkilesimi
  profiller?: Map<string, Profil>
  onAc: () => void
  onSilindi: () => Promise<void>
}) {
  const [onay, setOnay] = useState(false)
  const benim = ani.sahip_id === benimId
  const kim = benim ? 'Sen' : (profiller?.get(ani.sahip_id)?.ad ?? 'Bir arkadaşın')
  const tepki = etkilesim?.tepkiler.length ?? 0
  const yorum = etkilesim?.yorumlar.length ?? 0

  return (
    <div className="card overflow-hidden relative">
      <button
        onClick={onAc}
        aria-label={`${ani.mekan_adi}, ${kim}`}
        className="block w-full text-left active:scale-[0.98] transition-transform"
      >
        <div className="aspect-square bg-mist-100">
          <AniGorseli ani={ani} />
        </div>
        <div className="p-3">
          <p className="text-sm font-semibold text-ink-700 truncate">{ani.mekan_adi}</p>
          <p className="text-xs text-ink-400 truncate">
            {formatDate(ani.tarih) ?? ani.tarih} · {kim}
          </p>
          {ani.notlar && <p className="text-xs text-ink-400 mt-1 line-clamp-2">{ani.notlar}</p>}
          {(tepki > 0 || yorum > 0) && (
            <p className="flex items-center gap-2.5 text-[11px] text-ink-400 mt-1.5">
              {tepki > 0 && (
                <span className="flex items-center gap-0.5">
                  <Icon name="SmilePlus" className="w-3 h-3" />
                  {tepki}
                </span>
              )}
              {yorum > 0 && (
                <span className="flex items-center gap-0.5">
                  <Icon name="MessageCircle" className="w-3 h-3" />
                  {yorum}
                </span>
              )}
            </p>
          )}
        </div>
      </button>
      {benim && (
        <button
          onClick={async () => {
            if (!onay) {
              setOnay(true)
              setTimeout(() => setOnay(false), 3000)
              return
            }
            await aniSil(ani)
            await onSilindi()
          }}
          aria-label={onay ? 'Silmek için tekrar dokun' : 'Anıyı sil'}
          className={`absolute top-2 right-2 rounded-lg flex items-center justify-center active:scale-90 transition-all ${
            onay ? 'bg-rose-500 text-white px-2 h-7 text-xs font-semibold' : 'w-7 h-7 bg-ink-900/40 text-white'
          }`}
        >
          {onay ? 'Sil' : <Icon name="Trash2" className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  )
}

// Dışa açık: geçmiş bir plandan da açılabiliyor (bkz. RecordDetail'deki
// "Nasıl geçti?" çağrısı) — o zaman mekan ve tarih plandan önden doluyor.
export function AniEkleModal({
  grupId,
  arkadasId,
  hedefAdi,
  baslangicMekan,
  baslangicTarih,
  onClose,
  onEklendi,
}: {
  grupId?: string | null
  arkadasId?: string | null
  hedefAdi: string
  baslangicMekan?: string | null
  baslangicTarih?: string | null
  onClose: () => void
  onEklendi: () => Promise<void>
}) {
  useGeriIleKapat(onClose)
  const [mekan, setMekan] = useState(baslangicMekan ?? '')
  const [tarih, setTarih] = useState(baslangicTarih || toDateString(new Date()))
  const [notlar, setNotlar] = useState('')
  // Varsayılan bilinçli olarak dar: paylaşım genişletmek kullanıcının
  // aktif tercihi olmalı, kazara olmamalı.
  const [gorunurluk, setGorunurluk] = useState<Gizlilik>('arkadaslar')
  const [dosya, setDosya] = useState<File | null>(null)
  const [onizleme, setOnizleme] = useState<string | null>(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const dosyaRef = useRef<HTMLInputElement>(null)

  function dosyaSecildi(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setHata('Lütfen bir görsel seç.')
      return
    }
    // Kovadaki sınır 8MB — kullanıcıyı yükleme başarısız olana kadar
    // bekletmek yerine burada uyarıyoruz.
    if (f.size > 8 * 1024 * 1024) {
      setHata('Fotoğraf 8MB’dan küçük olmalı.')
      return
    }
    setHata(null)
    setDosya(f)
    if (onizleme) URL.revokeObjectURL(onizleme)
    setOnizleme(URL.createObjectURL(f))
  }

  async function kaydet() {
    if (!dosya) {
      setHata('Bir fotoğraf seç.')
      return
    }
    if (!mekan.trim()) {
      setHata('Mekan adı gerekli.')
      return
    }
    setYukleniyor(true)
    setHata(null)
    try {
      await aniEkle({ grupId, arkadasId, mekanAdi: mekan, tarih, notlar, gorunurluk, dosya })
      await onEklendi()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Eklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm mx-4 mb-4 sm:mb-0 p-5 animate-slide-up max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-ink-700 mb-1">Anı ekle</h3>
        <p className="text-xs text-ink-400 mb-4">{hedefAdi} arşivine eklenecek</p>

        <input ref={dosyaRef} type="file" accept="image/*" onChange={dosyaSecildi} className="hidden" />
        <button
          onClick={() => dosyaRef.current?.click()}
          className="w-full aspect-[4/3] rounded-2xl border-2 border-dashed border-ink-200 bg-mist-100 flex flex-col items-center justify-center gap-2 active:scale-[0.98] transition-transform overflow-hidden mb-4"
        >
          {onizleme ? (
            <img src={onizleme} alt="Seçilen" className="w-full h-full object-cover" />
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-orchid-100 flex items-center justify-center">
                <Icon name="ImageIcon" className="w-6 h-6 text-orchid-500" />
              </div>
              <p className="text-sm font-medium text-ink-500">Fotoğraf seç</p>
            </>
          )}
        </button>

        <FieldLabel>Mekan</FieldLabel>
        <input
          value={mekan}
          onChange={(e) => setMekan(e.target.value)}
          placeholder="Moda Sahili"
          className="input-field mb-4"
        />

        <FieldLabel>Tarih</FieldLabel>
        <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} className="input-field mb-4" />

        <FieldLabel>Not</FieldLabel>
        <textarea
          value={notlar}
          onChange={(e) => setNotlar(e.target.value)}
          placeholder="Opsiyonel"
          rows={2}
          className="input-field resize-none mb-4"
        />

        <FieldLabel>Kim görsün?</FieldLabel>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setGorunurluk('arkadaslar')}
            className={`flex-1 rounded-xl py-2.5 text-xs font-semibold transition-all active:scale-95 ${
              gorunurluk === 'arkadaslar'
                ? 'bg-gradient-orchid text-white'
                : 'bg-mist-100 text-ink-400 border border-ink-100'
            }`}
          >
            {hedefAdi}
          </button>
          <button
            onClick={() => setGorunurluk('herkes')}
            className={`flex-1 rounded-xl py-2.5 text-xs font-semibold transition-all active:scale-95 ${
              gorunurluk === 'herkes'
                ? 'bg-sky-500 text-white'
                : 'bg-mist-100 text-ink-400 border border-ink-100'
            }`}
          >
            Herkes
          </button>
        </div>
        {gorunurluk === 'herkes' && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
            Bu fotoğraf Keşfet'te tüm {UYGULAMA_ADI} kullanıcılarına görünecek. Mekan adı da paylaşılıyor.
          </p>
        )}

        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mb-4">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={yukleniyor} className="btn-ghost flex-1 border border-ink-100">
            Vazgeç
          </button>
          <button
            onClick={() => void kaydet()}
            disabled={yukleniyor}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {yukleniyor ? (
              <>
                <Icon name="Loader2" className="w-5 h-5 animate-spin" />
                Yükleniyor
              </>
            ) : (
              'Ekle'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
      {children}
    </label>
  )
}
