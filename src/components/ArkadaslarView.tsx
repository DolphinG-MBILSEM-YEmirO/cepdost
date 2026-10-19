import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { Avatar, GrupAvatari } from './Avatar'
import { ArkadasMusaitlik } from './ArkadasMusaitlik'
import { useAuth } from '../sosyal/auth'
import { useSosyalSurum } from '../sosyal/cekirdek'
import {
  arkadaslariGetir,
  arkadaslikIsteGonder,
  arkadaslikYanitla,
  arkadasliktanCik,
  davetleriGetir,
  profilAra,
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
import { GRUP_ACIKLAMA_MAKS, GRUP_EMOJILERI } from '../lib/kisisellestirme'
import { EmojiSecici, RenkSecici } from './Seciciler'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'
import { UYGULAMA_ADI } from '../../shared/marka'

// Everything about friends, in the Sohbet tab: what needs an answer
// (requests, plan invites), adding people (search plus my own code), and
// my friends and groups. The profile itself is HesabimView.
interface Props {
  // Set when the app was opened from an invite link (?ekle=CODE): the
  // search box starts filled in.
  baslangicKodu?: string | null
  onDegisti?: () => void
  // The Sohbetler/Arkadaşlar switch, shown as the page header.
  ust: ReactNode
}

// The sign-in gate in App guarantees an account here.
export function ArkadaslarView({ baslangicKodu, onDegisti, ust }: Props) {
  const { kullanici } = useAuth()
  if (!kullanici) return null
  return <ArkadaslarIcerik kullaniciId={kullanici.id} baslangicKodu={baslangicKodu} onDegisti={onDegisti} ust={ust} />
}

function ArkadaslarIcerik({
  kullaniciId,
  baslangicKodu,
  onDegisti,
  ust,
}: Props & { kullaniciId: string }) {
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
  const yanitBekleyen = gelenDavetler.length > 0 || gelenIstekler.length > 0

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3 lg:pt-8">{ust}</div>

      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-6 lg:pb-10 lg:max-w-6xl">
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
          // Phone: what needs an answer first, then adding people, then
          // the lists. Desktop: adding people stays on the left; answers
          // and lists stack on the right (the grid places them in order).
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
            {yanitBekleyen && (
              <div className="space-y-6 lg:col-start-2">
                {gelenIstekler.length > 0 && (
                  <Bolum baslik="Arkadaşlık istekleri" ikon="UserPlus" sayi={gelenIstekler.length}>
                    <div className="space-y-3">
                      {gelenIstekler.map((a) => (
                        <IstekKarti key={a.arkadaslikId} arkadas={a} onYanit={tazele} />
                      ))}
                    </div>
                  </Bolum>
                )}

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
              </div>
            )}

            <div className="space-y-6 lg:col-start-1 lg:row-start-1 lg:row-span-2">
              <ArkadasEkle onEklendi={tazele} baslangicKodu={baslangicKodu} arkadasKodu={profil?.arkadas_kodu} />

              {kabulEdilmis.length > 0 && (
                <button
                  onClick={() => setSihirbazAcik(true)}
                  className="w-full card p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-2xl bg-orchid-100 flex items-center justify-center shrink-0">
                    <Icon name="Wand2" className="w-5 h-5 text-orchid-500" />
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
            </div>

            <div className="space-y-6 lg:col-start-2">
              <Bolum baslik="Arkadaşların" ikon="Users" sayi={kabulEdilmis.length}>
                {kabulEdilmis.length === 0 ? (
                  <div className="card p-5 text-center">
                    <p className="text-sm text-ink-400">
                      Henüz arkadaşın yok. Kodunu paylaş ya da bir arkadaşının kodunu gir.
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
                    className="w-full btn-ghost border border-ink-100 text-sm py-3 flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    <Icon name="Plus" className="w-4 h-4" />
                    {kabulEdilmis.length === 0 ? 'Grup için önce arkadaş ekle' : 'Grup kur'}
                  </button>
                </div>
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
                  secili ? 'bg-orchid-50 border-orchid-200' : 'bg-mist-100 border-ink-100'
                }`}
              >
                <Avatar ad={a.profil.ad} foto={a.profil.avatar} emoji={a.profil.emoji} renk={a.profil.renk} boyut="sm" />
                <span className="flex-1 min-w-0 text-sm font-medium text-ink-700 truncate text-left">
                  {a.profil.ad}
                </span>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                    secili ? 'bg-orchid-500' : 'bg-mist-50 border border-ink-200'
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
          <button onClick={onClose} disabled={kuruluyor} className="btn-ghost flex-1 border border-ink-100">
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

// My own friend code under the search box: the other half of adding
// someone. Sharing sends a link that opens the app with the code filled in.
function KodPaylas({ kod }: { kod: string }) {
  const [kopyalandi, setKopyalandi] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  const kodGosterim = `${kod.slice(0, 4)}-${kod.slice(4)}`
  const davetLinki = `${window.location.origin}/?ekle=${kod}`

  function kopyalandiGoster() {
    setKopyalandi(true)
    setTimeout(() => setKopyalandi(false), 2000)
  }

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(kodGosterim)
      kopyalandiGoster()
    } catch {
      setHata('Kopyalanamadı — kodu elle seçebilirsin.')
    }
  }

  async function paylas() {
    const metin = `${UYGULAMA_ADI} uygulamasında arkadaşım ol! Kodum: ${kodGosterim}`
    if (navigator.share) {
      try {
        await navigator.share({ title: UYGULAMA_ADI, text: metin, url: davetLinki })
      } catch {
        // Kullanıcı paylaşımı iptal etti — sessizce geç.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(`${metin}\n${davetLinki}`)
      kopyalandiGoster()
    } catch {
      setHata('Paylaşılamadı.')
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-ink-100">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-ink-400">Senin kodun</p>
          <p className="font-display text-lg font-bold text-ink-700 tracking-wider select-all">{kodGosterim}</p>
        </div>
        <button
          onClick={() => void kopyala()}
          className="w-9 h-9 rounded-xl bg-mist-100 border border-ink-100 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          aria-label="Kodu kopyala"
        >
          <Icon
            name={kopyalandi ? 'Check' : 'Copy'}
            className={`w-4 h-4 ${kopyalandi ? 'text-teal-600' : 'text-ink-400'}`}
          />
        </button>
        <button
          onClick={() => void paylas()}
          className="btn-primary text-sm px-3.5 py-2 flex items-center gap-1.5 shrink-0"
        >
          <Icon name="Share2" className="w-4 h-4" />
          Paylaş
        </button>
      </div>
      {hata && <p className="text-xs text-rose-600 mt-2">{hata}</p>}
    </div>
  )
}

function ArkadasEkle({
  onEklendi,
  baslangicKodu,
  arkadasKodu,
}: {
  onEklendi: () => Promise<void>
  baslangicKodu?: string | null
  arkadasKodu?: string
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
        <Icon name="UserPlus" className="w-4 h-4 text-orchid-500" />
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
        <div className="mt-3 flex items-center gap-3 bg-mist-100 rounded-2xl p-3">
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

      {arkadasKodu && <KodPaylas kod={arkadasKodu} />}
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
          className="btn-ghost flex-1 border border-ink-100 text-sm py-2.5 disabled:opacity-50"
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
    <div className="card p-4 border-orchid-100 bg-orchid-50/40">
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
          className="btn-ghost flex-1 border border-ink-100 text-sm py-2.5 disabled:opacity-50"
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
