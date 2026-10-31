import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { Avatar, GrupAvatari } from './Avatar'
import { ArkadasProfili } from './ArkadasProfili'
import { DirektSohbet } from './DirektSohbet'
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
import { KisilerleSihirbaz, OrtakPlanSihirbazi } from './OrtakPlanSihirbazi'
import { useArkadasOzetleri } from './useArkadasOzetleri'
import { grupOlustur, gruplarimiGetir, type Grup, type GrupPlani } from '../sosyal/gruplar'
import { davetiYanitla, planGectiMi } from '../lib/planPaylasimi'
import { formatDate, formatPlanTime } from '../lib/format'
import { GRUP_ACIKLAMA_MAKS, GRUP_EMOJILERI } from '../lib/kisisellestirme'
import { EmojiSecici, RenkSecici } from './Seciciler'
import { useGeriIleKapat } from '../lib/geriTusu'
import { gorusulmeyenler, neKadarOnce, uzunAraVar, type OrtakGecmis } from '../lib/planIstatistikleri'
import { goreceGun } from '../lib/takvimIzgarasi'
import { useBugun } from '../hooks/useBugun'
import { UYGULAMA_ADI } from '../../shared/marka'

// Everything about friends, in the Sohbet tab: what needs an answer
// (requests, plan invites), adding people (search plus my own username),
// and my friends and groups. Each friend shows our next plan or when we
// last met, each group its next plan, and friends not seen for a month or
// more come first with a way to plan something. The profile itself is
// HesabimView.
interface Props {
  // Set when the app was opened from an invite link (?ekle=CODE): that
  // person is looked up straight away.
  baslangicKodu?: string | null
  // Called once the invite link has been used, so it doesn't run again.
  onBaslangicKullanildi?: () => void
  onDegisti?: () => void
  // The Sohbetler/Arkadaşlar switch, shown as the page header.
  ust: ReactNode
}

// The sign-in gate in App guarantees an account here.
export function ArkadaslarView(props: Props) {
  const { kullanici } = useAuth()
  if (!kullanici) return null
  return <ArkadaslarIcerik kullaniciId={kullanici.id} {...props} />
}

function ArkadaslarIcerik({
  kullaniciId,
  baslangicKodu,
  onBaslangicKullanildi,
  onDegisti,
  ust,
}: Props & { kullaniciId: string }) {
  const [profil, setProfil] = useState<Profil | null>(null)
  const [arkadaslar, setArkadaslar] = useState<Arkadas[]>([])
  const [gelenDavetler, setGelenDavetler] = useState<PlanDaveti[]>([])
  const [gruplar, setGruplar] = useState<Grup[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [secili, setSecili] = useState<Arkadas | null>(null)
  const [mesajArkadasi, setMesajArkadasi] = useState<Profil | null>(null)
  const [seciliGrup, setSeciliGrup] = useState<Grup | null>(null)
  const [grupKurAcik, setGrupKurAcik] = useState(false)
  const [sihirbazAcik, setSihirbazAcik] = useState(false)
  // A friend from the "long time no see" card, planning with them.
  const [planlanacak, setPlanlanacak] = useState<Profil | null>(null)
  const bugun = useBugun()

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
  const ozetler = useArkadasOzetleri(
    kabulEdilmis.map((a) => a.profil.id),
    gruplar.map((g) => g.id),
  )
  const uzunAradakiler = ozetler
    ? gorusulmeyenler(ozetler.gecmisler).flatMap((id) => kabulEdilmis.find((a) => a.profil.id === id) ?? [])
    : []

  return (
    <div className="flex flex-col h-full">
      <div className="lg:px-4">{ust}</div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-6 lg:pb-10 lg:max-w-6xl">
        {hata && (
          <div className="flex items-start gap-2 bg-white border border-rose-200 rounded-xl px-4 py-3">
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
              <ArkadasEkle
                onEklendi={tazele}
                baslangicKodu={baslangicKodu}
                onBaslangicKullanildi={onBaslangicKullanildi}
                profil={profil}
                benimId={kullaniciId}
                arkadaslar={arkadaslar}
              />

              {kabulEdilmis.length > 0 && (
                <button
                  onClick={() => setSihirbazAcik(true)}
                  className="w-full card p-4 flex items-center gap-3 text-left active:opacity-80 transition-transform"
                >
                  <div className="w-10 h-10 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center shrink-0">
                    <Icon name="Wand2" className="w-5 h-5 text-bolum-koyu" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink-700">Herkese uyan saati bul</p>
                    <p className="text-xs text-ink-400">
                      Arkadaşlarını seç, gerisini yapay zekâ halletsin
                    </p>
                  </div>
                  <Icon name="ChevronRight" className="w-4 h-4 text-ink-400 shrink-0" />
                </button>
              )}
            </div>

            <div className="space-y-6 lg:col-start-2">
              {ozetler && uzunAradakiler.length > 0 && (
                <UzunAraKarti
                  arkadaslar={uzunAradakiler}
                  gecmisler={ozetler.gecmisler}
                  onAc={setSecili}
                  onPlanla={setPlanlanacak}
                />
              )}

              <Bolum baslik="Arkadaşların" ikon="Users" sayi={kabulEdilmis.length}>
                {kabulEdilmis.length === 0 ? (
                  <div className="card p-5 text-center">
                    <p className="text-sm text-ink-400">
                      Henüz arkadaşın yok. Kullanıcı adını paylaş ya da arkadaşını kullanıcı adıyla ara.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {kabulEdilmis.map((a) => (
                      <ArkadasKarti
                        key={a.arkadaslikId}
                        arkadas={a}
                        gecmis={ozetler?.gecmisler.get(a.profil.id)}
                        bugun={bugun}
                        onAc={() => setSecili(a)}
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
                      className="card p-4 w-full flex items-center gap-3 text-left active:opacity-80 transition-transform"
                    >
                      <GrupAvatari grup={g} boyut="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-700 truncate">{g.ad}</p>
                        <GrupAltSatiri grup={g} siradaki={ozetler?.siradakiler.get(g.id)} bugun={bugun} />
                      </div>
                      <Icon name="ChevronRight" className="w-4 h-4 text-ink-400 shrink-0" />
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
                          <p className="text-xs text-ink-400">Onay bekleniyor</p>
                        </div>
                        <button
                          onClick={async () => {
                            await arkadasliktanCik(a.arkadaslikId)
                            await tazele()
                          }}
                          className="text-xs font-medium text-ink-400 active:opacity-80 transition-transform"
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
        <ArkadasProfili
          arkadas={secili.profil}
          benimId={kullaniciId}
          onClose={() => setSecili(null)}
          onMesaj={() => setMesajArkadasi(secili.profil)}
          onGrupAc={(g) => {
            setSecili(null)
            setSeciliGrup(g)
          }}
          arkadaslikId={secili.arkadaslikId}
          onCikarildi={async () => {
            setSecili(null)
            await tazele()
          }}
        />
      )}

      {mesajArkadasi && (
        <DirektSohbet arkadas={mesajArkadasi} benimId={kullaniciId} onClose={() => setMesajArkadasi(null)} />
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

      {planlanacak && (
        <KisilerleSihirbaz kisiler={[planlanacak]} onKapat={() => setPlanlanacak(null)} onOlusturuldu={tazele} />
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
  useGeriIleKapat(onClose)
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
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink-900/40 animate-fade-in"
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

        <label className="block text-label text-ink-500 mb-2">
          Grup adı
        </label>
        <input
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          placeholder="Kadıköy Ekibi"
          className="input-field mb-4"
          autoFocus
        />

        <label htmlFor="grup-aciklama" className="block text-label text-ink-500 mb-2">
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

        <p className="text-label text-ink-500 mb-2">Simge</p>
        <div className="mb-4">
          <EmojiSecici secenekler={GRUP_EMOJILERI} secili={emoji} onSec={setEmoji} />
        </div>

        <p className="text-label text-ink-500 mb-2">Renk</p>
        <div className="mb-4">
          <RenkSecici secili={renk} onSec={setRenk} />
        </div>

        <label className="block text-label text-ink-500 mb-2">
          Kimler olsun
        </label>
        <div className="space-y-2 mb-4">
          {arkadaslar.map((a) => {
            const secili = secilenler.has(a.profil.id)
            return (
              <button
                key={a.profil.id}
                onClick={() => degistir(a.profil.id)}
                className={`w-full flex items-center gap-3 rounded-2xl p-3 border transition-all active:opacity-80 ${
                  secili ? 'bg-brand-50 border-brand-200' : 'bg-mist-100 border-ink-100'
                }`}
              >
                <Avatar ad={a.profil.ad} foto={a.profil.avatar} emoji={a.profil.emoji} renk={a.profil.renk} boyut="sm" />
                <span className="flex-1 min-w-0 text-sm font-medium text-ink-700 truncate text-left">
                  {a.profil.ad}
                </span>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                    secili ? 'bg-brand-600' : 'bg-white border border-ink-300'
                  }`}
                >
                  {secili && <Icon name="Check" className="w-3.5 h-3.5 text-white" />}
                </div>
              </button>
            )
          })}
        </div>

        {hata && (
          <div className="flex items-start gap-2 bg-white border border-rose-200 rounded-xl px-4 py-3 mb-4">
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

// How others find me, under the search box: my @username, to copy or
// share. The shared link carries my friend code (stable even if the
// username changes) and opens the app with me found.
function BeniPaylas({ kod, kullaniciAdi }: { kod: string; kullaniciAdi: string | null }) {
  const [kopyalandi, setKopyalandi] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  const davetLinki = `${window.location.origin}/?ekle=${kod}`

  function kopyalandiGoster() {
    setKopyalandi(true)
    setTimeout(() => setKopyalandi(false), 2000)
  }

  async function kopyala() {
    if (!kullaniciAdi) return
    try {
      await navigator.clipboard.writeText(`@${kullaniciAdi}`)
      kopyalandiGoster()
    } catch {
      setHata('Kopyalanamadı — kullanıcı adını elle seçebilirsin.')
    }
  }

  async function paylas() {
    const metin = kullaniciAdi
      ? `${UYGULAMA_ADI} uygulamasında arkadaşım ol! Kullanıcı adım: @${kullaniciAdi}`
      : `${UYGULAMA_ADI} uygulamasında arkadaşım ol!`
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
          {kullaniciAdi ? (
            <>
              <p className="text-xs text-ink-400">Senin kullanıcı adın</p>
              <p className="text-title text-ink-800 truncate select-all">@{kullaniciAdi}</p>
            </>
          ) : (
            <p className="text-xs text-ink-400">
              Profil'den bir kullanıcı adı belirlersen arkadaşların seni onunla bulur.
            </p>
          )}
        </div>
        {kullaniciAdi && (
          <button
            onClick={() => void kopyala()}
            className="w-9 h-9 rounded-xl bg-mist-100 border border-ink-100 flex items-center justify-center active:opacity-80 transition-transform shrink-0"
            aria-label="Kullanıcı adını kopyala"
          >
            <Icon
              name={kopyalandi ? 'Check' : 'Copy'}
              className={`w-4 h-4 ${kopyalandi ? 'text-teal-600' : 'text-ink-400'}`}
            />
          </button>
        )}
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

// What the search result's button says, given where we already stand.
type Iliski = 'yok' | 'ben' | 'arkadas' | 'gonderildi' | 'geldi'

function iliskiBul(id: string, benimId: string, arkadaslar: Arkadas[]): Iliski {
  if (id === benimId) return 'ben'
  const a = arkadaslar.find((x) => x.profil.id === id)
  if (!a) return 'yok'
  if (a.durum === 'kabul') return 'arkadas'
  if (a.durum === 'bekliyor') return a.yon === 'giden' ? 'gonderildi' : 'geldi'
  return 'yok'
}

const ILISKI_ETIKETI: Partial<Record<Iliski, string>> = {
  ben: 'Bu sensin',
  arkadas: 'Arkadaşsınız',
  gonderildi: 'İstek gönderildi',
}

function ArkadasEkle({
  onEklendi,
  baslangicKodu,
  onBaslangicKullanildi,
  profil,
  benimId,
  arkadaslar,
}: {
  onEklendi: () => Promise<void>
  baslangicKodu?: string | null
  onBaslangicKullanildi?: () => void
  profil: Profil | null
  benimId: string
  arkadaslar: Arkadas[]
}) {
  const [girdi, setGirdi] = useState('')
  const [araniyor, setAraniyor] = useState(false)
  const [sonuc, setSonuc] = useState<AramaSonucu | null>(null)
  const [bulunamadi, setBulunamadi] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [ekleniyor, setEkleniyor] = useState(false)

  // Codes from older shares still work; the box just doesn't ask for one.
  const bul = useCallback(async (q: string) => {
    setAraniyor(true)
    setHata(null)
    setSonuc(null)
    setBulunamadi(false)
    try {
      const p = await profilAra(q)
      if (p) {
        setSonuc(p)
        if (p.kullanici_adi) setGirdi(`@${p.kullanici_adi}`)
      } else setBulunamadi(true)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Arama başarısız')
    } finally {
      setAraniyor(false)
    }
  }, [])

  // Opened from an invite link: look the person up straight away, once.
  useEffect(() => {
    if (!baslangicKodu) return
    setGirdi(baslangicKodu)
    void bul(baslangicKodu)
    onBaslangicKullanildi?.()
  }, [baslangicKodu, bul, onBaslangicKullanildi])

  function ara(e: React.FormEvent) {
    e.preventDefault()
    const q = girdi.trim()
    if (q) void bul(q)
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

  const iliski = sonuc ? iliskiBul(sonuc.id, benimId, arkadaslar) : 'yok'
  const etiket = ILISKI_ETIKETI[iliski]

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="UserPlus" className="w-4 h-4 text-ink-500" />
        <h2 className="text-sm font-semibold text-ink-600">Arkadaş ekle</h2>
      </div>

      <form onSubmit={ara} className="flex gap-2">
        <input
          value={girdi}
          onChange={(e) => setGirdi(e.target.value)}
          placeholder="@kullaniciadi"
          aria-label="Kullanıcı adıyla ara"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
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
          Bu kullanıcı adıyla kimse bulunamadı. Yazımı kontrol eder misin?
        </p>
      )}

      {sonuc && (
        <div className="mt-3 flex items-center gap-3 bg-mist-100 rounded-2xl p-3">
          <Avatar ad={sonuc.ad} foto={sonuc.avatar} boyut="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-700 truncate">{sonuc.ad}</p>
            {sonuc.kullanici_adi && <p className="text-xs text-ink-400">@{sonuc.kullanici_adi}</p>}
          </div>
          {etiket ? (
            <span className="text-xs font-medium text-ink-400 shrink-0">{etiket}</span>
          ) : (
            <button
              onClick={() => void ekle()}
              disabled={ekleniyor}
              className="btn-primary text-sm px-3.5 py-2 disabled:opacity-50 shrink-0"
            >
              {ekleniyor ? '...' : iliski === 'geldi' ? 'Kabul et' : 'İstek gönder'}
            </button>
          )}
        </div>
      )}

      {hata && <p className="text-xs text-rose-600 mt-3">{hata}</p>}

      {profil && <BeniPaylas kod={profil.arkadas_kodu} kullaniciAdi={profil.kullanici_adi} />}
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
  gecmis,
  bugun,
  onAc,
  onCikar,
}: {
  arkadas: Arkadas
  gecmis?: OrtakGecmis
  bugun: string
  onAc: () => void
  onCikar: () => Promise<void>
}) {
  const [onay, setOnay] = useState(false)
  const siradaki = gecmis?.siradaki
  const son = gecmis?.sonBulusma

  return (
    <div className="card p-4 flex items-center gap-3">
      <button onClick={onAc} className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-80 transition-transform">
        <Avatar ad={arkadas.profil.ad} foto={arkadas.profil.avatar} emoji={arkadas.profil.emoji} renk={arkadas.profil.renk} boyut="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-700 truncate">{arkadas.profil.ad}</p>
          <p className="text-xs text-ink-400 truncate">
            {arkadas.profil.kullanici_adi ? `@${arkadas.profil.kullanici_adi}` : 'Profilini gör'}
          </p>
          {siradaki ? (
            <p className="flex items-center gap-1 text-xs text-brand-600 mt-0.5 min-w-0">
              <Icon name="CalendarClock" className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {goreceGun(siradaki.tarih, bugun)}
                {siradaki.saat ? ` ${formatPlanTime(siradaki.saat, false)}` : ''} · {siradaki.baslik}
              </span>
            </p>
          ) : son ? (
            <p className={`text-xs mt-0.5 truncate ${uzunAraVar(gecmis!) ? 'text-amber-700' : 'text-ink-400'}`}>
              Son buluşma: {neKadarOnce(son.gunOnce).toLocaleLowerCase('tr-TR')}
            </p>
          ) : null}
        </div>
        <Icon name="ChevronRight" className="w-4 h-4 text-ink-400 shrink-0" />
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
          className="w-8 h-8 rounded-lg flex items-center justify-center active:opacity-80 transition-transform shrink-0"
          aria-label="Arkadaşlıktan çıkar"
        >
          <Icon name="Trash2" className="w-4 h-4 text-ink-400" />
        </button>
      )}
    </div>
  )
}

// Friends not seen for a month or more with nothing planned, with a way to
// find a time together.
function UzunAraKarti({
  arkadaslar,
  gecmisler,
  onAc,
  onPlanla,
}: {
  arkadaslar: Arkadas[]
  gecmisler: Map<string, OrtakGecmis>
  onAc: (arkadas: Arkadas) => void
  onPlanla: (profil: Profil) => void
}) {
  return (
    <section className="card p-4" aria-label="Uzun zamandır görüşmediklerin">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="CalendarHeart" className="w-4 h-4 text-amber-600" />
        <h2 className="text-sm font-semibold text-ink-600">Uzun zamandır görüşmediklerin</h2>
      </div>
      <div className="space-y-3">
        {arkadaslar.map((a) => {
          const son = gecmisler.get(a.profil.id)?.sonBulusma
          return (
            <div key={a.arkadaslikId} className="flex items-center gap-3">
              <button onClick={() => onAc(a)} className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-80 transition-transform">
                <Avatar ad={a.profil.ad} foto={a.profil.avatar} emoji={a.profil.emoji} renk={a.profil.renk} boyut="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-700 truncate">{a.profil.ad}</p>
                  {son && (
                    <p className="text-xs text-amber-700 truncate">
                      {neKadarOnce(son.gunOnce)} · {son.baslik}
                    </p>
                  )}
                </div>
              </button>
              <button
                onClick={() => onPlanla(a.profil)}
                aria-label={`${a.profil.ad} ile plan yap`}
                className="chip bg-brand-50 text-brand-600 border border-brand-100 text-xs shrink-0 active:opacity-80"
              >
                <Icon name="CalendarPlus" className="w-3.5 h-3.5" />
                Plan yap
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// Under a group's name: its next plan, else its description.
function GrupAltSatiri({ grup, siradaki, bugun }: { grup: Grup; siradaki?: GrupPlani; bugun: string }) {
  if (siradaki) {
    const saat = formatPlanTime(siradaki.saat, siradaki.tum_gun)
    return (
      <p className="flex items-center gap-1 text-xs text-brand-600 min-w-0">
        <Icon name="CalendarClock" className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">
          {goreceGun(siradaki.tarih, bugun)}
          {saat ? ` ${saat}` : ''} · {siradaki.baslik}
        </span>
      </p>
    )
  }
  return grup.aciklama ? <p className="text-xs text-ink-400 truncate">{grup.aciklama}</p> : null
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
    <div className="card p-4 border-brand-100 bg-brand-50/40">
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
  const renk = soluk ? 'text-ink-400' : 'text-ink-400'
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 px-1">
        <Icon name={ikon} className={`w-4 h-4 ${renk}`} />
        <h2 className={`text-sm font-semibold ${soluk ? 'text-ink-400' : 'text-ink-500'}`}>{baslik}</h2>
        <span className={`text-xs ${renk}`}>{sayi}</span>
      </div>
      {children}
    </div>
  )
}
