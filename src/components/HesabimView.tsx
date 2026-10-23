import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { ProfilDuzenle } from './ProfilDuzenle'
import { PlanTercihleri } from './PlanTercihleri'
import { useAuth } from '../sosyal/auth'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { avatarSil, avatarYukle } from '../sosyal/avatar'
import { arkadaslariGetir, profilGuncelle, profilimiGetir, type Profil } from '../sosyal/api'
import { gruplarimiGetir } from '../sosyal/gruplar'
import { renkAl } from '../lib/kisisellestirme'
import { UYGULAMA_ADI } from '../../shared/marka'
import type { Kayit } from '../db'
import { PlanOzetiKarti } from './PlanIstatistikleri'

// The person themselves: photo, name, username, bio, a summary of their
// plans, and who sees their availability and profile. Friends, codes and
// requests live in the Sohbet tab; the counts here link there.
interface Props {
  kayitlar: Kayit[]
  onArkadaslar: () => void
}

// The sign-in gate in App guarantees an account here.
export function HesabimView({ kayitlar, onArkadaslar }: Props) {
  const { kullanici } = useAuth()
  if (!kullanici) return null
  return <HesabimIcerik kayitlar={kayitlar} onArkadaslar={onArkadaslar} />
}

function HesabimIcerik({ kayitlar, onArkadaslar }: Props) {
  const [profil, setProfil] = useState<Profil | null>(null)
  const [arkadasSayisi, setArkadasSayisi] = useState(0)
  const [grupSayisi, setGrupSayisi] = useState(0)
  const [hata, setHata] = useState<string | null>(null)

  const tazele = useCallback(async () => {
    setHata(null)
    try {
      const [p, a, g] = await Promise.all([profilimiGetir(), arkadaslariGetir(), gruplarimiGetir()])
      setProfil(p)
      setArkadasSayisi(a.filter((x) => x.durum === 'kabul').length)
      setGrupSayisi(g.length)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Profil alınamadı')
    }
  }, [])

  // Reload whenever social data changes (a sync, an edit on another device).
  const surum = useSosyalSurum()
  useEffect(() => {
    void tazele()
  }, [tazele, surum])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-24 lg:pb-10">
        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mb-4">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        {!profil ? (
          <div className="space-y-3">
            <div className="skeleton h-56 rounded-3xl" />
            <div className="skeleton h-40 rounded-3xl" />
          </div>
        ) : (
          // Desktop: the profile card and plan summary on the left, the
          // settings on the right.
          <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6 lg:space-y-0 lg:items-start">
            <div className="space-y-6">
              <ProfilKarti
                profil={profil}
                arkadasSayisi={arkadasSayisi}
                grupSayisi={grupSayisi}
                onDegisti={tazele}
                onArkadaslar={onArkadaslar}
              />
              <PlanOzetiKarti kayitlar={kayitlar} />
            </div>
            <GizlilikKarti profil={profil} onDegisti={tazele} />
          </div>
        )}
      </div>
    </div>
  )
}

function ProfilKarti({
  profil,
  arkadasSayisi,
  grupSayisi,
  onDegisti,
  onArkadaslar,
}: {
  profil: Profil
  arkadasSayisi: number
  grupSayisi: number
  onDegisti: () => Promise<void>
  onArkadaslar: () => void
}) {
  const [duzenle, setDuzenle] = useState(false)
  const [profilDuzenle, setProfilDuzenle] = useState(false)
  const [kullaniciAdi, setKullaniciAdi] = useState(profil.kullanici_adi ?? '')
  const [hata, setHata] = useState<string | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  async function kullaniciAdiKaydet() {
    setKaydediliyor(true)
    setHata(null)
    try {
      const temiz = kullaniciAdi.trim().toLocaleLowerCase('tr-TR').replace(/^@/, '')
      await profilGuncelle({ kullanici_adi: temiz || null })
      setDuzenle(false)
      await onDegisti()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className={`px-5 pt-6 pb-5 flex flex-col items-center text-center ${renkAl(profil.renk, profil.ad).zemin}`}>
        <AvatarSecici profil={profil} onDegisti={onDegisti} onHata={setHata} />
        <p className="font-display text-xl font-bold text-ink-700 mt-3 max-w-full truncate">{profil.ad}</p>

        {duzenle ? (
          <div className="w-full max-w-xs mt-2">
            <div className="flex gap-2">
              <div className="flex-1 flex items-center bg-mist-50 border border-ink-100 rounded-xl px-3">
                <span className="text-ink-300 text-sm">@</span>
                <input
                  value={kullaniciAdi}
                  onChange={(e) => setKullaniciAdi(e.target.value)}
                  placeholder="kullaniciadi"
                  aria-label="Kullanıcı adı"
                  autoFocus
                  className="flex-1 min-w-0 bg-transparent py-2 px-1 text-ink-700 font-medium placeholder:text-ink-300 focus:outline-none text-sm"
                />
              </div>
              <button
                onClick={() => void kullaniciAdiKaydet()}
                disabled={kaydediliyor}
                className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
              >
                {kaydediliyor ? '...' : 'Kaydet'}
              </button>
            </div>
            <button
              onClick={() => {
                setDuzenle(false)
                setKullaniciAdi(profil.kullanici_adi ?? '')
                setHata(null)
              }}
              className="text-xs text-ink-400 mt-2"
            >
              Vazgeç
            </button>
          </div>
        ) : (
          <button
            onClick={() => setDuzenle(true)}
            aria-label={profil.kullanici_adi ? 'Kullanıcı adını değiştir' : undefined}
            className="text-sm text-orchid-600 font-medium mt-0.5 active:scale-95 transition-transform"
          >
            {profil.kullanici_adi ? `@${profil.kullanici_adi}` : 'Kullanıcı adı belirle'}
          </button>
        )}

        {profil.biyografi && <p className="text-sm text-ink-500 mt-2 max-w-xs">{profil.biyografi}</p>}

        <button
          onClick={() => setProfilDuzenle(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-mist-50 border border-ink-100 px-4 py-2 text-sm font-semibold text-ink-600 active:scale-95 transition-transform"
        >
          <Icon name="Pencil" className="w-4 h-4" />
          Profili düzenle
        </button>
      </div>

      {/* Counts only; the lists themselves are under Sohbet → Arkadaşlar. */}
      <div className="grid grid-cols-2 divide-x divide-ink-100 border-t border-ink-100">
        <Sayac sayi={arkadasSayisi} etiket="Arkadaş" onClick={onArkadaslar} />
        <Sayac sayi={grupSayisi} etiket="Grup" onClick={onArkadaslar} />
      </div>

      {hata && <p className="text-xs text-rose-600 px-5 pb-4">{hata}</p>}

      {profilDuzenle && (
        <ProfilDuzenle
          profil={profil}
          onKapat={() => setProfilDuzenle(false)}
          onKaydedildi={async () => {
            setProfilDuzenle(false)
            await onDegisti()
          }}
        />
      )}
    </div>
  )
}

function Sayac({ sayi, etiket, onClick }: { sayi: number; etiket: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={`${sayi} ${etiket.toLocaleLowerCase('tr-TR')}, arkadaşlarını gör`}
      className="py-3.5 flex flex-col items-center hover:bg-ink-50 active:scale-[0.98] transition-all"
    >
      <span className="font-display text-lg font-bold text-ink-700">{sayi}</span>
      <span className="text-xs text-ink-400">{etiket}</span>
    </button>
  )
}

function GizlilikKarti({ profil, onDegisti }: { profil: Profil; onDegisti: () => Promise<void> }) {
  const [hata, setHata] = useState<string | null>(null)

  async function paylasimDegistir() {
    setHata(null)
    try {
      await profilGuncelle({ musaitlik_paylas: !profil.musaitlik_paylas })
      await onDegisti()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Güncellenemedi')
    }
  }

  async function gizlilikDegistir() {
    setHata(null)
    try {
      await profilGuncelle({
        gizlilik: profil.gizlilik === 'herkes' ? 'arkadaslar' : 'herkes',
      })
      await onDegisti()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Güncellenemedi')
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="ShieldCheck" className="w-4 h-4 text-orchid-500" />
        <h2 className="text-sm font-semibold text-ink-600">Paylaşım ve gizlilik</h2>
      </div>
      <div className="space-y-3">
        <Anahtar
          acik={profil.musaitlik_paylas}
          onDegistir={() => void paylasimDegistir()}
          baslik="Müsaitliğimi arkadaşlarım görsün"
          aciklama={
            profil.musaitlik_paylas
              ? 'Sadece dolu saat aralıkların görünüyor'
              : 'Kapalı — paylaşılan saat bilgilerin de silindi'
          }
        />
        <PlanTercihleri paylasimAcik={profil.musaitlik_paylas} />
        <Anahtar
          acik={profil.gizlilik === 'herkes'}
          onDegistir={() => void gizlilikDegistir()}
          baslik="Hesabım herkese açık"
          aciklama={
            profil.gizlilik === 'herkes'
              ? `Profilini tüm ${UYGULAMA_ADI} kullanıcıları görebilir`
              : 'Profilini yalnızca arkadaşların görebilir'
          }
        />
      </div>
      {hata && <p className="text-xs text-rose-600 mt-3">{hata}</p>}
    </div>
  )
}

// Profil fotoğrafı: dosya seçici + kaldırma. Yeniden boyutlandırma ve
// yükleme sosyal/avatar.ts'te; burada sadece etkileşim var.
function AvatarSecici({
  profil,
  onDegisti,
  onHata,
}: {
  profil: Profil
  onDegisti: () => Promise<void>
  onHata: (m: string | null) => void
}) {
  const [calisiyor, setCalisiyor] = useState(false)
  const girdiRef = useRef<HTMLInputElement>(null)

  async function secildi(dosya: File | undefined) {
    if (!dosya) return
    setCalisiyor(true)
    onHata(null)
    try {
      await avatarYukle(dosya)
      await onDegisti()
    } catch (err) {
      onHata(err instanceof Error ? err.message : 'Fotoğraf yüklenemedi')
    } finally {
      setCalisiyor(false)
      // Aynı dosya tekrar seçilebilsin diye girdiyi sıfırla.
      if (girdiRef.current) girdiRef.current.value = ''
    }
  }

  async function kaldir() {
    setCalisiyor(true)
    onHata(null)
    try {
      await avatarSil()
      await onDegisti()
    } catch (err) {
      onHata(err instanceof Error ? err.message : 'Fotoğraf kaldırılamadı')
    } finally {
      setCalisiyor(false)
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => girdiRef.current?.click()}
        disabled={calisiyor}
        aria-label="Profil fotoğrafını değiştir"
        className="block active:scale-95 transition-transform disabled:opacity-60"
      >
        <Avatar ad={profil.ad} foto={profil.avatar} emoji={profil.emoji} renk={profil.renk} boyut="lg" />
        <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-gradient-orchid text-white flex items-center justify-center shadow-soft ring-2 ring-mist-50">
          <Icon name={calisiyor ? 'Loader2' : 'Camera'} className={`w-4 h-4 ${calisiyor ? 'animate-spin' : ''}`} />
        </span>
      </button>

      {profil.avatar && !calisiyor && (
        <button
          onClick={() => void kaldir()}
          aria-label="Profil fotoğrafını kaldır"
          className="absolute top-0 right-0 w-6 h-6 rounded-full bg-ink-500/80 text-white flex items-center justify-center"
        >
          <Icon name="X" className="w-3.5 h-3.5" />
        </button>
      )}

      <input
        ref={girdiRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void secildi(e.target.files?.[0])}
      />
    </div>
  )
}

function Anahtar({
  acik,
  onDegistir,
  baslik,
  aciklama,
}: {
  acik: boolean
  onDegistir: () => void
  baslik: string
  aciklama: string
}) {
  return (
    <button
      onClick={onDegistir}
      className="w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
    >
      <div
        className={`w-11 h-6 rounded-full transition-colors shrink-0 relative ${
          acik ? 'bg-gradient-orchid' : 'bg-ink-200'
        }`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-soft transition-all ${
            acik ? 'left-[1.375rem]' : 'left-0.5'
          }`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-600">{baslik}</p>
        <p className="text-xs text-ink-400">{aciklama}</p>
      </div>
    </button>
  )
}
