import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PlanlarView } from './components/PlanlarView'
import { SohbetlerView } from './components/SohbetlerView'
import { AkisView } from './components/AkisView'
import { ProfilView } from './components/ProfilView'
import { PlanOlustur } from './components/PlanOlustur'
import { RecordDetail } from './components/RecordDetail'
import { Onboarding } from './components/Onboarding'
import { BottomNav, type Tab } from './components/BottomNav'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ChatButton } from './components/ChatButton'
import { ChatPanel } from './components/ChatPanel'
import { GirisEkrani } from './components/GirisEkrani'
import { HesapKurulumu } from './components/HesapKurulumu'
import { SifreBelirle } from './components/SifreBelirle'
import { Icon } from './components/Icon'
import { useTakvimOtomatikYenile } from './components/TakvimAyarlari'
import { useAuth } from './sosyal/auth'
import { sosyalAktif } from './sosyal/supabase'
import { bekleyenSayisi, profilimiGetir, type Profil } from './sosyal/api'
import { okunmamisMesajSayisi } from './sosyal/mesajlar'
import { type Kayit, tumKayitlar, kayitEkle, kayitDurumDegistir, kayitSil, goruntulemeBasligi } from './db'
import { kayitSiniflandir } from './classify'

const ONBOARDED_KEY = 'cepdost_onboarded'

type ShareBanner = 'ok' | 'error' | null

// iOS (Spike B): Safari'de Web Share Target API yok, plan kullanıcının
// kuracağı bir Shortcut'un "Open URL" ile /share-target/?title=&text=&url=
// adresine düz bir GET yapması — servis çalışanı devreye girmiyor.
// Android'in POST tabanlı yolu sw.ts'te, orada da aynı şekilde arka planda
// sınıflandırılıyor. Her iki yol da OTOMATIK — kullanıcı hiçbir şey
// onaylamıyor. "+" butonu ise yakalama değil PLAN OLUŞTURMA akışı
// (bkz. PlanOlustur) — link/görsel yakalama tamamen paylaş menüsünde.
async function handleGetShareTarget(): Promise<ShareBanner> {
  if (window.location.pathname !== '/share-target/') return null

  const params = new URLSearchParams(window.location.search)
  const hamBaslik = params.get('title') || ''
  const hamMetin = params.get('text') || ''
  const hamLink = params.get('url') || ''
  if (!hamBaslik && !hamMetin && !hamLink) return null

  try {
    const kayit = await kayitEkle({ hamBaslik, hamMetin, hamLink })
    void kayitSiniflandir(kayit)
    window.history.replaceState({}, '', '/?shared=ok')
    return 'ok'
  } catch (err) {
    console.error('share-target (iOS): kayıt oluşturulamadı', err)
    window.history.replaceState({}, '', '/?shared=error')
    return 'error'
  }
}

export default function App() {
  // Davet linkiyle gelindiyse (?ekle=KOD) doğrudan Arkadaşlar sekmesi açılsın.
  const [davetKodu] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('ekle'),
  )
  const [activeTab, setActiveTab] = useState<Tab>(davetKodu ? 'profil' : 'planlar')
  const [showCapture, setShowCapture] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [banner, setBanner] = useState<ShareBanner>(
    () => new URLSearchParams(window.location.search).get('shared') as ShareBanner,
  )
  const [detailKayit, setDetailKayit] = useState<Kayit | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Kayit | null>(null)
  const [rozet, setRozet] = useState(0)
  const [mesajRozeti, setMesajRozeti] = useState(0)

  const { kullanici, yukleniyor: authYukleniyor } = useAuth()
  const [profil, setProfil] = useState<Profil | null>(null)
  const [profilYuklendi, setProfilYuklendi] = useState(false)

  const kayitlarSonucu = useLiveQuery(() => tumKayitlar(), [])
  const kayitlar = kayitlarSonucu ?? []
  const loading = kayitlarSonucu === undefined

  useEffect(() => {
    if (!localStorage.getItem(ONBOARDED_KEY)) setShowOnboarding(true)

    handleGetShareTarget().then((sonuc) => {
      if (sonuc) setBanner(sonuc)
    })
    if (banner) {
      window.history.replaceState({}, '', '/')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Bekleyen istek/davet rozeti. Sekme değiştikçe tazelenir — gerçek zamanlı
  // abonelik yerine bu yeterli, hem daha az bağlantı tüketiyor.
  const rozetiTazele = useCallback(() => {
    if (!sosyalAktif || !kullanici) {
      setRozet(0)
      setMesajRozeti(0)
      return
    }
    bekleyenSayisi()
      .then(setRozet)
      .catch(() => setRozet(0))
    okunmamisMesajSayisi()
      .then(setMesajRozeti)
      .catch(() => setMesajRozeti(0))
  }, [kullanici])

  useEffect(() => {
    rozetiTazele()
  }, [rozetiTazele, activeTab])

  // Takvim bağlıysa açılışta sessizce tazele — kullanıcı elle "içe aktar"a
  // basmak zorunda kalmasın.
  useTakvimOtomatikYenile()

  // Giriş kapısı, kullanıcı adının belirlenip belirlenmediğine bakıyor —
  // o yüzden profil App seviyesinde yükleniyor.
  const profiliYukle = useCallback(async () => {
    if (!sosyalAktif || !kullanici) {
      setProfil(null)
      setProfilYuklendi(true)
      return
    }
    try {
      setProfil(await profilimiGetir())
    } catch {
      // Ağ hatasında kullanıcıyı kapıda kilitli bırakmamak için null
      // bırakıp devam ediyoruz; kurulum ekranı bir sonraki açılışta çıkar.
      setProfil(null)
    } finally {
      setProfilYuklendi(true)
    }
  }, [kullanici])

  useEffect(() => {
    setProfilYuklendi(false)
    void profiliYukle()
  }, [profiliYukle])

  // Detay ekranı açıkken arka planda kayıt güncellenirse (F2 sınıflandırma
  // biterse) gösterilen kopyayı da tazele.
  useEffect(() => {
    if (!detailKayit) return
    const guncel = kayitlar.find((k) => k.id === detailKayit.id)
    if (guncel && guncel !== detailKayit) setDetailKayit(guncel)
  }, [kayitlar, detailKayit])

  function handleOnboardingDone() {
    localStorage.setItem(ONBOARDED_KEY, '1')
    setShowOnboarding(false)
  }

  async function handleToggleStatus(id: string) {
    const kayit = kayitlar.find((k) => k.id === id)
    if (!kayit) return
    await kayitDurumDegistir(id, kayit.durum === 'bekliyor' ? 'yapildi' : 'bekliyor')
  }

  async function handleDelete(id: string) {
    await kayitSil(id)
  }

  // --- Açılış kapısı: tanıtım → giriş → hesap kurulumu → uygulama ---
  // Kullanıcı kararı (2026-08-07): giriş en başta istensin. Paylaşımla
  // gelen içerik kapıdan ÖNCE Dexie'ye yazıldığı için (bkz. sw.ts ve
  // handleGetShareTarget) kaybolmuyor; kullanıcı giriş yaptıktan sonra
  // arşivinde onu buluyor.
  if (showOnboarding) {
    return (
      <div className="min-h-screen bg-cream-100 max-w-md mx-auto relative">
        <Onboarding onDone={handleOnboardingDone} />
      </div>
    )
  }

  if (sosyalAktif) {
    if (authYukleniyor || !profilYuklendi) {
      return (
        <div className="min-h-screen bg-cream-100 max-w-md mx-auto flex items-center justify-center">
          <Icon name="Loader2" className="w-6 h-6 animate-spin text-ink-300" />
        </div>
      )
    }

    if (!kullanici) {
      return (
        <div className="min-h-screen bg-cream-100 max-w-md mx-auto relative">
          <GirisEkrani
            baslik="CepDost'a hoş geldin"
            altBaslik="Başlamak için giriş yap"
            tanitimBaslik="Kaydettiğin şey işe yarasın"
            tanitimMetin="Paylaştığın linkleri ve görselleri otomatik planlara çevirir, arkadaşlarınla birlikte plan yapmanı sağlar."
            altNot="Hesabın plan detaylarını sunucuya taşımaz — planların telefonunda kalmaya devam eder."
          />
        </div>
      )
    }

    // Sıra önemli: önce şifre, sonra profil. Şifre adımı yarıda kalırsa
    // kullanıcı bir sonraki açılışta yine burada karşılanır (bayrak
    // veritabanında tutuluyor, yerel state'te değil).
    if (profil && !profil.sifre_belirlendi) {
      return (
        <div className="min-h-screen bg-cream-100 max-w-md mx-auto relative">
          <SifreBelirle onTamamlandi={profiliYukle} />
        </div>
      )
    }

    if (profil && !profil.kullanici_adi) {
      return (
        <div className="min-h-screen bg-cream-100 max-w-md mx-auto relative">
          <HesapKurulumu profil={profil} onTamamlandi={profiliYukle} />
        </div>
      )
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 max-w-md mx-auto relative">

      {banner === 'ok' && (
        <div className="fixed top-0 left-0 right-0 z-50 safe-top px-4 pt-2 animate-slide-down">
          <div className="bg-teal-500 text-white text-sm font-medium rounded-2xl px-4 py-3 shadow-float flex items-center gap-2 max-w-md mx-auto">
            <span className="flex-1">Paylaşım alındı, arşivde görünüyor 👇</span>
            <button onClick={() => setBanner(null)} className="shrink-0">✕</button>
          </div>
        </div>
      )}
      {banner === 'error' && (
        <div className="fixed top-0 left-0 right-0 z-50 safe-top px-4 pt-2 animate-slide-down">
          <div className="bg-rose-500 text-white text-sm font-medium rounded-2xl px-4 py-3 shadow-float flex items-center gap-2 max-w-md mx-auto">
            <span className="flex-1">Paylaşım alınamadı, tekrar dener misin?</span>
            <button onClick={() => setBanner(null)} className="shrink-0">✕</button>
          </div>
        </div>
      )}

      <div className="min-h-screen">
        {activeTab === 'planlar' && (
          <PlanlarView
            kayitlar={kayitlar}
            loading={loading}
            onAddClick={() => setShowCapture(true)}
            onRecordClick={(k) => setDetailKayit(k)}
            onToggleStatus={handleToggleStatus}
            onDelete={(id) => {
              const k = kayitlar.find((r) => r.id === id)
              if (k) setDeleteTarget(k)
            }}
          />
        )}

        {activeTab === 'sohbet' && <SohbetlerView onDegisti={rozetiTazele} />}

        {activeTab === 'akis' && <AkisView />}

        {activeTab === 'profil' && (
          <ProfilView
            kayitlar={kayitlar}
            loading={loading}
            baslangicKodu={davetKodu}
            onDegisti={rozetiTazele}
            onRecordClick={(k) => setDetailKayit(k)}
            onToggleStatus={handleToggleStatus}
            onDelete={(id) => {
              const k = kayitlar.find((r) => r.id === id)
              if (k) setDeleteTarget(k)
            }}
          />
        )}
      </div>

      {/* Sohbet butonu Profil sekmesinde gizleniyor — o ekranın kendi
          aksiyonları var, sağ altta ikinci bir yüzen buton kalabalık yapıyor. */}
      {activeTab !== 'profil' && <ChatButton onClick={() => setShowChat(true)} />}
      <BottomNav
        active={activeTab}
        onChange={setActiveTab}
        onAddClick={() => setShowCapture(true)}
        profilRozeti={rozet}
        sohbetRozeti={mesajRozeti}
      />

      {showCapture && <PlanOlustur onClose={() => setShowCapture(false)} onSaved={() => {}} />}

      {showChat && <ChatPanel kayitlar={kayitlar} onClose={() => setShowChat(false)} />}

      {detailKayit && (
        <RecordDetail
          kayit={detailKayit}
          onClose={() => setDetailKayit(null)}
          onUpdated={() => {}}
          onDeleted={() => setDetailKayit(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Kaydı sil?"
          message={`"${goruntulemeBasligi(deleteTarget)}" kalıcı olarak silinecek. Geri alınamaz.`}
          onConfirm={() => {
            handleDelete(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
