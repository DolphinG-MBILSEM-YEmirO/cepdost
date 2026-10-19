import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PlanlarView } from './components/PlanlarView'
import { SohbetlerView } from './components/SohbetlerView'
import { ArkadaslarView } from './components/ArkadaslarView'
import { SosyalSekmeler } from './components/SosyalSekmeler'
import { PlanLinkiEkrani } from './components/PlanLinkiEkrani'
import { linkiCoz, type PlanLinki } from './sosyal/planLinki'
import { AkisView } from './components/AkisView'
import { ProfilView } from './components/ProfilView'
import { PlanOlustur } from './components/PlanOlustur'
import { RecordDetail } from './components/RecordDetail'
import { Onboarding } from './components/Onboarding'
import { BottomNav, type Tab } from './components/BottomNav'
import type { SosyalBolum } from './components/sekmeler'
import { KenarCubugu } from './components/KenarCubugu'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ChatButton } from './components/ChatButton'
import { ChatPanel } from './components/ChatPanel'
import { GirisEkrani } from './components/GirisEkrani'
import { HesapKurulumu } from './components/HesapKurulumu'
import { SifreBelirle } from './components/SifreBelirle'
import { EpostaDogrulamaEkrani } from './components/EpostaDogrulama'
import { Icon, type IconName } from './components/Icon'
import { useTakvimOtomatikYenile } from './components/TakvimAyarlari'
import { useAuth } from './sosyal/auth'
import { motor, useSosyalSurum } from './sosyal/cekirdek'
import { bekleyenSayisi, profilimiGetir, type Profil } from './sosyal/api'
import { epostaImzacisi } from './sosyal/epostaImzacisi'
import { okunmamisMesajSayisi } from './sosyal/mesajlar'
import { musaitligiSenkronla } from './sosyal/musaitlikSenkron'
import { planlariArkadaEsitle } from './sosyal/planEsitleme'
import { usePlanAyarlari } from './lib/planAyarlari'
import { type Kayit, db, tumKayitlar, kayitEkle, kayitDurumDegistir, goruntulemeBasligi } from './db'
import { planiSil } from './lib/planPaylasimi'
import { kayitSiniflandir } from './classify'
import { onayGecerliMi } from '../shared/epostaOnayi'
import { SLOGAN, UYGULAMA_ADI } from '../shared/marka'

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
  // Davet linkiyle gelindiyse (?ekle=KOD) doğrudan Sohbet → Arkadaşlar açılsın.
  const [davetKodu, setDavetKodu] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('ekle'),
  )
  const [activeTab, setActiveTab] = useState<Tab>(davetKodu ? 'sohbet' : 'planlar')
  const [sosyalBolum, setSosyalBolum] = useState<SosyalBolum>(davetKodu ? 'arkadaslar' : 'sohbetler')
  // Opened from a plan link (#plan=…): that plan is shown first, with or
  // without an account.
  const [planLinki, setPlanLinki] = useState<PlanLinki | null>(() => linkiCoz(window.location.hash))
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

  const { kullanici, yukleniyor: authYukleniyor, yeniHesap, cikis } = useAuth()
  // Bumps whenever social data changes (sync, live events, own writes), so
  // the profile and badges below reload from the local store.
  const sosyalSurum = useSosyalSurum()
  const [profil, setProfil] = useState<Profil | null>(null)
  // Whose profile `profil` is; until it matches the signed-in user the
  // gate waits instead of flashing the setup screen.
  const [profilSahibi, setProfilSahibi] = useState<string | null>(null)
  // A returning user's profile may only exist on the relays: before
  // deciding they need setup, the first sync has to finish.
  const [ilkEsitleme, setIlkEsitleme] = useState<'bekliyor' | 'bitti' | 'hata'>('bekliyor')
  const [esitlemeDenemesi, setEsitlemeDenemesi] = useState(0)
  // The key email attestations are signed with; null when this deployment
  // doesn't verify emails, undefined until known (the app doesn't wait).
  const [epostaImzaci, setEpostaImzaci] = useState<string | null>()

  const kayitlarSonucu = useLiveQuery(() => tumKayitlar(), [])
  // Keep a stable empty array while Dexie is loading; a fresh `[]` on every
  // render would re-run every effect that depends on `kayitlar`.
  const kayitlar = useMemo(() => kayitlarSonucu ?? [], [kayitlarSonucu])
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

  // Pending requests/invites and unread messages, read from the local
  // store whenever social data changes.
  const rozetiTazele = useCallback(() => {
    if (!kullanici) {
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
  }, [rozetiTazele, activeTab, sosyalSurum])

  // The invite link is looked up once; coming back to Arkadaşlar later
  // doesn't search for that person again.
  const davetiKullan = useCallback(() => setDavetKodu(null), [])

  // A plan link opened while the app is already open in this tab.
  useEffect(() => {
    const degisti = () => setPlanLinki(linkiCoz(window.location.hash))
    window.addEventListener('hashchange', degisti)
    return () => window.removeEventListener('hashchange', degisti)
  }, [])

  function planLinkiniKapat() {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setPlanLinki(null)
  }

  // From a plan link: open Sohbet → Arkadaşlar with the host found (after
  // sign-up, for someone who came without an account).
  function linkSahibiniEkle(sahipKodu: string) {
    setDavetKodu(sahipKodu)
    setSosyalBolum('arkadaslar')
    setActiveTab('sohbet')
    planLinkiniKapat()
  }

  // Takvim bağlıysa açılışta sessizce tazele — kullanıcı elle "içe aktar"a
  // basmak zorunda kalmasın.
  useTakvimOtomatikYenile()

  // The gate looks at the username and password flags, so the profile is
  // loaded at App level.
  const profiliYukle = useCallback(async () => {
    if (!kullanici) {
      setProfil(null)
      setProfilSahibi(null)
      return
    }
    try {
      setProfil(await profilimiGetir())
    } catch {
      setProfil(null)
    }
    setProfilSahibi(kullanici.id)
  }, [kullanici])

  useEffect(() => {
    void profiliYukle()
  }, [profiliYukle, sosyalSurum])

  useEffect(() => {
    if (kullanici) void epostaImzacisi().then(setEpostaImzaci)
  }, [kullanici])

  useEffect(() => {
    if (!kullanici) return
    let iptal = false
    setIlkEsitleme('bekliyor')
    void (async () => {
      // Nothing to download for an account created a moment ago, and a
      // profile already on this device means the app can open right away
      // (the background sync keeps it fresh).
      if (yeniHesap || (await profilimiGetir().catch(() => null))) {
        if (!iptal) setIlkEsitleme('bitti')
        return
      }
      try {
        await motor().esitle()
        if (!iptal) setIlkEsitleme('bitti')
      } catch {
        if (!iptal) setIlkEsitleme('hata')
      }
    })()
    return () => {
      iptal = true
    }
  }, [kullanici, yeniHesap, esitlemeDenemesi])

  // Local plans (and imported calendar events) turn into busy ranges for
  // friends. Runs quietly: a failed sync must not block the app.
  const takvimSayisi = useLiveQuery(() => db.takvimEtkinlikleri.count(), [], 0)
  const musaitlikPaylas = profil?.kullanici_adi ? profil.musaitlik_paylas : null
  const planAyarim = usePlanAyarlari()
  useEffect(() => {
    if (!kullanici || musaitlikPaylas === null) return
    const senkronla = () =>
      musaitligiSenkronla(kullanici.id, musaitlikPaylas).catch((err) => {
        console.warn('müsaitlik senkronu başarısız', err)
      })
    void senkronla()
    // An app left open still confirms now and then that its copy is current.
    const zamanlayici = setInterval(() => void senkronla(), 60 * 60 * 1000)
    return () => clearInterval(zamanlayici)
  }, [kullanici, musaitlikPaylas, kayitlar, takvimSayisi, planAyarim])

  // My plans follow me to my other devices: a change here goes out, and
  // one that arrives from another device lands in the local table. Waits a
  // moment so a burst of edits or incoming records costs one round.
  const hesapHazir = Boolean(profil?.kullanici_adi)
  useEffect(() => {
    if (!kullanici || !hesapHazir) return
    const zamanlayici = setTimeout(() => void planlariArkadaEsitle(), 1500)
    return () => clearTimeout(zamanlayici)
  }, [kullanici, hesapHazir, kayitlar, sosyalSurum])

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
    const kayit = kayitlar.find((k) => k.id === id)
    if (kayit) await planiSil(kayit)
  }

  // A plan link comes before everything else: whoever opens it sees the
  // plan, even without an account or before the intro.
  if (planLinki) {
    if (authYukleniyor) return <Bekleme />
    return (
      <PlanLinkiEkrani
        key={`${planLinki.anahtar}-${kullanici ? 'hesap' : 'misafir'}`}
        link={planLinki}
        girisli={!!kullanici}
        onKapat={planLinkiniKapat}
        onSahibiEkle={linkSahibiniEkle}
      />
    )
  }

  // --- Açılış kapısı: tanıtım → giriş → hesap kurulumu → uygulama ---
  // Kullanıcı kararı (2026-08-07): giriş en başta istensin. Paylaşımla
  // gelen içerik kapıdan ÖNCE Dexie'ye yazıldığı için (bkz. sw.ts ve
  // handleGetShareTarget) kaybolmuyor; kullanıcı giriş yaptıktan sonra
  // arşivinde onu buluyor.
  if (showOnboarding) return <Onboarding onDone={handleOnboardingDone} />

  if (authYukleniyor) return <Bekleme />

  if (!kullanici) {
    return (
      <TekEkran>
        <GirisEkrani />
      </TekEkran>
    )
  }

  if (profilSahibi !== kullanici.id || (!profil && ilkEsitleme === 'bekliyor')) {
    return <Bekleme metin={profilSahibi === kullanici.id ? 'Hesabın getiriliyor...' : undefined} />
  }

  if (!profil && ilkEsitleme === 'hata') {
    return (
      <TekEkran>
        <BaglantiHatasi onTekrar={() => setEsitlemeDenemesi((n) => n + 1)} onCikis={() => void cikis()} />
      </TekEkran>
    )
  }

  // Order matters: the password backup is filed under the username, so the
  // username comes first. Both flags live in the profile record, so a step
  // left half-way shows up again on the next launch.
  if (!profil || !profil.kullanici_adi) {
    return (
      <TekEkran>
        <HesapKurulumu profil={profil} onTamamlandi={profiliYukle} />
      </TekEkran>
    )
  }

  if (!profil.sifre_belirlendi) {
    return (
      <TekEkran>
        <SifreBelirle onTamamlandi={profiliYukle} />
      </TekEkran>
    )
  }

  // Accounts made before emails were required verify once, too.
  if (epostaImzaci && !onayGecerliMi(profil.onay, profil.id, epostaImzaci)) {
    return (
      <TekEkran>
        <EpostaDogrulamaEkrani onTamamlandi={profiliYukle} onCikis={() => void cikis()} />
      </TekEkran>
    )
  }

  function arkadaslariAc() {
    setSosyalBolum('arkadaslar')
    setActiveTab('sohbet')
  }

  const sosyalUst = (
    <SosyalSekmeler secili={sosyalBolum} onSec={setSosyalBolum} sohbetRozeti={mesajRozeti} arkadasRozeti={rozet} />
  )

  // Phone: one column under a bottom bar. Desktop (lg): a sidebar and a
  // wider content area; the Sohbet tab uses the full width (two panes for
  // chats) and both of its sides line up under the same switch.
  const icerikGenisligi =
    activeTab === 'sohbet' ? 'lg:max-w-none lg:px-0' : activeTab === 'akis' ? 'lg:max-w-4xl lg:pt-4' : 'lg:max-w-6xl lg:pt-4'

  return (
    <div className="min-h-screen bg-uygulama">
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

      <KenarCubugu
        active={activeTab}
        onChange={setActiveTab}
        onAddClick={() => setShowCapture(true)}
        onAsistan={() => setShowChat(true)}
        profil={profil}
        sohbetRozeti={mesajRozeti + rozet}
      />

      <main className="lg:pl-64">
        <div className={`min-h-screen max-w-md md:max-w-2xl mx-auto relative lg:px-6 ${icerikGenisligi}`}>
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

          {activeTab === 'sohbet' &&
            (sosyalBolum === 'sohbetler' ? (
              <SohbetlerView
                onDegisti={rozetiTazele}
                ust={sosyalUst}
                onArkadasEkle={() => setSosyalBolum('arkadaslar')}
              />
            ) : (
              <ArkadaslarView
                baslangicKodu={davetKodu}
                onBaslangicKullanildi={davetiKullan}
                onDegisti={rozetiTazele}
                ust={sosyalUst}
              />
            ))}

          {activeTab === 'akis' && <AkisView />}

          {activeTab === 'profil' && (
            <ProfilView
              kayitlar={kayitlar}
              loading={loading}
              onDegisti={rozetiTazele}
              onArkadaslar={arkadaslariAc}
              onRecordClick={(k) => setDetailKayit(k)}
              onToggleStatus={handleToggleStatus}
              onDelete={(id) => {
                const k = kayitlar.find((r) => r.id === id)
                if (k) setDeleteTarget(k)
              }}
            />
          )}
        </div>
      </main>

      {/* Sohbet butonu Profil'de ve Arkadaşlar'da gizleniyor — o ekranların
          kendi aksiyonları var, sağ altta ikinci bir yüzen buton kalabalık yapıyor. */}
      {activeTab !== 'profil' && !(activeTab === 'sohbet' && sosyalBolum === 'arkadaslar') && (
        <ChatButton onClick={() => setShowChat(true)} />
      )}
      <BottomNav
        active={activeTab}
        onChange={setActiveTab}
        onAddClick={() => setShowCapture(true)}
        sohbetRozeti={mesajRozeti + rozet}
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

// Sign-in and setup screens. On desktop the form sits next to a brand
// panel instead of stretching across the screen.
function TekEkran({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-uygulama lg:grid lg:grid-cols-2">
      <MarkaPaneli />
      <div className="max-w-md mx-auto w-full relative min-h-screen lg:min-h-0 lg:flex lg:flex-col lg:justify-center lg:py-12">
        {children}
      </div>
    </div>
  )
}

function MarkaPaneli() {
  const maddeler: { ikon: IconName; metin: string }[] = [
    { ikon: 'Sparkles', metin: 'Bir link, ekran görüntüsü ya da not paylaş; saatiyle, yeriyle hazır bir plana dönüşsün.' },
    { ikon: 'CalendarClock', metin: 'Arkadaşlarının boş saatlerini gör, herkese uyan zamanı tek dokunuşla bul.' },
    { ikon: 'MapPin', metin: "Arkadaşlarının gittiği yerleri Keşfet'te gör, sıradaki buluşmanı oradan seç." },
    { ikon: 'Wand2', metin: 'Asistana "Cumartesi Ayşe\'yle kahvaltı" yaz; saati bulsun, davetleri hazırlasın.' },
  ]
  return (
    <div className="hidden lg:flex flex-col justify-between bg-gradient-orchid-deep text-white p-12 relative overflow-hidden">
      {/* Soft light behind the text, like petals out of focus. */}
      <div aria-hidden className="absolute -top-28 -right-20 w-96 h-96 rounded-full bg-violet-400/30 blur-3xl" />
      <div aria-hidden className="absolute -bottom-36 -left-24 w-[28rem] h-[28rem] rounded-full bg-sky-400/20 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-2xl ring-2 ring-white/30" />
        <span className="font-display text-2xl font-bold">{UYGULAMA_ADI}</span>
      </div>
      <div className="relative max-w-md">
        <h2 className="font-display text-4xl font-bold leading-tight text-balance mb-3">{SLOGAN}</h2>
        <p className="text-white/80 leading-relaxed mb-8">Arkadaş grubunun ortak planlama alanı: kim ne zaman boş, nereye gidiliyor, ne kaydedildi; hepsi tek yerde.</p>
        <ul className="space-y-5">
          {maddeler.map((m) => (
            <li key={m.ikon} className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-white/15 ring-1 ring-white/20 flex items-center justify-center shrink-0">
                <Icon name={m.ikon} className="w-5 h-5" />
              </span>
              <span className="text-white/90 leading-relaxed pt-1.5">{m.metin}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-sm text-white/70">Ücretsiz. Reklamsız. Paylaştıkların uçtan uca şifreli.</p>
    </div>
  )
}

function Bekleme({ metin }: { metin?: string }) {
  return (
    <div className="min-h-screen bg-uygulama max-w-md mx-auto flex flex-col items-center justify-center gap-3">
      <Icon name="Loader2" className="w-6 h-6 animate-spin text-ink-300" />
      {metin && <p className="text-sm text-ink-400">{metin}</p>}
    </div>
  )
}

// Shown when a returning user's profile couldn't be downloaded: opening the
// setup screen instead would make them pick a new username for nothing.
function BaglantiHatasi({ onTekrar, onCikis }: { onTekrar: () => void; onCikis: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
        <Icon name="WifiOff" className="w-7 h-7 text-amber-600" />
      </div>
      <h1 className="font-display text-xl font-bold text-ink-700 mb-2">Hesabın getirilemedi</h1>
      <p className="text-sm text-ink-400 leading-relaxed mb-6">
        Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene; planların ve arşivin bu telefonda duruyor.
      </p>
      <button onClick={onTekrar} className="btn-primary w-full max-w-xs">
        Tekrar dene
      </button>
      <button onClick={onCikis} className="btn-ghost w-full max-w-xs mt-3 text-sm">
        Başka bir hesapla gir
      </button>
    </div>
  )
}
