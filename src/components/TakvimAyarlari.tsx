import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Icon } from './Icon'
import { db } from '../db'
import {
  icsiIceAktar,
  icsUrldenIceAktar,
  takvimAyariOku,
  takvimAyariYaz,
  takvimBaglantisiniKaldir,
  type TakvimAyari,
} from '../takvim'
import { formatRelativeTime } from '../lib/format'
import { UYGULAMA_ADI } from '../../shared/marka'

// F15 — takvim erişimi. İzin açıkça kullanıcıdan alınıyor: anahtar kapalıyken
// hiçbir adres saklanmıyor, hiçbir etkinlik içe aktarılmıyor, kapatıldığında
// içeri alınmış her şey siliniyor.
export function TakvimAyarlari({ onDegisti }: { onDegisti?: () => void }) {
  const [ayar, setAyar] = useState<TakvimAyari>(() => takvimAyariOku())
  const [url, setUrl] = useState(() => takvimAyariOku().icsUrl ?? '')
  const [calisiyor, setCalisiyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)
  const dosyaRef = useRef<HTMLInputElement>(null)

  const etkinlikSayisi = useLiveQuery(() => db.takvimEtkinlikleri.count(), [], 0)

  function kaydet(yeni: TakvimAyari) {
    takvimAyariYaz(yeni)
    setAyar(yeni)
  }

  async function izniDegistir() {
    setHata(null)
    setBilgi(null)
    if (ayar.izin) {
      setCalisiyor(true)
      try {
        await takvimBaglantisiniKaldir()
        setAyar(takvimAyariOku())
        setUrl('')
        onDegisti?.()
      } finally {
        setCalisiyor(false)
      }
    } else {
      kaydet({ ...ayar, izin: true })
    }
  }

  async function iceAktar(kaynak: () => Promise<number>) {
    setCalisiyor(true)
    setHata(null)
    setBilgi(null)
    try {
      const sayi = await kaynak()
      // Re-read the stored settings: the caller may have just saved a new
      // calendar URL, and the `ayar` captured by this closure predates it.
      kaydet({ ...takvimAyariOku(), izin: true, sonSenkron: Date.now(), sonHata: null })
      setBilgi(
        sayi === 0
          ? 'Takvim okundu ama önümüzdeki 90 günde etkinlik yok.'
          : `${sayi} etkinlik içe aktarıldı.`,
      )
      onDegisti?.()
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : 'Takvim alınamadı'
      setHata(mesaj)
      kaydet({ ...takvimAyariOku(), sonHata: mesaj })
    } finally {
      setCalisiyor(false)
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center">
          <Icon name="CalendarPlus" className="w-5 h-5 text-bolum-koyu" />
        </div>
        <h2 className="font-semibold text-ink-700">Telefon takvimin</h2>
      </div>

      <p className="text-sm text-ink-400 mb-4">
        Takvimini bağlarsan {UYGULAMA_ADI} dolu saatlerini bilir: arkadaşların müsaitliğine
        doğru görünürsün ve yapay zekâ ortak plan yaparken derse/işe denk gelen
        saatleri önermez.
      </p>

      <button
        onClick={() => void izniDegistir()}
        disabled={calisiyor}
        className="w-full flex items-center gap-3 text-left active:opacity-80 transition-transform disabled:opacity-60 mb-4"
      >
        <div
          className={`w-11 h-6 rounded-full transition-colors shrink-0 relative ${
            ayar.izin ? 'bg-brand-600' : 'bg-ink-200'
          }`}
        >
          <div
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-soft transition-all ${
              ayar.izin ? 'left-[1.375rem]' : 'left-0.5'
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-600">Takvimime erişebilirsin</p>
          <p className="text-xs text-ink-400">
            {ayar.izin
              ? 'Kapatırsan içe aktarılan tüm etkinlikler silinir.'
              : 'Açmadan hiçbir takvim verisi okunmaz.'}
          </p>
        </div>
      </button>

      {ayar.izin && (
        <div className="space-y-3">
          <div className="bg-mist-100 rounded-2xl p-4">
            {/* Etikette ".ics" yazmıyor: uppercase + Türkçe yerelde "i"
                "İ"ye dönüşüp ".İCS" gibi görünüyordu. */}
            <p className="text-label text-ink-500 mb-2">
              Takvim bağlantısı
            </p>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://calendar.google.com/.../basic.ics"
              inputMode="url"
              className="input-field text-sm mb-2"
            />
            <button
              onClick={() => {
                const temiz = url.trim()
                if (!temiz) {
                  setHata('Önce takvim bağlantısını yapıştır.')
                  return
                }
                kaydet({ ...ayar, icsUrl: temiz })
                void iceAktar(() => icsUrldenIceAktar(temiz))
              }}
              disabled={calisiyor}
              className="btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Icon
                name={calisiyor ? 'Loader2' : 'RefreshCw'}
                className={`w-4 h-4 ${calisiyor ? 'animate-spin' : ''}`}
              />
              {ayar.sonSenkron ? 'Yeniden içe aktar' : 'İçe aktar'}
            </button>

            <p className="text-[11px] text-ink-400 mt-2.5 leading-relaxed">
              Google Takvim → Ayarlar → takvimini seç → "Gizli adres (iCal biçimi)".
              Bu adres bir şifre gibidir, kimseyle paylaşma.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="h-px bg-ink-100 flex-1" />
            <span className="text-[11px] text-ink-400">ya da</span>
            <div className="h-px bg-ink-100 flex-1" />
          </div>

          <button
            onClick={() => dosyaRef.current?.click()}
            disabled={calisiyor}
            className="btn-ghost w-full border border-ink-100 text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Icon name="Download" className="w-4 h-4" />
            .ics dosyası seç
          </button>
          <input
            ref={dosyaRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={(e) => {
              const dosya = e.target.files?.[0]
              if (dosyaRef.current) dosyaRef.current.value = ''
              if (dosya) void iceAktar(async () => icsiIceAktar(await dosya.text()))
            }}
          />

          {(ayar.sonSenkron || etkinlikSayisi > 0) && (
            <div className="flex items-center gap-2 text-xs text-ink-400 px-1">
              <Icon name="CheckCircle2" className="w-4 h-4 text-teal-500 shrink-0" />
              <span>
                {etkinlikSayisi} etkinlik
                {ayar.sonSenkron && ` · ${formatRelativeTime(ayar.sonSenkron)} güncellendi`}
              </span>
            </div>
          )}
        </div>
      )}

      {bilgi && (
        <div className="flex items-start gap-2 bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3 mt-3">
          <Icon name="CheckCircle2" className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
          <p className="text-sm text-teal-800">{bilgi}</p>
        </div>
      )}

      {hata && (
        <div className="flex items-start gap-2 bg-white border border-rose-200 rounded-xl px-4 py-3 mt-3">
          <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700">{hata}</p>
        </div>
      )}

      <p className="text-[11px] text-ink-400 mt-4 leading-relaxed">
        Etkinlikler yalnızca telefonunda saklanır. Arkadaşlarına giden tek şey, tıpkı{' '}
        {UYGULAMA_ADI} planlarında olduğu gibi, dolu saat aralıkları — etkinliğin adı ya da
        yeri asla gönderilmez.
      </p>
    </div>
  )
}

// Otomatik yenileme: uygulama her açıldığında, izin varsa ve bağlantı
// kayıtlıysa takvimi sessizce tazeler. Kullanıcı elle "içe aktar"a basmak
// zorunda kalmasın; hata olursa da ekranda gürültü yapmasın.
const YENILEME_ARALIGI_MS = 6 * 60 * 60 * 1000

export function useTakvimOtomatikYenile(onDegisti?: () => void): void {
  useEffect(() => {
    const ayar = takvimAyariOku()
    if (!ayar.izin || !ayar.icsUrl) return
    if (ayar.sonSenkron && Date.now() - ayar.sonSenkron < YENILEME_ARALIGI_MS) return

    let iptal = false
    icsUrldenIceAktar(ayar.icsUrl)
      .then(() => {
        if (iptal) return
        takvimAyariYaz({ ...ayar, sonSenkron: Date.now(), sonHata: null })
        onDegisti?.()
      })
      .catch((err) => {
        if (iptal) return
        takvimAyariYaz({
          ...ayar,
          sonHata: err instanceof Error ? err.message : 'Takvim alınamadı',
        })
      })

    return () => {
      iptal = true
    }
  }, [onDegisti])
}
