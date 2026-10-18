import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Avatar, GrupAvatari } from './Avatar'
import { ArkadasMusaitlik } from './ArkadasMusaitlik'
import { ProfilDuzenle } from './ProfilDuzenle'
import { PlanTercihleri } from './PlanTercihleri'
import { useAuth } from '../sosyal/auth'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { avatarSil, avatarYukle } from '../sosyal/avatar'
import {
  arkadaslariGetir,
  arkadaslikIsteGonder,
  arkadaslikYanitla,
  arkadasliktanCik,
  davetleriGetir,
  profilAra,
  profilGuncelle,
  profilimiGetir,
  type Arkadas,
  type AramaSonucu,
  type PlanDaveti,
  type Profil,
} from '../sosyal/api'
import { GrupDetay } from './GrupDetay'
import { OrtakPlanSihirbazi } from './OrtakPlanSihirbazi'
import { grupOlustur, gruplarimiGetir, type Grup } from '../sosyal/gruplar'
import { davetiYanitla, planGectiMi } from '../lib/planPaylasimi'
import { formatDate, formatPlanTime } from '../lib/format'
import { GRUP_ACIKLAMA_MAKS, GRUP_EMOJILERI, renkAl } from '../lib/kisisellestirme'
import { EmojiSecici, RenkSecici } from './Seciciler'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'

interface Props {
  // Set when the app was opened from an invite link (?ekle=CODE): the
  // search box starts filled in.
  baslangicKodu?: string | null
  onDegisti?: () => void
}

// The sign-in gate in App guarantees an account here.
export function ArkadaslarView({ baslangicKodu, onDegisti }: Props) {
  const { kullanici } = useAuth()
  if (!kullanici) return null
  return <ArkadaslarIcerik kullaniciId={kullanici.id} baslangicKodu={baslangicKodu} onDegisti={onDegisti} />
}

function ArkadaslarIcerik({
  kullaniciId,
  baslangicKodu,
  onDegisti,
}: {
  kullaniciId: string
  baslangicKodu?: string | null
  onDegisti?: () => void
}) {
  const [profil, setProfil] = useState<Profil | null>(null)
  const [arkadaslar, setArkadaslar] = useState<Arkadas[]>([])
  const [gelenDavetler, setGelenDavetler] = useState<PlanDaveti[]>([])
  const [gruplar, setGruplar] = useState<Grup[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [secili, setSecili] = useState<Profil | null>(null)
  const [seciliGrup, setSeciliGrup] = useState<Grup | null>(null)
  const [grupKurAcik, setGrupKurAcik] = useState(false)
  const [sihirbazAcik, setSihirbazAcik] = useState(false)

  const tazele = useCallback(async () => {
    setHata(null)
    try {
      const [p, a, d, g] = await Promise.all([
        profilimiGetir(),
        arkadaslariGetir(),
        davetleriGetir(),
        gruplarimiGetir(),
      ])
      setProfil(p)
      setArkadaslar(a)
      // A pending invite for a day that has passed can't be answered any more.
      setGelenDavetler(d.gelen.filter((x) => x.durum === 'bekliyor' && !planGectiMi(x.tarih)))
      setGruplar(g)
      onDegisti?.()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Veriler alınamadı')
    } finally {
      setYukleniyor(false)
    }
  }, [onDegisti])

  // Reload whenever social data changes (a sync, a message, a reply).
  const surum = useSosyalSurum()
  useEffect(() => {
    void tazele()
  }, [tazele, surum])

  // Same helper the chat card uses: accepting adds the plan to my calendar,
  // declining keeps it out.
  async function davetiYanitlaVeTazele(davet: PlanDaveti, kabul: boolean) {
    const gonderenAd = arkadaslar.find((a) => a.profil.id === davet.gonderen_id)?.profil.ad ?? null
    await davetiYanitla(davet, kabul, gonderenAd)
    await tazele()
  }

  const kabulEdilmis = arkadaslar.filter((a) => a.durum === 'kabul')
  const gelenIstekler = arkadaslar.filter((a) => a.durum === 'bekliyor' && a.yon === 'gelen')
  const gidenIstekler = arkadaslar.filter((a) => a.durum === 'bekliyor' && a.yon === 'giden')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-700">Arkadaşlar</h1>
          <p className="text-sm text-ink-400 mt-0.5">
            {kabulEdilmis.length > 0 ? `${kabulEdilmis.length} arkadaş` : 'Birlikte plan yap'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-6 lg:pb-10">
        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        {yukleniyor ? (
          <div className="space-y-3 pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-3xl" />
            ))}
          </div>
        ) : (
          // Desktop: who I am and adding people on the left, everything
          // that needs attention and my lists on the right.
          <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6 lg:space-y-0 lg:items-start">
            <div className="space-y-6 lg:sticky lg:top-6">
              {profil && <KimlikKarti profil={profil} onDegisti={tazele} />}

              {kabulEdilmis.length > 0 && (
                <button
                  onClick={() => setSihirbazAcik(true)}
                  className="w-full card p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-2xl bg-coral-100 flex items-center justify-center shrink-0">
                    <Icon name="Wand2" className="w-5 h-5 text-coral-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink-700">Herkese uyan saati bul</p>
                    <p className="text-xs text-ink-400">
                      Arkadaşlarını seç, gerisini yapay zekâ halletsin
                    </p>
                  </div>
                  <Icon name="ChevronRight" className="w-4 h-4 text-ink-300 shrink-0" />
                </button>
              )}

              <ArkadasEkle onEklendi={tazele} baslangicKodu={baslangicKodu} />
            </div>
            <div className="space-y-6">

              {gelenDavetler.length > 0 && (
                <Bolum baslik="Plan davetleri" ikon="CalendarClock" sayi={gelenDavetler.length}>
                  <div className="space-y-3">
                    {gelenDavetler.map((d) => (
                      <DavetKarti
                        key={d.id}
                        davet={d}
                        gonderenAd={
                          arkadaslar.find((a) => a.profil.id === d.gonderen_id)?.profil.ad ?? 'Bir arkadaşın'
                        }
                        onKabul={() => davetiYanitlaVeTazele(d, true)}
                        onRed={() => davetiYanitlaVeTazele(d, false)}
                      />
                    ))}
                  </div>
                </Bolum>
              )}

              {gelenIstekler.length > 0 && (
                <Bolum baslik="Arkadaşlık istekleri" ikon="UserPlus" sayi={gelenIstekler.length}>
                  <div className="space-y-3">
                    {gelenIstekler.map((a) => (
                      <IstekKarti key={a.arkadaslikId} arkadas={a} onYanit={tazele} />
                    ))}
                  </div>
                </Bolum>
              )}

              <Bolum baslik="Gruplar" ikon="Users" sayi={gruplar.length}>
                <div className="space-y-3">
                  {gruplar.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setSeciliGrup(g)}
                      className="card p-4 w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                    >
                      <GrupAvatari grup={g} boyut="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-700 truncate">{g.ad}</p>
                        {g.aciklama && <p className="text-xs text-ink-400 truncate">{g.aciklama}</p>}
                      </div>
                      <Icon name="ChevronRight" className="w-4 h-4 text-ink-300 shrink-0" />
                    </button>
                  ))}
                  <button
                    onClick={() => setGrupKurAcik(true)}
                    disabled={kabulEdilmis.length === 0}
                    className="w-full btn-ghost border border-ink-100/40 text-sm py-3 flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    <Icon name="Plus" className="w-4 h-4" />
                    {kabulEdilmis.length === 0 ? 'Grup için önce arkadaş ekle' : 'Grup kur'}
                  </button>
                </div>
              </Bolum>

              <Bolum baslik="Arkadaşların" ikon="Users" sayi={kabulEdilmis.length}>
                {kabulEdilmis.length === 0 ? (
                  <div className="card p-5 text-center">
                    <p className="text-sm text-ink-400">
                      Henüz arkadaşın yok. Yukarıdaki kodunu paylaş ya da bir arkadaşının kodunu gir.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {kabulEdilmis.map((a) => (
                      <ArkadasKarti
                        key={a.arkadaslikId}
                        arkadas={a}
                        onAc={() => setSecili(a.profil)}
                        onCikar={tazele}
                      />
                    ))}
                  </div>
                )}
              </Bolum>

              {gidenIstekler.length > 0 && (
                <Bolum baslik="Bekleyen isteklerin" ikon="Clock" sayi={gidenIstekler.length} soluk>
                  <div className="space-y-3">
                    {gidenIstekler.map((a) => (
                      <div key={a.arkadaslikId} className="card p-4 flex items-center gap-3">
                        <Avatar ad={a.profil.ad} foto={a.profil.avatar} emoji={a.profil.emoji} renk={a.profil.renk} boyut="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-600 truncate">{a.profil.ad}</p>
                          <p className="text-xs text-ink-300">Onay bekleniyor</p>
                        </div>
                        <button
                          onClick={async () => {
                            await arkadasliktanCik(a.arkadaslikId)
                            await tazele()
                          }}
                          className="text-xs font-medium text-ink-400 active:scale-95 transition-transform"
                        >
                          İptal
                        </button>
                      </div>
                    ))}
                  </div>
                </Bolum>
              )}
            </div>
          </div>
        )}
      </div>

      {secili && (
        <ArkadasMusaitlik arkadas={secili} benimId={kullaniciId} onClose={() => setSecili(null)} />
      )}

      {seciliGrup && (
        <GrupDetay
          grup={seciliGrup}
          benimId={kullaniciId}
          arkadaslar={arkadaslar}
          onClose={() => setSeciliGrup(null)}
          onAyrildi={async () => {
            setSeciliGrup(null)
            await tazele()
          }}
        />
      )}

      {grupKurAcik && (
        <GrupKurModal
          arkadaslar={kabulEdilmis}
          onClose={() => setGrupKurAcik(false)}
          onKuruldu={async () => {
            setGrupKurAcik(false)
            await tazele()
          }}
        />
      )}

      {sihirbazAcik && (
        <OrtakPlanSihirbazi
          benimAdim={profil?.ad ?? 'Ben'}
          arkadaslar={kabulEdilmis}
          onKapat={() => setSihirbazAcik(false)}
          onOlusturuldu={tazele}
        />
      )}
    </div>
  )
}

function GrupKurModal({
  arkadaslar,
  onClose,
  onKuruldu,
}: {
  arkadaslar: Arkadas[]
  onClose: () => void
  onKuruldu: () => Promise<void>
}) {
  useEscapeIleKapat(onClose)
  const [ad, setAd] = useState('')
  const [emoji, setEmoji] = useState<string | null>(null)
  const [renk, setRenk] = useState<string | null>(null)
  const [aciklama, setAciklama] = useState('')
  const [secilenler, setSecilenler] = useState<Set<string>>(new Set())
  const [kuruluyor, setKuruluyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  function degistir(id: string) {
    setSecilenler((eski) => {
      const yeni = new Set(eski)
      if (yeni.has(id)) yeni.delete(id)
      else yeni.add(id)
      return yeni
    })
  }

  async function kur() {
    if (!ad.trim()) {
      setHata('Gruba bir isim ver.')
      return
    }
    setKuruluyor(true)
    setHata(null)
    try {
      await grupOlustur(ad.trim(), Array.from(secilenler), { emoji, renk, aciklama })
      await onKuruldu()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Grup kurulamadı')
    } finally {
      setKuruluyor(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Grup kur"
        className="card w-full max-w-sm mx-4 mb-4 sm:mb-0 p-5 animate-slide-up max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-ink-700 mb-4">Grup kur</h3>

        <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
          Grup adı
        </label>
        <input
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          placeholder="Kadıköy Ekibi"
          className="input-field mb-4"
          autoFocus
        />

        <label htmlFor="grup-aciklama" className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
          Açıklama
        </label>
        <input
          id="grup-aciklama"
          value={aciklama}
          onChange={(e) => setAciklama(e.target.value)}
          maxLength={GRUP_ACIKLAMA_MAKS}
          placeholder="Cumartesi buluşmaları (isteğe bağlı)"
          className="input-field mb-4"
        />

        <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Simge</p>
        <div className="mb-4">
          <EmojiSecici secenekler={GRUP_EMOJILERI} secili={emoji} onSec={setEmoji} />
        </div>

        <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Renk</p>
        <div className="mb-4">
          <RenkSecici secili={renk} onSec={setRenk} />
        </div>

        <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
          Kimler olsun
        </label>
        <div className="space-y-2 mb-4">
          {arkadaslar.map((a) => {
            const secili = secilenler.has(a.profil.id)
            return (
              <button
                key={a.profil.id}
                onClick={() => degistir(a.profil.id)}
                className={`w-full flex items-center gap-3 rounded-2xl p-3 border transition-all active:scale-[0.98] ${
                  secili ? 'bg-coral-50 border-coral-200' : 'bg-cream-100 border-ink-100/40'
                }`}
              >
                <Avatar ad={a.profil.ad} foto={a.profil.avatar} emoji={a.profil.emoji} renk={a.profil.renk} boyut="sm" />
                <span className="flex-1 min-w-0 text-sm font-medium text-ink-700 truncate text-left">
                  {a.profil.ad}
                </span>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                    secili ? 'bg-coral-500' : 'bg-cream-50 border border-ink-200'
                  }`}
                >
                  {secili && <Icon name="Check" className="w-3.5 h-3.5 text-white" />}
                </div>
              </button>
            )
          })}
        </div>

        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mb-4">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={kuruluyor} className="btn-ghost flex-1 border border-ink-100/40">
            Vazgeç
          </button>
          <button onClick={() => void kur()} disabled={kuruluyor} className="btn-primary flex-1 disabled:opacity-50">
            {kuruluyor ? '...' : 'Kur'}
          </button>
        </div>
      </div>
    </div>
  )
}

function KimlikKarti({ profil, onDegisti }: { profil: Profil; onDegisti: () => Promise<void> }) {
  const [kopyalandi, setKopyalandi] = useState(false)
  const [duzenle, setDuzenle] = useState(false)
  const [profilDuzenle, setProfilDuzenle] = useState(false)
  const [kullaniciAdi, setKullaniciAdi] = useState(profil.kullanici_adi ?? '')
  const [hata, setHata] = useState<string | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const kodGosterim = `${profil.arkadas_kodu.slice(0, 4)}-${profil.arkadas_kodu.slice(4)}`
  const davetLinki = `${window.location.origin}/?ekle=${profil.arkadas_kodu}`

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(kodGosterim)
      setKopyalandi(true)
      setTimeout(() => setKopyalandi(false), 2000)
    } catch {
      setHata('Kopyalanamadı — kodu elle seçebilirsin.')
    }
  }

  async function paylas() {
    const metin = `CepDost'ta arkadaşım ol! Kodum: ${kodGosterim}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'CepDost', text: metin, url: davetLinki })
        return
      } catch {
        // Kullanıcı paylaşımı iptal etti — sessizce geç.
        return
      }
    }
    try {
      await navigator.clipboard.writeText(`${metin}\n${davetLinki}`)
      setKopyalandi(true)
      setTimeout(() => setKopyalandi(false), 2000)
    } catch {
      setHata('Paylaşılamadı.')
    }
  }

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
      <div className={`-mx-5 -mt-5 mb-4 px-5 pt-5 pb-4 rounded-t-3xl flex items-center gap-3 ${renkAl(profil.renk, profil.ad).zemin}`}>
        <AvatarSecici profil={profil} onDegisti={onDegisti} onHata={setHata} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink-700 truncate">{profil.ad}</p>
          {profil.biyografi && <p className="text-xs text-ink-400 line-clamp-2">{profil.biyografi}</p>}
          {duzenle ? null : (
            <button
              onClick={() => setDuzenle(true)}
              className="text-xs text-coral-600 font-medium active:scale-95 transition-transform"
            >
              {profil.kullanici_adi ? `@${profil.kullanici_adi}` : 'Kullanıcı adı belirle'}
            </button>
          )}
        </div>
        <button
          onClick={() => setProfilDuzenle(true)}
          aria-label="Profili düzenle"
          className="w-9 h-9 rounded-xl bg-cream-50 flex items-center justify-center active:scale-90 transition-transform shrink-0"
        >
          <Icon name="Pencil" className="w-4 h-4 text-ink-400" />
        </button>
      </div>

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

      {duzenle && (
        <div className="mb-4">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center bg-cream-100 border border-ink-100/40 rounded-xl px-3">
              <span className="text-ink-300 text-sm">@</span>
              <input
                value={kullaniciAdi}
                onChange={(e) => setKullaniciAdi(e.target.value)}
                placeholder="kullaniciadi"
                autoFocus
                className="flex-1 bg-transparent py-2.5 px-1 text-ink-700 font-medium placeholder:text-ink-300 focus:outline-none text-sm"
              />
            </div>
            <button
              onClick={() => void kullaniciAdiKaydet()}
              disabled={kaydediliyor}
              className="btn-primary text-sm px-4 py-2.5 disabled:opacity-50"
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
      )}

      <div className="bg-cream-100 rounded-2xl p-4 mb-3">
        <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Arkadaş kodun</p>
        <div className="flex items-center gap-2">
          <span className="font-display text-xl font-bold text-ink-700 tracking-wider flex-1">
            {kodGosterim}
          </span>
          <button
            onClick={() => void kopyala()}
            className="w-9 h-9 rounded-xl bg-cream-50 border border-ink-100/40 flex items-center justify-center active:scale-90 transition-transform"
            aria-label="Kodu kopyala"
          >
            <Icon
              name={kopyalandi ? 'Check' : 'Copy'}
              className={`w-4 h-4 ${kopyalandi ? 'text-teal-600' : 'text-ink-400'}`}
            />
          </button>
          <button
            onClick={() => void paylas()}
            className="w-9 h-9 rounded-xl bg-coral-500 flex items-center justify-center active:scale-90 transition-transform"
            aria-label="Paylaş"
          >
            <Icon name="Share2" className="w-4 h-4 text-white" />
          </button>
        </div>
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
              ? 'Profilini tüm CepDost kullanıcıları görebilir'
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
        <Avatar ad={profil.ad} foto={profil.avatar} emoji={profil.emoji} renk={profil.renk} />
        <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-coral-500 text-white flex items-center justify-center shadow-soft ring-2 ring-cream-50">
          <Icon name={calisiyor ? 'Loader2' : 'Camera'} className={`w-3.5 h-3.5 ${calisiyor ? 'animate-spin' : ''}`} />
        </span>
      </button>

      {profil.avatar && !calisiyor && (
        <button
          onClick={() => void kaldir()}
          aria-label="Profil fotoğrafını kaldır"
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-ink-500/80 text-white flex items-center justify-center"
        >
          <Icon name="X" className="w-3 h-3" />
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
          acik ? 'bg-teal-500' : 'bg-ink-200'
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

function ArkadasEkle({
  onEklendi,
  baslangicKodu,
}: {
  onEklendi: () => Promise<void>
  baslangicKodu?: string | null
}) {
  const [girdi, setGirdi] = useState(baslangicKodu ?? '')
  const [araniyor, setAraniyor] = useState(false)
  const [sonuc, setSonuc] = useState<AramaSonucu | null>(null)
  const [bulunamadi, setBulunamadi] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [ekleniyor, setEkleniyor] = useState(false)

  async function ara(e: React.FormEvent) {
    e.preventDefault()
    const q = girdi.trim()
    if (!q) return
    setAraniyor(true)
    setHata(null)
    setSonuc(null)
    setBulunamadi(false)
    try {
      const p = await profilAra(q)
      if (p) setSonuc(p)
      else setBulunamadi(true)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Arama başarısız')
    } finally {
      setAraniyor(false)
    }
  }

  async function ekle() {
    if (!sonuc) return
    setEkleniyor(true)
    setHata(null)
    try {
      await arkadaslikIsteGonder(sonuc.id, sonuc)
      setSonuc(null)
      setGirdi('')
      await onEklendi()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'İstek gönderilemedi')
    } finally {
      setEkleniyor(false)
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="UserPlus" className="w-4 h-4 text-coral-500" />
        <h2 className="text-sm font-semibold text-ink-600">Arkadaş ekle</h2>
      </div>

      <form onSubmit={ara} className="flex gap-2">
        <input
          value={girdi}
          onChange={(e) => setGirdi(e.target.value)}
          placeholder="Kod (A1B2-C3D4) veya @kullaniciadi"
          className="input-field flex-1"
        />
        <button
          type="submit"
          disabled={araniyor || !girdi.trim()}
          className="btn-primary px-4 py-2.5 text-sm disabled:opacity-50 shrink-0"
        >
          {araniyor ? <Icon name="Loader2" className="w-4 h-4 animate-spin" /> : 'Ara'}
        </button>
      </form>

      {bulunamadi && (
        <p className="text-sm text-ink-400 mt-3">
          Bu kod veya kullanıcı adıyla kimse bulunamadı. Yazımı kontrol eder misin?
        </p>
      )}

      {sonuc && (
        <div className="mt-3 flex items-center gap-3 bg-cream-100 rounded-2xl p-3">
          <Avatar ad={sonuc.ad} foto={sonuc.avatar} boyut="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-700 truncate">{sonuc.ad}</p>
            {sonuc.kullanici_adi && <p className="text-xs text-ink-400">@{sonuc.kullanici_adi}</p>}
          </div>
          <button
            onClick={() => void ekle()}
            disabled={ekleniyor}
            className="btn-primary text-sm px-3.5 py-2 disabled:opacity-50 shrink-0"
          >
            {ekleniyor ? '...' : 'İstek gönder'}
          </button>
        </div>
      )}

      {hata && <p className="text-xs text-rose-600 mt-3">{hata}</p>}
    </div>
  )
}

function IstekKarti({ arkadas, onYanit }: { arkadas: Arkadas; onYanit: () => Promise<void> }) {
  const [isleniyor, setIsleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  async function yanitla(kabul: boolean) {
    setIsleniyor(true)
    setHata(null)
    try {
      await arkadaslikYanitla(arkadas.arkadaslikId, kabul)
      await onYanit()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Yanıt gönderilemedi')
    } finally {
      setIsleniyor(false)
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-3">
        <Avatar ad={arkadas.profil.ad} foto={arkadas.profil.avatar} emoji={arkadas.profil.emoji} renk={arkadas.profil.renk} boyut="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-700 truncate">{arkadas.profil.ad}</p>
          <p className="text-xs text-ink-400">Seni arkadaş olarak eklemek istiyor</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => void yanitla(false)}
          disabled={isleniyor}
          className="btn-ghost flex-1 border border-ink-100/40 text-sm py-2.5 disabled:opacity-50"
        >
          Reddet
        </button>
        <button
          onClick={() => void yanitla(true)}
          disabled={isleniyor}
          className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50"
        >
          Kabul et
        </button>
      </div>
      {hata && <p className="text-xs text-rose-600 mt-2">{hata}</p>}
    </div>
  )
}

function ArkadasKarti({
  arkadas,
  onAc,
  onCikar,
}: {
  arkadas: Arkadas
  onAc: () => void
  onCikar: () => Promise<void>
}) {
  const [onay, setOnay] = useState(false)

  return (
    <div className="card p-4 flex items-center gap-3">
      <button onClick={onAc} className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-[0.98] transition-transform">
        <Avatar ad={arkadas.profil.ad} foto={arkadas.profil.avatar} emoji={arkadas.profil.emoji} renk={arkadas.profil.renk} boyut="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-700 truncate">{arkadas.profil.ad}</p>
          <p className="text-xs text-ink-400 truncate">
            {arkadas.profil.musaitlik_paylas ? 'Müsaitliğine bak' : 'Müsaitlik paylaşmıyor'}
          </p>
        </div>
        <Icon name="ChevronRight" className="w-4 h-4 text-ink-300 shrink-0" />
      </button>
      {onay ? (
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => setOnay(false)}
            className="text-xs font-medium text-ink-400 px-2 py-1"
          >
            Vazgeç
          </button>
          <button
            onClick={async () => {
              await arkadasliktanCik(arkadas.arkadaslikId)
              await onCikar()
            }}
            className="text-xs font-semibold text-rose-600 px-2 py-1"
          >
            Çıkar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOnay(true)}
          className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-transform shrink-0"
          aria-label="Arkadaşlıktan çıkar"
        >
          <Icon name="Trash2" className="w-4 h-4 text-ink-300" />
        </button>
      )}
    </div>
  )
}

function DavetKarti({
  davet,
  gonderenAd,
  onKabul,
  onRed,
}: {
  davet: PlanDaveti
  gonderenAd: string
  onKabul: () => Promise<void>
  onRed: () => Promise<void>
}) {
  const [isleniyor, setIsleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  async function yanitla(islem: () => Promise<void>) {
    setIsleniyor(true)
    setHata(null)
    try {
      await islem()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Yanıt gönderilemedi')
      setIsleniyor(false)
    }
  }
  const detay = [formatDate(davet.tarih), formatPlanTime(davet.saat, davet.tum_gun), davet.konum]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="card p-4 border-coral-100 bg-coral-50/40">
      <div className="flex items-center gap-2.5 mb-2">
        <Avatar ad={gonderenAd} boyut="sm" />
        <div className="min-w-0">
          <p className="text-xs text-ink-400">{gonderenAd} davet etti</p>
          <p className="text-sm font-semibold text-ink-700 truncate">
            {davet.emoji && <span aria-hidden="true">{davet.emoji} </span>}
            {davet.baslik}
          </p>
        </div>
      </div>
      <p className="text-xs text-ink-500 mb-1">{detay}</p>
      {davet.mesaj && <p className="text-xs text-ink-400 italic mb-3">“{davet.mesaj}”</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => void yanitla(onRed)}
          disabled={isleniyor}
          className="btn-ghost flex-1 border border-ink-100/40 text-sm py-2.5 disabled:opacity-50"
        >
          Uygun değilim
        </button>
        <button
          onClick={() => void yanitla(onKabul)}
          disabled={isleniyor}
          className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50"
        >
          Kabul et
        </button>
      </div>
      {hata && <p className="text-xs text-rose-500 mt-2">{hata}</p>}
    </div>
  )
}

function Bolum({
  baslik,
  ikon,
  sayi,
  soluk,
  children,
}: {
  baslik: string
  ikon: 'Users' | 'UserPlus' | 'CalendarClock' | 'Clock'
  sayi: number
  soluk?: boolean
  children: React.ReactNode
}) {
  const renk = soluk ? 'text-ink-300' : 'text-ink-400'
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 px-1">
        <Icon name={ikon} className={`w-4 h-4 ${renk}`} />
        <h2 className={`text-sm font-semibold ${soluk ? 'text-ink-300' : 'text-ink-500'}`}>{baslik}</h2>
        <span className={`text-xs ${renk}`}>{sayi}</span>
      </div>
      {children}
    </div>
  )
}
