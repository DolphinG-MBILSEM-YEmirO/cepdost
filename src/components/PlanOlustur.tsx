import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { Avatar, GrupAvatari } from './Avatar'
import { type Kategori, type YakinOneri } from '../db'
import { siniflandirOnizleme } from '../classify'
import { useAuth } from '../sosyal/auth'
import {
  arkadaslariGetir,
  arkadasTakvimi,
  type Arkadas,
  type ArkadasTakvimi,
  type Profil,
} from '../sosyal/api'
import { gruplarimiGetir, grupUyeleriGetir, type Grup } from '../sosyal/gruplar'
import { kendiBloklarim, ortakPlanOner } from '../sosyal/ortakPlan'
import { addDays, formatBusyRanges, formatDate, toDateString } from '../lib/format'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'
import { planiKur, type PlanKitlesi } from '../lib/planPaylasimi'
import { ETKINLIK_EMOJILERI } from '../lib/kisisellestirme'
import { EmojiSecici, TumGunAnahtari } from './Seciciler'

// F19 — "+" akışı yeniden tasarlandı (2026-08-08).
//
// Eskisi bir YAKALAMA formuydu (link / görsel / metin → sınıflandır). Ama
// "+" bir gün planlayıcıda "yeni plan" demek; link ve ekran görüntüsü zaten
// telefonun paylaş menüsünden otomatik akıyor (bkz. sw.ts). Artık akış:
// kiminle → ne / nerede / ne zaman → müsaitlik + davet.

type Adim = 'kiminle' | 'detay' | 'ozet'
type Kapsam = 'tek' | 'arkadas' | 'grup'

interface Props {
  onClose: () => void
  onSaved: () => void
}

interface Etkinlik {
  ad: string
  kategori: Kategori
  emoji: string
  // Tipik süre — kullanıcı değiştirebiliyor ama makul bir başlangıç.
  sure: number
}

const ETKINLIKLER: Etkinlik[] = [
  { ad: 'Kahve', kategori: 'mekan', emoji: '☕', sure: 90 },
  { ad: 'Yemek', kategori: 'mekan', emoji: '🍽️', sure: 120 },
  { ad: 'Sinema', kategori: 'etkinlik', emoji: '🎬', sure: 150 },
  { ad: 'Yürüyüş', kategori: 'etkinlik', emoji: '🏃', sure: 60 },
  { ad: 'Spor', kategori: 'etkinlik', emoji: '⚽', sure: 90 },
  { ad: 'Ders / çalışma', kategori: 'etkinlik', emoji: '📚', sure: 120 },
  { ad: 'Oyun', kategori: 'etkinlik', emoji: '🎮', sure: 120 },
  { ad: 'Konser', kategori: 'etkinlik', emoji: '🎵', sure: 180 },
  { ad: 'Alışveriş', kategori: 'urun', emoji: '🛍️', sure: 90 },
  { ad: 'Tarif dene', kategori: 'tarif', emoji: '🍽️', sure: 90 },
]

const SURELER = [60, 90, 120, 180]

// Yalnızca bu modal ön planda çalıştığı için konum API'sine erişebiliyor
// (servis çalışanında yok). İzin verilmezse sessizce null döner.
function konumAl(): Promise<{ enlem: number; boylam: number } | null> {
  return new Promise((coz) => {
    if (!('geolocation' in navigator)) return coz(null)
    navigator.geolocation.getCurrentPosition(
      (p) => coz({ enlem: p.coords.latitude, boylam: p.coords.longitude }),
      () => coz(null),
      { timeout: 5000, maximumAge: 5 * 60 * 1000 },
    )
  })
}

function dakikaya(saat: string): number {
  const [s, d] = saat.split(':').map(Number)
  return Number.isNaN(s) || Number.isNaN(d) ? 0 : s * 60 + d
}

export function PlanOlustur({ onClose, onSaved }: Props) {
  useEscapeIleKapat(onClose)
  const { kullanici } = useAuth()

  const [adim, setAdim] = useState<Adim>('kiminle')
  const [kapsam, setKapsam] = useState<Kapsam>('tek')

  const [arkadaslar, setArkadaslar] = useState<Arkadas[]>([])
  const [gruplar, setGruplar] = useState<Grup[]>([])
  const [seciliArkadaslar, setSeciliArkadaslar] = useState<string[]>([])
  const [seciliGrup, setSeciliGrup] = useState<Grup | null>(null)
  const [grupUyeProfilleri, setGrupUyeProfilleri] = useState<Profil[]>([])

  const [etkinlik, setEtkinlik] = useState<Etkinlik | null>(null)
  const [serbestBaslik, setSerbestBaslik] = useState('')
  // Follows the picked activity until the person chooses one themselves.
  const [emoji, setEmoji] = useState<string | null>(null)
  const [konum, setKonum] = useState('')
  const [yakinOneriler, setYakinOneriler] = useState<YakinOneri[] | null>(null)
  const [konumAraniyor, setKonumAraniyor] = useState(false)

  const [tarih, setTarih] = useState(toDateString(new Date()))
  const [saat, setSaat] = useState('')
  const [sure, setSure] = useState(90)
  const [tumGun, setTumGun] = useState(false)

  const [musaitlik, setMusaitlik] = useState<Map<string, ArkadasTakvimi>>(new Map())
  const [benimBloklarim, setBenimBloklarim] = useState<Array<{ baslangic: string; bitis: string }>>([])
  const [musaitlikYukleniyor, setMusaitlikYukleniyor] = useState(false)
  const [saatAraniyor, setSaatAraniyor] = useState(false)

  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  // Kapsam adımı için arkadaş ve grup listeleri.
  useEffect(() => {
    if (!kullanici) return
    let iptal = false
    Promise.all([arkadaslariGetir(), gruplarimiGetir()])
      .then(([a, g]) => {
        if (iptal) return
        setArkadaslar(a.filter((x) => x.durum === 'kabul'))
        setGruplar(g)
      })
      .catch(() => {
        /* sosyal katman erişilemezse "tek başıma" yolu yine çalışır */
      })
    return () => {
      iptal = true
    }
  }, [kullanici])

  // Seçilen grubun üyeleri (müsaitlik ve davet için).
  useEffect(() => {
    if (!seciliGrup) {
      setGrupUyeProfilleri([])
      return
    }
    let iptal = false
    grupUyeleriGetir(seciliGrup.id)
      .then((uyeler) => {
        if (iptal) return
        // Members whose profile hasn't reached this device yet can't be
        // listed; there would be no availability to show for them either.
        setGrupUyeProfilleri(
          uyeler.filter((u) => u.kullanici_id !== kullanici?.id && u.profil).map((u) => u.profil!),
        )
      })
      .catch(() => setGrupUyeProfilleri([]))
    return () => {
      iptal = true
    }
  }, [seciliGrup, kullanici])

  const katilimcilar: Profil[] = useMemo(() => {
    if (kapsam === 'arkadas') {
      return arkadaslar.filter((a) => seciliArkadaslar.includes(a.profil.id)).map((a) => a.profil)
    }
    if (kapsam === 'grup') return grupUyeProfilleri
    return []
  }, [kapsam, arkadaslar, seciliArkadaslar, grupUyeProfilleri])

  // Seçilen tarihte katılımcıların dolu saatleri.
  const musaitligiYukle = useCallback(async () => {
    if (katilimcilar.length === 0 || !tarih) {
      setMusaitlik(new Map())
      return
    }
    setMusaitlikYukleniyor(true)
    try {
      const harita = new Map<string, ArkadasTakvimi>()
      await Promise.all(
        katilimcilar.map(async (p) => {
          if (!p.musaitlik_paylas) return
          try {
            harita.set(p.id, await arkadasTakvimi(p.id, tarih, tarih))
          } catch {
            /* tek kişinin müsaitliği alınamazsa diğerleri yine gösterilsin */
          }
        }),
      )
      setMusaitlik(harita)
    } finally {
      setMusaitlikYukleniyor(false)
    }
  }, [katilimcilar, tarih])

  useEffect(() => {
    if (adim === 'detay') void musaitligiYukle()
  }, [adim, musaitligiYukle])

  // My own busy ranges that day, so a clash with my other plans shows too.
  useEffect(() => {
    if (adim === 'kiminle' || !tarih) return
    let iptal = false
    kendiBloklarim([tarih])
      .then((b) => !iptal && setBenimBloklarim(b))
      .catch(() => !iptal && setBenimBloklarim([]))
    return () => {
      iptal = true
    }
  }, [adim, tarih])

  const baslik = etkinlik ? (serbestBaslik.trim() || etkinlik.ad) : serbestBaslik.trim()
  const kategori: Kategori = etkinlik?.kategori ?? 'etkinlik'

  // Seçilen saat kimseyle çakışıyor mu? An all-day plan clashes with
  // anything busy that day.
  const cakisanlar = useMemo(() => {
    if (!saat && !tumGun) return []
    const bas = tumGun ? 0 : dakikaya(saat)
    const bit = tumGun ? 24 * 60 : bas + sure
    return katilimcilar.filter((p) =>
      (musaitlik.get(p.id)?.bloklar ?? []).some((b) => {
        const bBas = dakikaya(b.baslangic.slice(0, 5))
        const bBit = dakikaya(b.bitis.slice(0, 5))
        return bas < bBit && bit > bBas
      }),
    )
  }, [saat, sure, tumGun, katilimcilar, musaitlik])

  const benimCakismam = useMemo(() => {
    if (tumGun) return benimBloklarim.length > 0
    if (!saat) return false
    const bas = dakikaya(saat)
    const bit = bas + sure
    return benimBloklarim.some((b) => bas < dakikaya(b.bitis) && bit > dakikaya(b.baslangic))
  }, [saat, sure, tumGun, benimBloklarim])

  async function yakindaAra() {
    setKonumAraniyor(true)
    setHata(null)
    try {
      const k = await konumAl()
      if (!k) {
        setHata('Konum alınamadı — izin verilmedi ya da kapalı. Mekanı elle yazabilirsin.')
        return
      }
      // Etkinlik adını arama sorgusu olarak kullanıyoruz: "kahve" yazınca
      // gerçekten yakındaki kafeler geliyor (bkz. classify/foursquareYakinAra).
      const sonuc = await siniflandirOnizleme({ hamMetin: baslik || 'buluşma', ...k })
      setYakinOneriler(sonuc.yakinOneriler)
      if (!sonuc.yakinOneriler || sonuc.yakinOneriler.length === 0) {
        setHata('Yakında uygun bir yer bulamadım. Mekanı elle yazabilirsin.')
      }
    } catch {
      setHata('Mekan önerisi alınamadı. Elle yazabilirsin.')
    } finally {
      setKonumAraniyor(false)
    }
  }

  async function uygunSaatiBul() {
    if (katilimcilar.length === 0) return
    setSaatAraniyor(true)
    setHata(null)
    try {
      const sonuc = await ortakPlanOner({
        istek: baslik || 'buluşma',
        benimAdim: 'Ben',
        katilimcilar,
        gunler: [tarih],
        enAzDakika: sure,
      })
      if (sonuc.plan) {
        setTumGun(false)
        setSaat(sonuc.plan.saat)
        setSure(sonuc.plan.sure)
      } else {
        setHata(sonuc.mesaj ?? 'Bu gün için herkese uyan bir aralık bulunamadı.')
      }
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Saat önerisi alınamadı')
    } finally {
      setSaatAraniyor(false)
    }
  }

  async function planiOlustur() {
    if (!baslik) {
      setHata('Ne yapacağını seç ya da yaz.')
      return
    }
    setKaydediliyor(true)
    setHata(null)
    try {
      const kitle: PlanKitlesi =
        kapsam === 'grup' && seciliGrup
          ? { tur: 'grup', grup: seciliGrup }
          : kapsam === 'arkadas'
            ? { tur: 'arkadaslar', kisiler: katilimcilar }
            : { tur: 'tek' }
      // Sends the group plan or the invites (with chat cards) and puts the
      // plan in my calendar, linked to them.
      await planiKur(
        {
          baslik,
          tarih,
          saat: tumGun ? null : saat || null,
          sure: tumGun ? null : sure,
          tumGun,
          konum: konum.trim() || null,
          not: null,
          emoji,
          kategori,
          yakinOneriler,
        },
        kitle,
      )

      onSaved()
      onClose()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Plan oluşturulamadı')
    } finally {
      setKaydediliyor(false)
    }
  }

  const kapsamGecerli =
    kapsam === 'tek' ||
    (kapsam === 'arkadas' && seciliArkadaslar.length > 0) ||
    (kapsam === 'grup' && !!seciliGrup)

  return (
    <div className="panel-tam z-50">
      <div className="flex items-center justify-between px-5 pt-[calc(1rem+var(--safe-top))] pb-3 shrink-0">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold text-ink-700">
            {adim === 'kiminle' ? 'Kiminle?' : adim === 'detay' ? 'Plan detayları' : 'Son kontrol'}
          </h2>
          <p className="text-xs text-ink-400 mt-0.5">
            {adim === 'kiminle' ? '1 / 3' : adim === 'detay' ? '2 / 3' : '3 / 3'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform shrink-0"
        >
          <Icon name="X" className="w-5 h-5 text-ink-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">
        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        {adim === 'kiminle' && (
          <KiminleAdimi
            kapsam={kapsam}
            onKapsam={(k) => {
              setKapsam(k)
              setHata(null)
            }}
            arkadaslar={arkadaslar}
            gruplar={gruplar}
            seciliArkadaslar={seciliArkadaslar}
            onArkadasDegistir={(id) =>
              setSeciliArkadaslar((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]))
            }
            seciliGrup={seciliGrup}
            onGrupSec={setSeciliGrup}
          />
        )}

        {adim === 'detay' && (
          <DetayAdimi
            etkinlik={etkinlik}
            onEtkinlik={(e) => {
              setEtkinlik(e)
              setEmoji(e.emoji)
              setSure(e.sure)
              setYakinOneriler(null)
            }}
            emoji={emoji}
            onEmoji={setEmoji}
            serbestBaslik={serbestBaslik}
            onSerbestBaslik={setSerbestBaslik}
            konum={konum}
            onKonum={setKonum}
            yakinOneriler={yakinOneriler}
            konumAraniyor={konumAraniyor}
            onYakindaAra={() => void yakindaAra()}
            tarih={tarih}
            onTarih={setTarih}
            saat={saat}
            onSaat={setSaat}
            sure={sure}
            onSure={setSure}
            tumGun={tumGun}
            onTumGun={setTumGun}
            katilimcilar={katilimcilar}
            musaitlik={musaitlik}
            musaitlikYukleniyor={musaitlikYukleniyor}
            cakisanlar={cakisanlar}
            benimCakismam={benimCakismam}
            saatAraniyor={saatAraniyor}
            onUygunSaatiBul={() => void uygunSaatiBul()}
          />
        )}

        {adim === 'ozet' && (
          <OzetAdimi
            baslik={baslik}
            emoji={emoji}
            tarih={tarih}
            saat={saat}
            sure={sure}
            tumGun={tumGun}
            konum={konum}
            kapsam={kapsam}
            grup={seciliGrup}
            katilimcilar={katilimcilar}
            cakisanlar={cakisanlar}
            benimCakismam={benimCakismam}
          />
        )}
      </div>

      <div className="px-5 pb-[calc(1rem+var(--safe-bottom))] pt-3 border-t border-ink-100 safe-x shrink-0 flex gap-3">
        {adim !== 'kiminle' && (
          <button
            onClick={() => setAdim(adim === 'ozet' ? 'detay' : 'kiminle')}
            disabled={kaydediliyor}
            className="btn-ghost border border-ink-100 px-6"
          >
            Geri
          </button>
        )}

        {adim === 'kiminle' && (
          <button
            onClick={() => {
              if (!kapsamGecerli) {
                setHata(kapsam === 'grup' ? 'Bir grup seç.' : 'En az bir arkadaş seç.')
                return
              }
              setHata(null)
              setAdim('detay')
            }}
            className="btn-primary flex-1"
          >
            Devam
          </button>
        )}

        {adim === 'detay' && (
          <button
            onClick={() => {
              if (!baslik) {
                setHata('Ne yapacağını seç ya da yaz.')
                return
              }
              setHata(null)
              setAdim('ozet')
            }}
            className="btn-primary flex-1"
          >
            Devam
          </button>
        )}

        {adim === 'ozet' && (
          <button
            onClick={() => void planiOlustur()}
            disabled={kaydediliyor}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Icon
              name={kaydediliyor ? 'Loader2' : kapsam === 'tek' ? 'Check' : 'Send'}
              className={`w-5 h-5 ${kaydediliyor ? 'animate-spin' : ''}`}
            />
            {kapsam === 'tek'
              ? 'Planı kaydet'
              : kapsam === 'grup'
                ? 'Gruba gönder'
                : `${katilimcilar.length} kişiye davet gönder`}
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------- 1. adım: kiminle ----------------

function KiminleAdimi({
  kapsam,
  onKapsam,
  arkadaslar,
  gruplar,
  seciliArkadaslar,
  onArkadasDegistir,
  seciliGrup,
  onGrupSec,
}: {
  kapsam: Kapsam
  onKapsam: (k: Kapsam) => void
  arkadaslar: Arkadas[]
  gruplar: Grup[]
  seciliArkadaslar: string[]
  onArkadasDegistir: (id: string) => void
  seciliGrup: Grup | null
  onGrupSec: (g: Grup | null) => void
}) {
  const secenekler: { id: Kapsam; ad: string; aciklama: string; ikon: IconName }[] = [
    { id: 'tek', ad: 'Tek başıma', aciklama: 'Sadece kendi takvimime düşsün', ikon: 'UserRound' },
    { id: 'arkadas', ad: 'Arkadaşlarımla', aciklama: 'Seçtiklerime davet gitsin', ikon: 'UserPlus' },
    { id: 'grup', ad: 'Bir grupla', aciklama: 'Grup planı olarak paylaşılsın', ikon: 'Users' },
  ]

  return (
    <>
      <div className="space-y-2">
        {secenekler.map((s) => {
          const aktif = kapsam === s.id
          return (
            <button
              key={s.id}
              onClick={() => onKapsam(s.id)}
              className={`w-full flex items-center gap-3 rounded-2xl p-4 border text-left transition-all active:scale-[0.98] ${
                aktif ? 'bg-orchid-50 border-orchid-200' : 'bg-mist-50 border-ink-100'
              }`}
            >
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                  aktif ? 'bg-gradient-orchid text-white' : 'bg-mist-100 text-ink-400'
                }`}
              >
                <Icon name={s.ikon} className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink-700">{s.ad}</p>
                <p className="text-xs text-ink-400">{s.aciklama}</p>
              </div>
              {aktif && <Icon name="Check" className="w-5 h-5 text-orchid-500 shrink-0" />}
            </button>
          )
        })}
      </div>

      {kapsam === 'arkadas' && (
        <div>
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2 px-1">
            Kimleri davet edeceksin?
          </p>
          {arkadaslar.length === 0 ? (
            <div className="card p-5 text-center">
              <p className="text-sm text-ink-400">
                Henüz arkadaşın yok. Sohbet → Arkadaşlar'dan kullanıcı adıyla ekleyebilirsin.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {arkadaslar.map((a) => {
                const secili = seciliArkadaslar.includes(a.profil.id)
                return (
                  <button
                    key={a.profil.id}
                    onClick={() => onArkadasDegistir(a.profil.id)}
                    className={`w-full flex items-center gap-3 rounded-2xl p-3 border transition-all active:scale-[0.98] ${
                      secili ? 'bg-orchid-50 border-orchid-200' : 'bg-mist-50 border-ink-100'
                    }`}
                  >
                    <Avatar ad={a.profil.ad} foto={a.profil.avatar} emoji={a.profil.emoji} renk={a.profil.renk} boyut="sm" />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-ink-700 truncate">{a.profil.ad}</p>
                      {!a.profil.musaitlik_paylas && (
                        <p className="text-[11px] text-amber-600">Müsaitliğini paylaşmıyor</p>
                      )}
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                        secili ? 'bg-orchid-500' : 'bg-mist-100 border border-ink-200'
                      }`}
                    >
                      {secili && <Icon name="Check" className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {kapsam === 'grup' && (
        <div>
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2 px-1">
            Hangi grup?
          </p>
          {gruplar.length === 0 ? (
            <div className="card p-5 text-center">
              <p className="text-sm text-ink-400">
                Henüz grubun yok. Sohbet → Arkadaşlar'dan grup kurabilirsin.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {gruplar.map((g) => {
                const secili = seciliGrup?.id === g.id
                return (
                  <button
                    key={g.id}
                    onClick={() => onGrupSec(secili ? null : g)}
                    className={`w-full flex items-center gap-3 rounded-2xl p-3 border transition-all active:scale-[0.98] ${
                      secili ? 'bg-orchid-50 border-orchid-200' : 'bg-mist-50 border-ink-100'
                    }`}
                  >
                    <GrupAvatari grup={g} boyut="sm" />
                    <p className="flex-1 min-w-0 text-sm font-medium text-ink-700 truncate text-left">
                      {g.ad}
                    </p>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        secili ? 'bg-orchid-500' : 'bg-mist-100 border border-ink-200'
                      }`}
                    >
                      {secili && <Icon name="Check" className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ---------------- 2. adım: ne / nerede / ne zaman ----------------

function DetayAdimi(p: {
  etkinlik: Etkinlik | null
  onEtkinlik: (e: Etkinlik) => void
  emoji: string | null
  onEmoji: (e: string | null) => void
  serbestBaslik: string
  onSerbestBaslik: (v: string) => void
  konum: string
  onKonum: (v: string) => void
  yakinOneriler: YakinOneri[] | null
  konumAraniyor: boolean
  onYakindaAra: () => void
  tarih: string
  onTarih: (v: string) => void
  saat: string
  onSaat: (v: string) => void
  sure: number
  onSure: (v: number) => void
  tumGun: boolean
  onTumGun: (v: boolean) => void
  katilimcilar: Profil[]
  musaitlik: Map<string, ArkadasTakvimi>
  musaitlikYukleniyor: boolean
  cakisanlar: Profil[]
  benimCakismam: boolean
  saatAraniyor: boolean
  onUygunSaatiBul: () => void
}) {
  const hizliGunler = useMemo(() => {
    const bugun = new Date()
    return [0, 1, 2].map((i) => ({
      deger: toDateString(addDays(bugun, i)),
      etiket: i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : formatDate(toDateString(addDays(bugun, i))) ?? '',
    }))
  }, [])

  return (
    <>
      <Bolum baslik="Ne yapacaksınız?" ikon="Sparkles">
        <div className="flex flex-wrap gap-2 mb-3">
          {ETKINLIKLER.map((e) => {
            const secili = p.etkinlik?.ad === e.ad
            return (
              <button
                key={e.ad}
                onClick={() => p.onEtkinlik(e)}
                className={`chip ${
                  secili
                    ? 'bg-gradient-orchid text-white'
                    : 'bg-mist-100 text-ink-500 border border-ink-100'
                }`}
              >
                <span aria-hidden="true">{e.emoji}</span>
                {e.ad}
              </button>
            )
          })}
        </div>
        <input
          value={p.serbestBaslik}
          onChange={(e) => p.onSerbestBaslik(e.target.value)}
          placeholder={p.etkinlik ? `${p.etkinlik.ad} — istersen kendi başlığını yaz` : 'Ya da kendin yaz...'}
          className="input-field mb-3"
        />
        <FieldLabel>Simge</FieldLabel>
        <EmojiSecici secenekler={ETKINLIK_EMOJILERI} secili={p.emoji} onSec={p.onEmoji} />
      </Bolum>

      <Bolum baslik="Nerede?" ikon="MapPin">
        <input
          value={p.konum}
          onChange={(e) => p.onKonum(e.target.value)}
          placeholder="Mekan adı ya da semt"
          className="input-field mb-3"
        />
        <button
          onClick={p.onYakindaAra}
          disabled={p.konumAraniyor}
          className="btn-ghost w-full border border-ink-100 text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Icon
            name={p.konumAraniyor ? 'Loader2' : 'MapPin'}
            className={`w-4 h-4 ${p.konumAraniyor ? 'animate-spin' : ''}`}
          />
          {p.konumAraniyor ? 'Yakında arıyorum...' : 'Yakınımdakileri öner'}
        </button>

        {p.yakinOneriler && p.yakinOneriler.length > 0 && (
          <div className="mt-3">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {p.yakinOneriler.map((o, i) => (
                <button
                  key={i}
                  onClick={() => p.onKonum(o.isim)}
                  className="shrink-0 text-left bg-mist-100 border border-ink-100 rounded-2xl px-3.5 py-2.5 active:scale-95 transition-transform min-w-[160px]"
                >
                  <p className="text-sm font-semibold text-ink-700 truncate">{o.isim}</p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    {o.mesafeMetre == null
                      ? ''
                      : o.mesafeMetre < 1000
                        ? `${o.mesafeMetre} m`
                        : `${(o.mesafeMetre / 1000).toFixed(1)} km`}
                  </p>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-300 mt-2">
              Foursquare'den gerçek mekanlar — dokununca yukarı yazılır.
            </p>
          </div>
        )}
      </Bolum>

      <Bolum baslik="Ne zaman?" ikon="CalendarDays">
        <div className="flex gap-2 mb-3">
          {hizliGunler.map((g) => (
            <button
              key={g.deger}
              onClick={() => p.onTarih(g.deger)}
              className={`chip flex-1 justify-center ${
                p.tarih === g.deger
                  ? 'bg-gradient-orchid text-white'
                  : 'bg-mist-100 text-ink-500 border border-ink-100'
              }`}
            >
              {g.etiket}
            </button>
          ))}
        </div>

        <div className={`grid gap-3 mb-3 ${p.tumGun ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <div>
            <FieldLabel>Tarih</FieldLabel>
            <input
              type="date"
              value={p.tarih}
              onChange={(e) => p.onTarih(e.target.value)}
              className="input-field"
            />
          </div>
          {!p.tumGun && (
            <div>
              <FieldLabel>Saat</FieldLabel>
              <input
                type="time"
                value={p.saat}
                onChange={(e) => p.onSaat(e.target.value)}
                className="input-field"
              />
            </div>
          )}
        </div>

        <div className="mb-3">
          <TumGunAnahtari acik={p.tumGun} onDegistir={p.onTumGun} />
        </div>

        {!p.tumGun && (
          <>
            <FieldLabel>Ne kadar sürsün?</FieldLabel>
            <div className="flex gap-2">
              {SURELER.map((s) => (
                <button
                  key={s}
                  onClick={() => p.onSure(s)}
                  className={`chip flex-1 justify-center ${
                    p.sure === s
                      ? 'bg-gradient-orchid text-white'
                      : 'bg-mist-100 text-ink-500 border border-ink-100'
                  }`}
                >
                  {s >= 60 ? `${s / 60} sa` : `${s} dk`}
                </button>
              ))}
            </div>
          </>
        )}

        {p.benimCakismam && (
          <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mt-3">
            <Icon name="AlertTriangle" className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            {p.tumGun ? 'O gün başka bir planın var.' : 'Bu saatte başka bir planın var.'}
          </p>
        )}
      </Bolum>

      {p.katilimcilar.length > 0 && (
        <Bolum baslik="Müsaitlik" ikon="CalendarClock">
          {!p.tumGun && (
            <button
              onClick={p.onUygunSaatiBul}
              disabled={p.saatAraniyor}
              className="btn-ghost w-full border border-ink-100 text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 mb-3"
            >
              <Icon
                name={p.saatAraniyor ? 'Loader2' : 'Wand2'}
                className={`w-4 h-4 ${p.saatAraniyor ? 'animate-spin' : ''}`}
              />
              {p.saatAraniyor ? 'Bakıyorum...' : 'Bu gün için herkese uyan saati bul'}
            </button>
          )}

          {p.musaitlikYukleniyor ? (
            <div className="space-y-2">
              <div className="skeleton h-12 rounded-2xl" />
              <div className="skeleton h-12 rounded-2xl" />
            </div>
          ) : (
            <div className="space-y-2">
              {p.katilimcilar.map((k) => {
                const takvim = p.musaitlik.get(k.id)
                const bloklar = takvim?.bloklar ?? []
                const cakisiyor = p.cakisanlar.some((c) => c.id === k.id)
                return (
                  <div
                    key={k.id}
                    className={`flex items-center gap-3 rounded-2xl p-3 border ${
                      cakisiyor ? 'bg-amber-50 border-amber-200' : 'bg-mist-50 border-ink-100'
                    }`}
                  >
                    <Avatar ad={k.ad} foto={k.avatar} emoji={k.emoji} renk={k.renk} boyut="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-700 truncate">{k.ad}</p>
                      <p
                        className={`text-xs truncate ${cakisiyor ? 'text-amber-700' : 'text-ink-400'}`}
                      >
                        {!k.musaitlik_paylas
                          ? 'Müsaitlik paylaşmıyor'
                          : !takvim?.bloklar
                            ? 'Takvimi henüz gelmedi'
                            : bloklar.length === 0
                            ? 'Bu gün tamamen müsait'
                            : formatBusyRanges(bloklar)}
                      </p>
                    </div>
                    {cakisiyor && (
                      <Icon name="AlertTriangle" className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {p.cakisanlar.length > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mt-3">
              <Icon name="AlertTriangle" className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                {p.tumGun
                  ? `O gün ${p.cakisanlar.map((c) => c.ad).join(', ')} için dolu saatler var. Yine de davet gönderebilirsin.`
                  : `Seçtiğin saat ${p.cakisanlar.map((c) => c.ad).join(', ')} için dolu. Yine de davet gönderebilirsin ama başka bir saat daha kolay olabilir.`}
              </p>
            </div>
          )}

          <p className="text-[11px] text-ink-300 mt-3 leading-relaxed">
            Yalnızca dolu saat aralıkları görünür — kimsenin ne yaptığı görünmez.
          </p>
        </Bolum>
      )}
    </>
  )
}

// ---------------- 3. adım: özet ----------------

function OzetAdimi({
  baslik,
  emoji,
  tarih,
  saat,
  sure,
  tumGun,
  konum,
  kapsam,
  grup,
  katilimcilar,
  cakisanlar,
  benimCakismam,
}: {
  baslik: string
  emoji: string | null
  tarih: string
  saat: string
  sure: number
  tumGun: boolean
  konum: string
  kapsam: Kapsam
  grup: Grup | null
  katilimcilar: Profil[]
  cakisanlar: Profil[]
  benimCakismam: boolean
}) {
  return (
    <>
      <div className="card p-5">
        <p className="font-display text-lg font-bold text-ink-700 mb-2">
          {emoji && <span aria-hidden="true">{emoji} </span>}
          {baslik}
        </p>

        <div className="space-y-1.5 text-sm text-ink-500">
          <p className="flex items-center gap-2">
            <Icon name="CalendarDays" className="w-4 h-4 text-ink-300 shrink-0" />
            {formatDate(tarih) ?? tarih}
            {tumGun ? ' · Tüm gün' : `${saat ? ` · ${saat}` : ''} · ${sure} dk`}
          </p>
          {konum.trim() && (
            <p className="flex items-center gap-2">
              <Icon name="MapPin" className="w-4 h-4 text-orchid-500 shrink-0" />
              {konum.trim()}
            </p>
          )}
          {benimCakismam && (
            <p className="flex items-center gap-2 text-amber-700">
              <Icon name="AlertTriangle" className="w-4 h-4 shrink-0" />
              {tumGun ? 'O gün başka bir planın var.' : 'Bu saatte başka bir planın var.'}
            </p>
          )}
          {!saat && !tumGun && (
            <p className="flex items-center gap-2 text-amber-700">
              <Icon name="Info" className="w-4 h-4 shrink-0" />
              Saat belirtmedin — plan gün içinde serbest kalacak.
            </p>
          )}
        </div>
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">Kiminle</p>
        {kapsam === 'tek' ? (
          <p className="text-sm text-ink-500">Sadece senin takvimine eklenecek.</p>
        ) : (
          <>
            {kapsam === 'grup' && grup && (
              <div className="flex items-center gap-2 mb-3">
                <GrupAvatari grup={grup} boyut="sm" />
                <p className="text-sm font-medium text-ink-700">{grup.ad}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {katilimcilar.map((k) => (
                <span
                  key={k.id}
                  className={`chip text-xs ${
                    cakisanlar.some((c) => c.id === k.id)
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-mist-100 text-ink-500 border border-ink-100'
                  }`}
                >
                  {k.ad}
                </span>
              ))}
            </div>
            <p className="text-xs text-ink-400 mt-3">
              {kapsam === 'grup'
                ? 'Grup planı olarak eklenecek ve sohbete düşecek. "Geliyorum" diyenlerin takvimine yazılır.'
                : 'Herkese ayrı davet gidecek. Kabul edenlerin takvimine yazılır.'}
            </p>
          </>
        )}
      </div>

      <p className="text-[11px] text-ink-300 text-center leading-relaxed">
        {kapsam === 'tek'
          ? 'Bu plan yalnızca cihazında saklanır, hiçbir yere gönderilmez.'
          : 'Planın detayları cihazında kalır; karşı tarafa yalnızca davet bilgisi gider.'}
      </p>
    </>
  )
}

// ---------------- ortak parçalar ----------------

function Bolum({
  baslik,
  ikon,
  children,
}: {
  baslik: string
  ikon: IconName
  children: React.ReactNode
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon name={ikon} className="w-4 h-4 text-orchid-500" />
        <p className="text-sm font-semibold text-ink-700">{baslik}</p>
      </div>
      {children}
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
