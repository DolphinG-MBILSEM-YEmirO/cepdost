import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PlanlarView } from './components/PlanlarView'
import { HomeWidgets } from './components/widgets/HomeWidgets'
import { listenForWidgetTaps } from './widgets/nativeBridge'
import { SohbetlerView } from './components/SohbetlerView'
import { ArkadaslarView } from './components/ArkadaslarView'
import { SosyalSekmeler } from './components/SosyalSekmeler'
import { PlanLinkiEkrani } from './components/PlanLinkiEkrani'
import { linkiCoz, sharloopKaynagi, type LinkKaynagi } from './sosyal/planLinki'
import { davetKaynagi, davetLinkiCoz } from './sosyal/davet'
import { AkisView } from './components/AkisView'
import { ProfilView } from './components/ProfilView'
import { PlanOlustur } from './components/PlanOlustur'
import { OlusturMenusu } from './components/OlusturMenusu'
import { PaylasimOlustur } from './components/PaylasimOlustur'
import { RecordDetail } from './components/RecordDetail'
import { Onboarding } from './components/Onboarding'
import { BottomNav, type Tab } from './components/BottomNav'
import type { SosyalBolum } from './components/sekmeler'
import { KenarCubugu } from './components/KenarCubugu'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ChatButton } from './components/ChatButton'
import { EkranBasligi } from './ui/EkranBasligi'
import { ChatPanel } from './components/ChatPanel'
import { GirisEkrani } from './components/GirisEkrani'
import { HesapKurulumu } from './components/HesapKurulumu'
import { SifreBelirle } from './components/SifreBelirle'
import { EpostaDogrulamaEkrani } from './components/EpostaDogrulama'
import { Icon, type IconName } from './components/Icon'
import { useTakvimOtomatikYenile } from './components/TakvimAyarlari'
import { useBildirimler } from './bildirim/useBildirimler'
import { usePlanHatirlaticilari } from './bildirim/planHatirlaticilari'
import { useAuth } from './sosyal/auth'
import { motor, useSosyalSurum } from './sosyal/cekirdek'
import { bekleyenSayisi, profilimiGetir, type Profil } from './sosyal/api'
import { epostaImzacisi } from './sosyal/epostaImzacisi'
import { okunmamisMesajSayisi } from './sosyal/mesajlar'
import { musaitligiSenkronla } from './sosyal/musaitlikSenkron'
import { planlariArkadaEsitle } from './sosyal/planEsitleme'
import { usePlanAyarlari } from './lib/planAyarlari'
import { useGeriAdimi } from './lib/geriTusu'
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
    window.history.replaceState(window.history.state, '', '/?shared=ok')
    return 'ok'
  } catch (err) {
    console.error('share-target (iOS): kayıt oluşturulamadı', err)
    window.history.replaceState(window.history.state, '', '/?shared=error')
    return 'error'
  }
}

// A plan link in the address: #plan=… (Sharloop's own, older links) or
// #davet=… ("Sharloop'ta aç" on a Davet invite).
function adrestekiLink(hash: string): LinkKaynagi | null {
  const link = linkiCoz(hash)
  if (link) return sharloopKaynagi(link)
  const davet = davetLinkiCoz(hash)
  return davet ? davetKaynagi(davet) : null
}

export default function App() {
  // Davet linkiyle gelindiyse (?ekle=KOD) doğrudan Sohbet → Arkadaşlar açılsın.
  const [davetKodu, setDavetKodu] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('ekle'),
  )
  const [activeTab, setActiveTab] = useState<Tab>(davetKodu ? 'sohbet' : 'planlar')
  const [sosyalBolum, setSosyalBolum] = useState<SosyalBolum>(davetKodu ? 'arkadaslar' : 'sohbetler')
  // A chat to open, from a tapped notification.
  const [acilacakSohbet, setAcilacakSohbet] = useState<string | null>(null)
  // Opened from a plan link: that plan is shown first. An old #plan= link
  // works without an account too; a Davet invite waits for sign-in (people
  // without the app answer in Davet itself).
  const [planLinki, setPlanLinki] = useState<LinkKaynagi | null>(() => adrestekiLink(window.location.hash))
  const [showCapture, setShowCapture] = useState(false)
  // The "+" button's choice (post or plan), and the post composer.
  const [showOlustur, setShowOlustur] = useState(false)
  const [showPaylasim, setShowPaylasim] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [banner, setBanner] = useState<ShareBanner>(
    () => new URLSearchParams(window.location.search).get('shared') as ShareBanner,
  )
  const [detailKayit, setDetailKayit] = useState<Kayit | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Kayit | null>(null)
  const [rozet, setRozet] = useState(0)
  // Bumped when the open tab is tapped again, which restarts that tab.
  const [sekmeBasi, setSekmeBasi] = useState(0)
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
      window.history.replaceState(window.history.state, '', '/')
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
    const degisti = () => setPlanLinki(adrestekiLink(window.location.hash))
    window.addEventListener('hashchange', degisti)
    return () => window.removeEventListener('hashchange', degisti)
  }, [])

  function planLinkiniKapat() {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
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

  // A tapped notification leads to the chat, the friends list or the plan.
  const bildirimeGit = useCallback((git: string) => {
    const [tur, deger] = [git.slice(0, git.indexOf(':')), git.slice(git.indexOf(':') + 1)]
    if (git === 'arkadaslar') {
      setSosyalBolum('arkadaslar')
      setActiveTab('sohbet')
    } else if (git === 'akis') {
      setActiveTab('akis')
    } else if (tur === 'dm' || tur === 'grup') {
      setSosyalBolum('sohbetler')
      setActiveTab('sohbet')
      setAcilacakSohbet(deger)
    } else if (tur === 'link' || tur === 'davet') {
      void db.kayitlar
        .filter((k) => (tur === 'link' ? k.planLinki : k.davetLinki) === deger)
        .first()
        .then((k) => k && setDetailKayit(k))
    } else if (tur === 'plan') {
      void db.kayitlar.get(deger).then((k) => k && setDetailKayit(k))
    }
  }, [])
  const sohbetAcildi = useCallback(() => setAcilacakSohbet(null), [])

  // A friend to invite, from a tap on the "free now" home-screen widget.
  const [widgetDavetKisisi, setWidgetDavetKisisi] = useState<string | null>(null)
  // A memory's chat from the home widget (or the feed when it has none).
  const aniyaGit = useCallback(
    (hedef: string | null) => (hedef ? bildirimeGit(hedef) : setActiveTab('akis')),
    [bildirimeGit],
  )
  // Taps on the phone's home-screen widgets (native app) or ?widget= links.
  useEffect(
    () =>
      listenForWidgetTaps((hedef) => {
        const ayrac = hedef.indexOf(':')
        const [tur, deger] = ayrac < 0 ? [hedef, ''] : [hedef.slice(0, ayrac), hedef.slice(ayrac + 1)]
        if (tur === 'plan' && deger) {
          setActiveTab('planlar')
          bildirimeGit(`plan:${deger}`)
        } else if (tur === 'friend' && deger) {
          setActiveTab('planlar')
          setWidgetDavetKisisi(deger)
        } else if (tur === 'memory') {
          aniyaGit(deger || null)
        } else if (tur === 'new-plan') {
          setShowCapture(true)
        } else {
          setActiveTab('planlar')
        }
      }),
    [bildirimeGit, aniyaGit],
  )
  useBildirimler(!!kullanici && !!profil, bildirimeGit)
  // The reminders set on plans, while the app is open.
  usePlanHatirlaticilari(kayitlar)

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
  // plan, even without an account or before the intro. A Davet invite is
  // for people with the app (the rest open it in Davet), so it waits until
  // the account is fully set up; the steps below come first.
  if (planLinki) {
    if (authYukleniyor) return <Bekleme />
    const hesapTamam =
      !!kullanici &&
      profilSahibi === kullanici.id &&
      !!profil?.kullanici_adi &&
      !!profil.sifre_belirlendi &&
      (!epostaImzaci || onayGecerliMi(profil.onay, profil.id, epostaImzaci))
    if (planLinki.tur === 'sharloop' || hesapTamam) {
      return (
        <PlanLinkiEkrani
          key={`${planLinki.id}-${kullanici ? 'hesap' : 'misafir'}`}
          link={planLinki}
          girisli={!!kullanici}
          onKapat={planLinkiniKapat}
          onSahibiEkle={linkSahibiniEkle}
        />
      )
    }
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

  // Tapping the tab you're already on goes back to its start: open chats and
  // sub-views close, Sohbet returns to the chat list, the page scrolls up.
  function sekmeSec(sekme: Tab) {
    if (sekme !== activeTab) {
      setActiveTab(sekme)
      return
    }
    if (sekme === 'sohbet') setSosyalBolum('sohbetler')
    setSekmeBasi((n) => n + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function arkadaslariAc() {
    setSosyalBolum('arkadaslar')
    setActiveTab('sohbet')
  }

  // The assistant button sits next to the switch on the chats side only, as
  // the floating button did before (Arkadaşlar has its own actions).
  const sosyalUst = (
    <EkranBasligi
      baslik="Sohbet"
      eylemler={sosyalBolum === 'sohbetler' && <ChatButton onClick={() => setShowChat(true)} />}
    >
      <SosyalSekmeler secili={sosyalBolum} onSec={setSosyalBolum} sohbetRozeti={mesajRozeti} arkadasRozeti={rozet} />
    </EkranBasligi>
  )

  // Phone: one column under a bottom bar. Desktop (lg): a sidebar and a
  // wider content area; the Sohbet tab uses the full width (two panes for
  // chats) and both of its sides line up under the same switch.
  const icerikGenisligi =
    activeTab === 'sohbet' ? 'lg:max-w-none lg:px-0' : activeTab === 'akis' ? 'lg:max-w-4xl lg:pt-4' : 'lg:max-w-6xl lg:pt-4'

  return (
    <div className="min-h-screen bg-uygulama" data-bolum={activeTab}>
      <SekmeGeriAdimlari
        sekme={activeTab}
        sosyalBolum={sosyalBolum}
        onSekme={setActiveTab}
        onSosyalBolum={setSosyalBolum}
      />

      {banner === 'ok' && (
        <div className="fixed top-0 left-0 right-0 z-50 safe-top px-4 pt-2 animate-slide-down">
          <div role="status" className="bg-ink-800 text-white text-sm font-medium rounded-xl px-4 py-3 shadow-float flex items-center gap-2.5 max-w-md mx-auto">
            <Icon name="CheckCircle2" className="w-5 h-5 text-teal-300 shrink-0" />
            <span className="flex-1">Paylaşım alındı, Arşiv'de görünüyor.</span>
            <button onClick={() => setBanner(null)} aria-label="Kapat" className="shrink-0 -m-1 p-1 rounded-lg text-white/70 hover:text-white">
              <Icon name="X" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {banner === 'error' && (
        <div className="fixed top-0 left-0 right-0 z-50 safe-top px-4 pt-2 animate-slide-down">
          <div role="alert" className="bg-ink-800 text-white text-sm font-medium rounded-xl px-4 py-3 shadow-float flex items-center gap-2.5 max-w-md mx-auto">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-300 shrink-0" />
            <span className="flex-1">Paylaşım alınamadı. Paylaş menüsünden yeniden gönder.</span>
            <button onClick={() => setBanner(null)} aria-label="Kapat" className="shrink-0 -m-1 p-1 rounded-lg text-white/70 hover:text-white">
              <Icon name="X" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <KenarCubugu
        active={activeTab}
        onChange={sekmeSec}
        onAddClick={() => setShowOlustur(true)}
        onAsistan={() => setShowChat(true)}
        profil={profil}
        sohbetRozeti={mesajRozeti + rozet}
      />

      <main className="lg:pl-64">
        {/* key: every tab switch (or a tap on the open tab) replays the page entrance. */}
        <div key={`${activeTab}-${sekmeBasi}`} className={`min-h-screen max-w-md md:max-w-2xl mx-auto relative lg:px-6 animate-sayfa ${icerikGenisligi}`}>
          {activeTab === 'planlar' && (
            <PlanlarView
              kayitlar={kayitlar}
              loading={loading}
              onAddClick={() => setShowCapture(true)}
              onAsistan={() => setShowChat(true)}
              widgets={
                <HomeWidgets
                  kayitlar={kayitlar}
                  signedIn={!!kullanici}
                  onOpenPlan={(k) => setDetailKayit(k)}
                  onCreatePlan={() => setShowCapture(true)}
                  onOpenChat={aniyaGit}
                  onFindFriends={() => {
                    setSosyalBolum('arkadaslar')
                    setActiveTab('sohbet')
                  }}
                  inviteFriendId={widgetDavetKisisi}
                  onInviteHandled={() => setWidgetDavetKisisi(null)}
                />
              }
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
                acilacak={acilacakSohbet}
                onAcildi={sohbetAcildi}
              />
            ) : (
              <ArkadaslarView
                baslangicKodu={davetKodu}
                onBaslangicKullanildi={davetiKullan}
                onDegisti={rozetiTazele}
                ust={sosyalUst}
              />
            ))}

          {activeTab === 'akis' && (
            <AkisView
              onPlanAc={(k) => setDetailKayit(k)}
              onAsistan={() => setShowChat(true)}
              onPaylas={() => setShowPaylasim(true)}
            />
          )}

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

      <BottomNav
        active={activeTab}
        onChange={sekmeSec}
        onAddClick={() => setShowOlustur(true)}
        sohbetRozeti={mesajRozeti + rozet}
      />

      {showOlustur && (
        <OlusturMenusu
          onKapat={() => setShowOlustur(false)}
          onSec={(secim) => {
            setShowOlustur(false)
            if (secim === 'plan') setShowCapture(true)
            else setShowPaylasim(true)
          }}
        />
      )}

      {showPaylasim && (
        <PaylasimOlustur
          onKapat={() => setShowPaylasim(false)}
          onPaylasildi={() => {
            setShowPaylasim(false)
            setActiveTab('akis')
          }}
        />
      )}

      {/* A new plan lands in Planlar, so that's where the app goes once it's
          saved (as a new post leads to Akış). */}
      {showCapture && <PlanOlustur onClose={() => setShowCapture(false)} onSaved={() => setActiveTab('planlar')} />}

      {showChat && <ChatPanel kayitlar={kayitlar} onClose={() => setShowChat(false)} />}

      {detailKayit && (
        <RecordDetail
          kayit={detailKayit}
          onClose={() => setDetailKayit(null)}
          onUpdated={() => {}}
          onDeleted={() => setDetailKayit(null)}
          onSohbeteGit={(git) => {
            setDetailKayit(null)
            bildirimeGit(git)
          }}
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

// The phone's back button leads home before it leaves the app: from
// Arkadaşlar to Sohbetler, from any other tab to Planlar. Rendered with the
// main screens only, so the sign-in steps hold no tab step.
function SekmeGeriAdimlari({
  sekme,
  sosyalBolum,
  onSekme,
  onSosyalBolum,
}: {
  sekme: Tab
  sosyalBolum: SosyalBolum
  onSekme: (sekme: Tab) => void
  onSosyalBolum: (bolum: SosyalBolum) => void
}) {
  useGeriAdimi(() => onSekme('planlar'), sekme !== 'planlar')
  useGeriAdimi(() => onSosyalBolum('sohbetler'), sekme === 'sohbet' && sosyalBolum === 'arkadaslar')
  return null
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
    { ikon: 'Share2', metin: 'Bir link, ekran görüntüsü ya da not paylaş; saatiyle, yeriyle hazır bir plana dönüşsün.' },
    { ikon: 'CalendarClock', metin: 'Arkadaşlarının boş saatlerini gör, herkese uyan zamanı tek dokunuşla bul.' },
    { ikon: 'MapPin', metin: "Arkadaşlarının gittiği yerleri Keşfet'te gör, sıradaki buluşmanı oradan seç." },
    { ikon: 'MessageCircle', metin: 'Asistana "Cumartesi Ayşe\'yle kahvaltı" yaz; saati bulsun, davetleri hazırlasın.' },
  ]
  return (
    <div className="hidden lg:flex flex-col justify-between bg-ink-900 text-white p-12 relative overflow-hidden">
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
      <Icon name="Loader2" className="w-6 h-6 animate-spin text-ink-400" />
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
      <h1 className="text-title text-ink-800 mb-2">Hesabın getirilemedi</h1>
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
