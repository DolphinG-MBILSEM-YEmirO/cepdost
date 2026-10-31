import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { db } from '../db'
import { toDateString } from '../lib/format'
import { useGeriIleKapat } from '../lib/geriTusu'
import { videoHazirla, VIDEO_AZAMI_SANIYE, type HazirVideo } from '../lib/videoHazirla'
import { AZAMI_MEDYA, AZAMI_PUAN, aniEkle, gruplarimiGetir, type Grup, type YeniMedya } from '../sosyal/gruplar'
import { UYGULAMA_ADI } from '../../shared/marka'

// A post about a place: up to six photos and clips, a star rating, a note
// and who sees it. It is stored as a memory (sosyal/gruplar.ts), so the
// feed, the answers and "I want to go too" all work on it as they do on
// memories. Clips are shrunk on the device first (lib/videoHazirla.ts).

// Who sees the post: all my friends, everyone (also Keşfet), or one group.
type Kitle = { tur: 'arkadaslarim' } | { tur: 'herkes' } | { tur: 'grup'; grupId: string }

type Oge =
  | { anahtar: string; tur: 'foto'; dosya: File; onizleme: string }
  | { anahtar: string; tur: 'video'; video: HazirVideo; onizleme: string }

// A photo larger than this is refused before shrinking.
const FOTO_AZAMI_DOSYA = 15 * 1024 * 1024

let sayac = 0
const yeniAnahtar = () => `oge-${++sayac}`

const PUAN_ETIKETLERI = ['', 'Hiç beğenmedim', 'İdare eder', 'Fena değil', 'Çok iyi', 'Bayıldım']

// Place names from my plans, newest first, as typing suggestions.
async function mekanOnerileri(): Promise<string[]> {
  const kayitlar = await db.kayitlar.orderBy('olusturulmaTarihi').reverse().limit(80).toArray()
  const adlar = kayitlar.flatMap((k) => [k.mekanOnerisi, k.konum]).filter((a): a is string => !!a?.trim())
  return [...new Set(adlar.map((a) => a.trim()))].slice(0, 20)
}

export function PaylasimOlustur({ onKapat, onPaylasildi }: { onKapat: () => void; onPaylasildi: () => void }) {
  useGeriIleKapat(onKapat)
  const [ogeler, setOgeler] = useState<Oge[]>([])
  const [mekan, setMekan] = useState('')
  const [puan, setPuan] = useState<number | null>(null)
  const [notlar, setNotlar] = useState('')
  const [tarih, setTarih] = useState(() => toDateString(new Date()))
  // Narrow by default: sharing wider is a deliberate choice.
  const [kitle, setKitle] = useState<Kitle>({ tur: 'arkadaslarim' })
  const [gruplar, setGruplar] = useState<Grup[]>([])
  const [oneriler, setOneriler] = useState<string[]>([])
  // Clip being shrunk: how far along it is (0-1).
  const [videoIlerleme, setVideoIlerleme] = useState<number | null>(null)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const fotoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const ogelerRef = useRef(ogeler)
  ogelerRef.current = ogeler

  useEffect(() => {
    gruplarimiGetir().then(setGruplar).catch(() => {})
    mekanOnerileri().then(setOneriler).catch(() => {})
  }, [])

  // Previews are object URLs; free them when the sheet closes.
  useEffect(() => () => ogelerRef.current.forEach((o) => URL.revokeObjectURL(o.onizleme)), [])

  const yer = AZAMI_MEDYA - ogeler.length
  const videoVar = ogeler.some((o) => o.tur === 'video')

  function fotolarSecildi(e: React.ChangeEvent<HTMLInputElement>) {
    const dosyalar = [...(e.target.files ?? [])]
    e.target.value = ''
    const uygun = dosyalar.filter((f) => f.type.startsWith('image/') && f.size <= FOTO_AZAMI_DOSYA)
    if (uygun.length < dosyalar.length) setHata('Bazı dosyalar eklenmedi: yalnızca 15 MB’tan küçük fotoğraflar.')
    else setHata(null)
    const yeni = uygun.slice(0, yer).map((dosya): Oge => ({
      anahtar: yeniAnahtar(),
      tur: 'foto',
      dosya,
      onizleme: URL.createObjectURL(dosya),
    }))
    if (uygun.length > yer) setHata(`En fazla ${AZAMI_MEDYA} fotoğraf ya da video ekleyebilirsin.`)
    setOgeler((o) => [...o, ...yeni])
  }

  async function videoSecildi(e: React.ChangeEvent<HTMLInputElement>) {
    const dosya = e.target.files?.[0]
    e.target.value = ''
    if (!dosya) return
    setHata(null)
    setVideoIlerleme(0)
    try {
      const video = await videoHazirla(dosya, setVideoIlerleme)
      const onizleme = URL.createObjectURL(new Blob([video.bayt.slice().buffer as ArrayBuffer], { type: video.tip }))
      setOgeler((o) => [...o, { anahtar: yeniAnahtar(), tur: 'video', video, onizleme }])
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Video eklenemedi.')
    } finally {
      setVideoIlerleme(null)
    }
  }

  function kaldir(anahtar: string) {
    setOgeler((liste) => {
      const o = liste.find((x) => x.anahtar === anahtar)
      if (o) URL.revokeObjectURL(o.onizleme)
      return liste.filter((x) => x.anahtar !== anahtar)
    })
  }

  // Moves an item to the front: the first one is the cover.
  function kapakYap(anahtar: string) {
    setOgeler((liste) => {
      const o = liste.find((x) => x.anahtar === anahtar)
      return o ? [o, ...liste.filter((x) => x !== o)] : liste
    })
  }

  async function paylas() {
    const ilk = ogeler[0]
    if (!ilk) return setHata('En az bir fotoğraf ya da video ekle.')
    if (!mekan.trim()) return setHata('Nerede olduğunu yaz.')
    setGonderiliyor(true)
    setHata(null)
    try {
      const kapak = ilk.tur === 'foto' ? ilk.dosya : ilk.video.kapak
      const medya: YeniMedya[] = ogeler.map((o) =>
        o.tur === 'foto' ? { tur: 'foto', dosya: o.dosya } : { tur: 'video', bayt: o.video.bayt, tip: o.video.tip },
      )
      await aniEkle({
        mekanAdi: mekan,
        tarih,
        notlar,
        puan,
        dosya: kapak,
        medya,
        gorunurluk: kitle.tur === 'herkes' ? 'herkes' : 'arkadaslar',
        grupId: kitle.tur === 'grup' ? kitle.grupId : null,
        arkadaslarim: kitle.tur !== 'grup',
      })
      onPaylasildi()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Paylaşılamadı')
    } finally {
      setGonderiliyor(false)
    }
  }

  const mesgul = gonderiliyor || videoIlerleme !== null

  return (
    <div className="panel-tam z-[65]" data-bolum="akis" role="dialog" aria-label="Yeni paylaşım">
      <div className="flex items-center gap-3 px-4 pt-[calc(1rem+var(--safe-top))] pb-3 shrink-0">
        <button
          onClick={onKapat}
          aria-label="Kapat"
          className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-ink-50 active:bg-ink-100 shrink-0"
        >
          <Icon name="X" className="w-5 h-5 text-ink-500" />
        </button>
        <h2 className="flex-1 text-lg font-extrabold text-bolum">Yeni paylaşım</h2>
        <button
          onClick={() => void paylas()}
          disabled={mesgul || ogeler.length === 0}
          className="btn-primary px-5 py-2.5 flex items-center gap-2"
        >
          {gonderiliyor ? <Icon name="Loader2" className="w-4 h-4 animate-spin" /> : <Icon name="Send" className="w-4 h-4" />}
          {gonderiliyor ? 'Gönderiliyor' : 'Paylaş'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-[calc(2rem+var(--safe-bottom))]">
        <div className="max-w-md mx-auto space-y-5 kademeli">
          {/* Media: the strip of what's picked, then the two add buttons. */}
          <section>
            <input ref={fotoRef} type="file" accept="image/*" multiple onChange={fotolarSecildi} className="hidden" />
            <input ref={videoRef} type="file" accept="video/*" onChange={(e) => void videoSecildi(e)} className="hidden" />

            {ogeler.length > 0 && (
              <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                {ogeler.map((o, i) => (
                  <div
                    key={o.anahtar}
                    className="relative shrink-0 w-28 h-36 rounded-2xl overflow-hidden bg-mist-100 snap-start animate-pop-in shadow-card"
                  >
                    {o.tur === 'foto' ? (
                      <img src={o.onizleme} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <video src={o.onizleme} muted playsInline loop autoPlay className="w-full h-full object-cover" />
                    )}
                    {o.tur === 'video' && (
                      <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-ink-900/60 text-white text-[10px] font-semibold px-1.5 py-0.5">
                        <Icon name="Video" className="w-3 h-3" />
                        {Math.round(o.video.sure)} sn
                      </span>
                    )}
                    {i === 0 ? (
                      <span className="absolute top-1.5 left-1.5 rounded-full bg-bolum text-white text-[10px] font-bold px-2 py-0.5">
                        Kapak
                      </span>
                    ) : (
                      <button
                        onClick={() => kapakYap(o.anahtar)}
                        className="absolute top-1.5 left-1.5 rounded-full bg-ink-900/50 text-white text-[10px] font-semibold px-2 py-0.5"
                      >
                        Kapak yap
                      </button>
                    )}
                    <button
                      onClick={() => kaldir(o.anahtar)}
                      aria-label="Kaldır"
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-ink-900/60 text-white flex items-center justify-center"
                    >
                      <Icon name="X" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {videoIlerleme !== null && (
              <div className="card p-3 mb-2 flex items-center gap-3 animate-fade-in" aria-live="polite">
                <Icon name="Loader2" className="w-5 h-5 animate-spin text-bolum-koyu shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink-700">Video hazırlanıyor</p>
                  <div className="h-1.5 rounded-full bg-ink-100 mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-bolum rounded-full transition-[width] duration-300"
                      style={{ width: `${Math.round(videoIlerleme * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {ogeler.length === 0 && videoIlerleme === null ? (
              <div className="grid grid-cols-2 gap-3">
                <MedyaDugmesi ikon="ImageIcon" etiket="Fotoğraf ekle" alt={`En fazla ${AZAMI_MEDYA}`} onClick={() => fotoRef.current?.click()} buyuk />
                <MedyaDugmesi ikon="Video" etiket="Video ekle" alt={`${VIDEO_AZAMI_SANIYE} sn'ye kadar`} onClick={() => videoRef.current?.click()} buyuk />
              </div>
            ) : (
              yer > 0 && (
                <div className="flex gap-2">
                  <MedyaDugmesi ikon="ImageIcon" etiket="Fotoğraf" onClick={() => fotoRef.current?.click()} disabled={mesgul} />
                  {!videoVar && (
                    <MedyaDugmesi ikon="Video" etiket="Video" onClick={() => videoRef.current?.click()} disabled={mesgul} />
                  )}
                </div>
              )
            )}
          </section>

          <section>
            <Etiket>Nerede?</Etiket>
            <div className="relative">
              <Icon name="MapPin" className="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={mekan}
                onChange={(e) => setMekan(e.target.value)}
                placeholder="Moda Sahili, Kadıköy"
                list="paylasim-mekanlar"
                maxLength={120}
                className="input-field pl-9"
              />
              <datalist id="paylasim-mekanlar">
                {oneriler.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
          </section>

          <section>
            <Etiket>Puanın</Etiket>
            <YildizSecici puan={puan} onPuan={setPuan} />
          </section>

          <section>
            <Etiket>Ne düşünüyorsun?</Etiket>
            <textarea
              value={notlar}
              onChange={(e) => setNotlar(e.target.value)}
              placeholder="Kahvesi harika, akşamüstü manzarası ayrı güzel…"
              rows={3}
              maxLength={1000}
              className="input-field resize-none"
            />
          </section>

          <section>
            <Etiket>Ne zaman?</Etiket>
            <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} className="input-field" />
          </section>

          <section>
            <Etiket>Kim görsün?</Etiket>
            <div className="flex flex-wrap gap-2">
              <KitleCipi secili={kitle.tur === 'arkadaslarim'} ikon="Users" onClick={() => setKitle({ tur: 'arkadaslarim' })}>
                Arkadaşlarım
              </KitleCipi>
              <KitleCipi secili={kitle.tur === 'herkes'} ikon="Globe" onClick={() => setKitle({ tur: 'herkes' })}>
                Herkes
              </KitleCipi>
              {gruplar.map((g) => (
                <KitleCipi
                  key={g.id}
                  secili={kitle.tur === 'grup' && kitle.grupId === g.id}
                  onClick={() => setKitle({ tur: 'grup', grupId: g.id })}
                >
                  {g.emoji ? `${g.emoji} ` : ''}
                  {g.ad}
                </KitleCipi>
              ))}
            </div>
            {kitle.tur === 'herkes' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-3 animate-fade-in">
                Bu paylaşım Keşfet'te tüm {UYGULAMA_ADI} kullanıcılarına görünecek. Mekan adı da paylaşılıyor.
              </p>
            )}
          </section>

          {hata && (
            <div role="alert" className="flex items-start gap-2 bg-white border border-rose-200 rounded-xl px-4 py-3 animate-sallan">
              <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700">{hata}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Etiket({ children }: { children: React.ReactNode }) {
  return <p className="block text-label text-ink-500 mb-2">{children}</p>
}

function MedyaDugmesi({
  ikon,
  etiket,
  alt,
  onClick,
  disabled,
  buyuk = false,
}: {
  ikon: 'ImageIcon' | 'Video'
  etiket: string
  alt?: string
  onClick: () => void
  disabled?: boolean
  buyuk?: boolean
}) {
  if (!buyuk) {
    return (
      <button onClick={onClick} disabled={disabled} className="chip bg-bolum-soluk text-bolum-koyu font-semibold disabled:opacity-50">
        <Icon name="Plus" className="w-4 h-4" />
        {etiket}
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group aspect-[4/5] rounded-3xl border-2 border-dashed border-ink-200 bg-white flex flex-col items-center justify-center gap-2 basinca hover:border-transparent hover:shadow-glow transition-shadow"
    >
      <span className="w-14 h-14 rounded-2xl bg-bolum text-white flex items-center justify-center shadow-glow transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:rotate-6">
        <Icon name={ikon} className="w-7 h-7" />
      </span>
      <span className="text-sm font-semibold text-ink-700">{etiket}</span>
      {alt && <span className="text-xs text-ink-400">{alt}</span>}
    </button>
  )
}

function YildizSecici({ puan, onPuan }: { puan: number | null; onPuan: (p: number | null) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label="Puan" className="flex gap-1">
        {Array.from({ length: AZAMI_PUAN }, (_, i) => i + 1).map((n) => {
          const dolu = puan !== null && n <= puan
          return (
            <button
              key={n}
              role="radio"
              aria-checked={puan === n}
              aria-label={`${n} yıldız`}
              // Tapping the chosen star again clears the rating.
              onClick={() => onPuan(puan === n ? null : n)}
              className="w-10 h-10 flex items-center justify-center basinca"
            >
              <span
                key={dolu ? `dolu-${puan}` : 'bos'}
                className={`inline-flex ${dolu ? 'animate-pop-in' : ''}`}
                style={dolu ? { animationDelay: `${(n - 1) * 40}ms` } : undefined}
              >
                <svg viewBox="0 0 24 24" className="w-8 h-8" aria-hidden>
                  <path
                    d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.15 6.38 20.1l1.07-6.27L2.9 9.4l6.3-.9z"
                    fill={dolu ? '#FBBF24' : 'none'}
                    stroke={dolu ? '#F59E0B' : 'currentColor'}
                    strokeWidth={1.75}
                    strokeLinejoin="round"
                    className={dolu ? '' : 'text-ink-300'}
                  />
                </svg>
              </span>
            </button>
          )
        })}
      </div>
      <span className="text-sm font-semibold text-ink-500">{puan ? PUAN_ETIKETLERI[puan] : 'İsteğe bağlı'}</span>
    </div>
  )
}

function KitleCipi({
  secili,
  ikon,
  onClick,
  children,
}: {
  secili: boolean
  ikon?: 'Users' | 'Globe'
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={secili}
      className={`chip ${secili ? 'bg-bolum text-white shadow-glow' : 'bg-white text-ink-600 border border-ink-200'}`}
    >
      {ikon && <Icon name={ikon} className="w-4 h-4" />}
      {children}
    </button>
  )
}
