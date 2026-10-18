import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { AniGorseli } from './AniGorseli'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { aniEkle, aniSil, anilariGetir, type Ani } from '../sosyal/gruplar'
import type { Gizlilik } from '../sosyal/api'
import { formatDate, toDateString } from '../lib/format'

// "Gidilen mekana özel foto yükleyip gidilen kişi veya grubun arşivine
// ekleme" — ortak hafıza. Bir grubun ya da bir arkadaşın arşivine bağlanır.
interface Props {
  grupId?: string | null
  arkadasId?: string | null
  benimId: string
  baslik: string
}

export function AniArsivi({ grupId, arkadasId, benimId, baslik }: Props) {
  const [anilar, setAnilar] = useState<Ani[] | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [ekleAcik, setEkleAcik] = useState(false)
  // Memories friends add show up after the next sync without reopening.
  const sosyalSurum = useSosyalSurum()

  const tazele = useCallback(async () => {
    setHata(null)
    try {
      setAnilar(await anilariGetir({ grupId, arkadasId }))
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Anılar alınamadı')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupId, arkadasId, sosyalSurum])

  useEffect(() => {
    void tazele()
  }, [tazele])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Icon name="ImageIcon" className="w-4 h-4 text-ink-400" />
          <h2 className="text-sm font-semibold text-ink-500">Anılar</h2>
          {anilar && <span className="text-xs text-ink-400">{anilar.length}</span>}
        </div>
        <button
          onClick={() => setEkleAcik(true)}
          className="text-xs font-semibold text-orchid-600 active:scale-95 transition-transform"
        >
          Fotoğraf ekle
        </button>
      </div>

      {hata && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
          <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700">{hata}</p>
        </div>
      )}

      {anilar === null ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-36 rounded-2xl" />
          <div className="skeleton h-36 rounded-2xl" />
        </div>
      ) : anilar.length === 0 ? (
        <div className="card p-5 text-center">
          <p className="text-sm text-ink-400">
            Henüz anı yok. Birlikte gittiğiniz bir mekanın fotoğrafını ekleyerek başla.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {anilar.map((a) => (
            <AniKarti key={a.id} ani={a} benimId={benimId} onSilindi={tazele} />
          ))}
        </div>
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

function AniKarti({ ani, benimId, onSilindi }: { ani: Ani; benimId: string; onSilindi: () => Promise<void> }) {
  const [onay, setOnay] = useState(false)

  return (
    <div className="card overflow-hidden">
      <div className="aspect-square bg-mist-100 relative">
        <AniGorseli ani={ani} />
        {ani.sahip_id === benimId && (
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
            className={`absolute top-2 right-2 rounded-lg flex items-center justify-center active:scale-90 transition-all ${
              onay ? 'bg-rose-500 text-white px-2 h-7 text-xs font-semibold' : 'w-7 h-7 bg-ink-900/40 text-white'
            }`}
          >
            {onay ? 'Sil' : <Icon name="Trash2" className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-ink-700 truncate">{ani.mekan_adi}</p>
        <p className="text-xs text-ink-400">{formatDate(ani.tarih) ?? ani.tarih}</p>
        {ani.notlar && <p className="text-xs text-ink-400 mt-1 line-clamp-2">{ani.notlar}</p>}
      </div>
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
            Bu fotoğraf Keşfet'te tüm CepDost kullanıcılarına görünecek. Mekan adı da paylaşılıyor.
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
