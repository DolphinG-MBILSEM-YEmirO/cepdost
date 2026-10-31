import { useCallback, useEffect, useMemo, useState } from 'react'
import { SegmentedControl } from '../ui/SegmentedControl'
import { BaslikBaglami } from '../ui/baslikBaglami'
import { Icon, type IconName } from './Icon'
import { Avatar, GrupAvatari } from './Avatar'
import { GrupDuzenle } from './GrupDuzenle'
import { EmojiSecici, TumGunAnahtari } from './Seciciler'
import { AniArsivi } from './AniArsivi'
import { SohbetIciArama } from './MesajArama'
import { useMesajaOdaklan } from './useMesajaOdaklan'
import {
  grubaUyeEkle,
  grupPlaniOlustur,
  grupPlanlariGetir,
  grupUyeleriGetir,
  gruplarimiGetir,
  gruptanAyril,
  grupOkunduIsaretle,
  mesajGonder,
  mesajlariGetir,
  planlariIdyeGoreGetir,
  planYanitlariGetir,
  type Grup,
  type GrupMesaji,
  type GrupPlani,
  type GrupUyesi,
  type PlanYaniti,
  type YanitDurumu,
} from '../sosyal/gruplar'
import type { Arkadas, Profil } from '../sosyal/api'
import { OrtakPlanSihirbazi } from './OrtakPlanSihirbazi'
import { SohbetZemini, useSonaKaydir, useYeniMesajEsigi } from './SohbetGovde'
import { MesajKatmanlari, MesajSatiri, MesajYazmaAlani, SohbetUstSeridi } from './MesajIslemleri'
import { useMesajIslemleri } from './useMesajIslemleri'
import { TemaSheet } from './SohbetTemaSecici'
import { GrupPlanKartiSohbet } from './SohbetPlanKarti'
import { GrupPlanDetayi } from './GrupPlanDetayi'
import { GrupOzetKarti } from './GrupOzeti'
import { GrupUyesiKarti } from './GrupUyesiKarti'
import { ArkadasProfili } from './ArkadasProfili'
import { DirektSohbet } from './DirektSohbet'
import { PlanPaylasSheet } from './PlanPaylas'
import { useSohbetTemasi } from '../sohbetTema'
import { grupPlaniYanitla, planGectiMi } from '../lib/planPaylasimi'
import { formatDate, formatPlanTime, toDateString } from '../lib/format'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { useGeriAdimi, useGeriIleKapat } from '../lib/geriTusu'
import type { MesajGonderimEki } from '../sosyal/mesajOrtak'
import type { SohbetHedefi } from '../sosyal/mesajIslemleri'
import { ETKINLIK_EMOJILERI } from '../lib/kisisellestirme'
import { UYGULAMA_ADI } from '../../shared/marka'

export type GrupSekmesi = 'sohbet' | 'planlar' | 'anilar' | 'uyeler'
type Sekme = GrupSekmesi

interface Props {
  grup: Grup
  benimId: string
  // My friends and pending requests, either way.
  arkadaslar: Arkadas[]
  onClose: () => void
  onAyrildi: () => Promise<void>
  // Desktop: shown in the chat list's side pane instead of over the page.
  gomulu?: boolean
  // Opened from a search: the chat, with this message in view.
  odakMesajId?: string | null
  // The section shown first. A group is a chat first, so it opens on the
  // chat unless the caller asks for another section.
  ilkSekme?: GrupSekmesi
}

export function GrupDetay({
  grup: acilanGrup,
  benimId,
  arkadaslar,
  onClose,
  onAyrildi,
  gomulu = false,
  odakMesajId,
  ilkSekme = 'sohbet',
}: Props) {
  useGeriIleKapat(onClose, !gomulu)
  // Desktop: the group sits in the side pane, so only back closes it.
  useGeriAdimi(onClose, gomulu)
  const [sekme, setSekme] = useState<Sekme>(odakMesajId ? 'sohbet' : ilkSekme)
  const [temaAcik, setTemaAcik] = useState(false)
  const [aramaAcik, setAramaAcik] = useState(false)
  // The chat loads its latest messages, or all of them once searched.
  const [tumMesajlar, setTumMesajlar] = useState(!!odakMesajId)
  const [duzenleAcik, setDuzenleAcik] = useState(false)
  const [uyeler, setUyeler] = useState<GrupUyesi[]>([])
  // A member's profile (a friend's full one, or the card they keep in the
  // group), and a chat opened from it.
  const [acikUye, setAcikUye] = useState<GrupUyesi | null>(null)
  const [mesajKisisi, setMesajKisisi] = useState<Profil | null>(null)
  // Everything in the group (members, plans, answers, messages) is read
  // from the local copy and reloads when social data changes.
  const sosyalSurum = useSosyalSurum()

  // The caller hands over the group as it was when opened; a new name,
  // emoji or colour (mine or another member's) arrives through sync.
  const [guncelGrup, setGuncelGrup] = useState<Grup | null>(null)
  useEffect(() => {
    let iptal = false
    void gruplarimiGetir().then((liste) => {
      const g = liste.find((x) => x.id === acilanGrup.id)
      if (!iptal && g) setGuncelGrup(g)
    })
    return () => {
      iptal = true
    }
  }, [acilanGrup.id, sosyalSurum])
  const grup = guncelGrup?.id === acilanGrup.id ? guncelGrup : acilanGrup
  // The group's colour stays on its avatar; the header itself is neutral.

  const uyeleriTazele = useCallback(async () => {
    setUyeler(await grupUyeleriGetir(grup.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grup.id, sosyalSurum])

  useEffect(() => {
    void uyeleriTazele()
  }, [uyeleriTazele])

  const adHaritasi = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of uyeler) m.set(u.kullanici_id, u.profil?.ad ?? `${UYGULAMA_ADI} kullanıcısı`)
    return m
  }, [uyeler])

  const sekmeler: { id: Sekme; etiket: string; ikon: IconName }[] = [
    { id: 'sohbet', etiket: 'Sohbet', ikon: 'MessageCircle' },
    { id: 'planlar', etiket: 'Planlar', ikon: 'CalendarClock' },
    { id: 'anilar', etiket: 'Anılar', ikon: 'ImageIcon' },
    { id: 'uyeler', etiket: 'Üyeler', ikon: 'Users' },
  ]

  return (
    <div className={gomulu ? 'flex flex-col h-full min-h-0' : 'panel-tam z-[55]'}>
      <div className={`flex items-center gap-3 px-4 pt-[calc(1rem+var(--safe-top))] pb-3 shrink-0 bg-bolum text-white`}>
        <button
          onClick={onClose}
          aria-label="Geri"
          className="w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-white/20 basinca shrink-0"
        >
          <Icon name="ArrowLeft" className="w-5 h-5 text-white" />
        </button>
        {/* Like a friend's chat, the name leads to who is in it. */}
        <button
          onClick={() => setSekme('uyeler')}
          aria-label={`${grup.ad} üyelerini göster`}
          className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-2xl -m-1 p-1 hover:bg-white/15 basinca"
        >
          <GrupAvatari grup={grup} boyut="sm" />
          <div className="min-w-0 flex-1">
            <h2 className="text-headline text-white font-bold truncate">{grup.ad}</h2>
            <p className="text-xs text-white/80 truncate">
              {grup.aciklama ? `${grup.aciklama} · ` : ''}
              {uyeler.length} üye
            </p>
          </div>
        </button>
        {sekme === 'sohbet' && (
          <button
            onClick={() => {
              setTumMesajlar(true)
              setAramaAcik(true)
            }}
            aria-label="Sohbette ara"
            className="w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-white/20 basinca shrink-0"
          >
            <Icon name="Search" className="w-5 h-5 text-white" />
          </button>
        )}
        {sekme === 'sohbet' && (
          <button
            onClick={() => setTemaAcik(true)}
            aria-label="Sohbet temasını değiştir"
            className="w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-white/20 basinca shrink-0"
          >
            <Icon name="Palette" className="w-5 h-5 text-white" />
          </button>
        )}
        <button
          onClick={() => setDuzenleAcik(true)}
          aria-label="Grubu düzenle"
          className="w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-white/20 basinca shrink-0"
        >
          <Icon name="Pencil" className="w-4 h-4 text-white" />
        </button>
      </div>

      {temaAcik && <TemaSheet onKapat={() => setTemaAcik(false)} />}
      {duzenleAcik && (
        <GrupDuzenle
          grup={grup}
          onKapat={() => setDuzenleAcik(false)}
          onKaydedildi={() => {
            setDuzenleAcik(false)
            void gruplarimiGetir().then((liste) => setGuncelGrup(liste.find((x) => x.id === grup.id) ?? null))
          }}
        />
      )}

      <div className="px-4 pb-4 mb-1 shrink-0 bg-bolum rounded-b-[2rem] shadow-soft">
        <BaslikBaglami.Provider value>
          <SegmentedControl
            etiket={`${grup.ad} bölümleri`}
            secili={sekme}
            onSec={setSekme}
            segmentler={sekmeler.map((s) => ({ id: s.id, etiket: s.etiket }))}
          />
        </BaslikBaglami.Provider>
      </div>

      {/* key: each section slides in when picked. */}
      <div key={sekme} className="flex-1 min-h-0 flex flex-col animate-gecis">
        {sekme === 'planlar' && (
          <PlanlarSekmesi
            grup={grup}
            benimId={benimId}
            uyeler={uyeler}
            onUyeler={() => setSekme('uyeler')}
            adHaritasi={adHaritasi}
            benimAdim={adHaritasi.get(benimId) ?? 'Ben'}
            // Every member publishes a card with their name to the group, so
            // a missing profile only means the card hasn't synced yet.
            digerUyeler={uyeler
              .filter((u) => u.kullanici_id !== benimId && u.profil)
              .map((u) => u.profil!)}
          />
        )}
        {sekme === 'sohbet' && (
          <SohbetSekmesi
            grup={grup}
            benimId={benimId}
            adHaritasi={adHaritasi}
            benimAdim={adHaritasi.get(benimId) ?? 'Ben'}
            digerUyeler={uyeler
              .filter((u) => u.kullanici_id !== benimId && u.profil)
              .map((u) => u.profil!)}
            tumu={tumMesajlar}
            aramaAcik={aramaAcik}
            onAramaKapat={() => setAramaAcik(false)}
            odakMesajId={odakMesajId}
          />
        )}
        {sekme === 'anilar' && (
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            <AniArsivi grupId={grup.id} benimId={benimId} baslik={grup.ad} />
          </div>
        )}
        {sekme === 'uyeler' && (
          <UyelerSekmesi
            grup={grup}
            benimId={benimId}
            uyeler={uyeler}
            arkadaslar={arkadaslar}
            onUyeAc={setAcikUye}
            onDegisti={uyeleriTazele}
            onAyrildi={onAyrildi}
          />
        )}
      </div>

      {acikUye && (
        <UyeProfili
          uye={acikUye}
          grupAdi={grup.ad}
          benimId={benimId}
          arkadaslar={arkadaslar}
          onKapat={() => setAcikUye(null)}
          onMesaj={setMesajKisisi}
        />
      )}
      {mesajKisisi && <DirektSohbet arkadas={mesajKisisi} benimId={benimId} onClose={() => setMesajKisisi(null)} />}
    </div>
  )
}

// A friend opens their full profile; anyone else, the card they keep in
// the group with a friend request.
function UyeProfili({
  uye,
  grupAdi,
  benimId,
  arkadaslar,
  onKapat,
  onMesaj,
}: {
  uye: GrupUyesi
  grupAdi: string
  benimId: string
  arkadaslar: Arkadas[]
  onKapat: () => void
  onMesaj: (kisi: Profil) => void
}) {
  const iliski = arkadaslar.find((a) => a.profil.id === uye.kullanici_id) ?? null
  // Which one is decided when it opens: accepting a request on the card
  // keeps the card, rather than swapping it for the profile.
  const [arkadasti] = useState(iliski?.durum === 'kabul')
  if (arkadasti && iliski) {
    return <ArkadasProfili arkadas={iliski.profil} benimId={benimId} onClose={onKapat} onMesaj={() => onMesaj(iliski.profil)} />
  }
  return <GrupUyesiKarti uye={uye} grupAdi={grupAdi} iliski={iliski} onKapat={onKapat} />
}

// ---------------- planlar ----------------

function PlanlarSekmesi({
  grup,
  benimId,
  uyeler,
  onUyeler,
  adHaritasi,
  benimAdim,
  digerUyeler,
}: {
  grup: Grup
  benimId: string
  uyeler: GrupUyesi[]
  onUyeler: () => void
  adHaritasi: Map<string, string>
  benimAdim: string
  digerUyeler: Profil[]
}) {
  const [planlar, setPlanlar] = useState<GrupPlani[] | null>(null)
  const [yanitlar, setYanitlar] = useState<PlanYaniti[]>([])
  const [ekleAcik, setEkleAcik] = useState(false)
  const [sihirbazAcik, setSihirbazAcik] = useState(false)
  const [acikPlan, setAcikPlan] = useState<GrupPlani | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const sosyalSurum = useSosyalSurum()

  const tazele = useCallback(async () => {
    setHata(null)
    try {
      const p = await grupPlanlariGetir(grup.id)
      setPlanlar(p)
      setYanitlar(await planYanitlariGetir(p.map((x) => x.id)))
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Planlar alınamadı')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grup.id, sosyalSurum])

  useEffect(() => {
    void tazele()
  }, [tazele])

  async function yanitla(plan: GrupPlani, durum: YanitDurumu) {
    try {
      await grupPlaniYanitla(plan, durum, grup)
      await tazele()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Yanıt gönderilemedi')
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3">
        {hata && (
          <div className="flex items-start gap-2 bg-white border border-rose-200 rounded-xl px-4 py-3">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        {planlar && (
          <GrupOzetKarti
            grup={grup}
            benimId={benimId}
            uyeler={uyeler}
            planlar={planlar}
            yanitlar={yanitlar}
            onPlanAc={setAcikPlan}
            onUyeler={onUyeler}
          />
        )}

        <button
          onClick={() => setSihirbazAcik(true)}
          className="w-full btn-primary flex items-center justify-center gap-2 text-sm py-3"
        >
          <Icon name="Wand2" className="w-4 h-4" />
          Herkese uyan saati bul
        </button>

        <button
          onClick={() => setEkleAcik(true)}
          className="w-full btn-ghost border border-ink-100 flex items-center justify-center gap-2 text-sm py-3"
        >
          <Icon name="Plus" className="w-4 h-4" />
          Kendim plan oluştur
        </button>

        {/* No list while there are no plans: the overview card above already
            says so. */}
        {planlar === null ? (
          <div className="space-y-3">
            <div className="skeleton h-28 rounded-3xl" />
            <div className="skeleton h-28 rounded-3xl" />
          </div>
        ) : planlar.length === 0 ? null : (
          // Upcoming plans first; past ones below, most recent first.
          [
            ...planlar.filter((p) => !planGectiMi(p.tarih)),
            ...planlar.filter((p) => planGectiMi(p.tarih)).reverse(),
          ].map((p, i, liste) => (
            <div key={p.id}>
              {planGectiMi(p.tarih) && (i === 0 || !planGectiMi(liste[i - 1].tarih)) && (
                <p className="text-label text-ink-500 mt-2 mb-3 px-1">Geçmiş planlar</p>
              )}
              <PlanKarti
                plan={p}
                benimId={benimId}
                yanitlar={yanitlar.filter((y) => y.plan_id === p.id)}
                adHaritasi={adHaritasi}
                uyeSayisi={digerUyeler.length + 1}
                onYanit={(d) => void yanitla(p, d)}
                onAc={() => setAcikPlan(p)}
              />
            </div>
          ))
        )}
      </div>

      {ekleAcik && (
        <PlanEkleModal
          grup={grup}
          onClose={() => setEkleAcik(false)}
          onEklendi={async () => {
            setEkleAcik(false)
            await tazele()
          }}
        />
      )}

      {sihirbazAcik && (
        <OrtakPlanSihirbazi
          benimAdim={benimAdim}
          grup={grup}
          grupUyeleri={digerUyeler}
          onKapat={() => setSihirbazAcik(false)}
          onOlusturuldu={tazele}
        />
      )}

      {acikPlan && <GrupPlanDetayi plan={acikPlan} grup={grup} benimId={benimId} onClose={() => setAcikPlan(null)} />}
    </>
  )
}

function PlanKarti({
  plan,
  benimId,
  yanitlar,
  adHaritasi,
  uyeSayisi,
  onYanit,
  onAc,
}: {
  plan: GrupPlani
  benimId: string
  yanitlar: PlanYaniti[]
  adHaritasi: Map<string, string>
  uyeSayisi: number
  onYanit: (d: YanitDurumu) => void
  onAc: () => void
}) {
  const benimYanit = yanitlar.find((y) => y.kullanici_id === benimId)?.durum ?? null
  const gelenler = yanitlar.filter((y) => y.durum === 'geliyorum')
  const belki = yanitlar.filter((y) => y.durum === 'belki').length
  const yanitsiz = Math.max(0, uyeSayisi - yanitlar.length)
  const detay = [formatDate(plan.tarih), formatPlanTime(plan.saat, plan.tum_gun), plan.konum]
    .filter(Boolean)
    .join(' · ')

  const secenekler: { d: YanitDurumu; etiket: string; renk: string }[] = [
    { d: 'geliyorum', etiket: 'Geliyorum', renk: 'bg-teal-500 text-white' },
    { d: 'belki', etiket: 'Belki', renk: 'bg-amber-400 text-amber-900' },
    { d: 'gelmiyorum', etiket: 'Gelemem', renk: 'bg-ink-200 text-ink-600' },
  ]

  return (
    <div className="card p-4">
      {/* The plan's own page: everyone's answer and who brings what. */}
      <button onClick={onAc} className="w-full flex items-start gap-2 text-left active:opacity-80 transition-transform">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-700">
            {plan.emoji && <span aria-hidden="true">{plan.emoji} </span>}
            {plan.baslik}
          </p>
          <p className="text-xs text-ink-500 mt-0.5">{detay}</p>
          {plan.notlar && <p className="text-xs text-ink-400 mt-1 line-clamp-2">{plan.notlar}</p>}
        </div>
        <span className="flex items-center gap-0.5 text-xs font-semibold text-brand-600 shrink-0 mt-0.5">
          Ayrıntılar
          <Icon name="ChevronRight" className="w-4 h-4" />
        </span>
      </button>

      <p className="text-xs text-ink-400 mt-3 mb-2">
        {gelenler.length > 0
          ? `Gelenler: ${gelenler.map((y) => (y.kullanici_id === benimId ? 'Sen' : (adHaritasi.get(y.kullanici_id) ?? '?'))).join(', ')}`
          : 'Henüz gelen yok'}
        {belki > 0 && ` · ${belki} belki`}
        {yanitsiz > 0 && !planGectiMi(plan.tarih) && ` · ${yanitsiz} yanıt bekleniyor`}
      </p>

      {planGectiMi(plan.tarih) ? (
        <p className="text-xs font-semibold text-ink-400">Bu plan geçti</p>
      ) : (
        <div className="flex gap-2">
          {secenekler.map((s) => (
            <button
              key={s.d}
              onClick={() => onYanit(s.d)}
              aria-pressed={benimYanit === s.d}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold active:opacity-80 transition-all ${
                benimYanit === s.d ? s.renk : 'bg-white text-ink-600 border border-ink-200'
              }`}
            >
              {s.etiket}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PlanEkleModal({
  grup,
  onClose,
  onEklendi,
}: {
  grup: Grup
  onClose: () => void
  onEklendi: () => Promise<void>
}) {
  useGeriIleKapat(onClose)
  const [baslik, setBaslik] = useState('')
  const [tarih, setTarih] = useState(toDateString(new Date()))
  const [saat, setSaat] = useState('')
  const [sure, setSure] = useState('')
  const [tumGun, setTumGun] = useState(false)
  const [konum, setKonum] = useState('')
  const [notlar, setNotlar] = useState('')
  const [emoji, setEmoji] = useState<string | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  async function kaydet() {
    if (!baslik.trim()) {
      setHata('Bir başlık yaz.')
      return
    }
    setKaydediliyor(true)
    setHata(null)
    try {
      const planId = await grupPlaniOlustur({
        grupId: grup.id,
        baslik: baslik.trim(),
        tarih,
        saat: tumGun ? null : saat || null,
        sure: tumGun ? null : sure ? Number(sure) : null,
        tumGun,
        konum: konum.trim() || null,
        notlar: notlar.trim() || null,
        emoji,
      })
      // Hangi yoldan oluşturulursa oluşturulsun plan sohbete düşsün —
      // yoksa üyeler Planlar sekmesine bakmadan haberdar olmuyor.
      try {
        await mesajGonder(grup.id, 'Yeni bir plan', planId)
      } catch {
        /* plan oluştu; sohbet kartı isteğe bağlı bir ekstra */
      }
      // Whoever sets up the plan is coming, and it goes in their calendar,
      // the same as a plan made from the "+" button.
      const plan = (await planlariIdyeGoreGetir([planId])).get(planId)
      if (plan) await grupPlaniYanitla(plan, 'geliyorum', grup)
      await onEklendi()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Oluşturulamadı')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center bg-ink-900/40 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Grup planı"
        className="card w-full max-w-sm mx-4 mb-4 sm:mb-0 p-5 animate-slide-up max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-ink-700 mb-4">Grup planı</h3>

        <FieldLabel>Ne yapacaksınız?</FieldLabel>
        <input
          value={baslik}
          onChange={(e) => setBaslik(e.target.value)}
          placeholder="Cumartesi brunch"
          className="input-field mb-4"
          autoFocus
        />

        <FieldLabel>Simge</FieldLabel>
        <div className="mb-4">
          <EmojiSecici secenekler={ETKINLIK_EMOJILERI} secili={emoji} onSec={setEmoji} />
        </div>

        <div className={`grid gap-3 mb-3 ${tumGun ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <div>
            <FieldLabel>Tarih</FieldLabel>
            <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} className="input-field" />
          </div>
          {!tumGun && (
            <div>
              <FieldLabel>Saat</FieldLabel>
              <input type="time" value={saat} onChange={(e) => setSaat(e.target.value)} className="input-field" />
            </div>
          )}
        </div>
        <div className="mb-4">
          <TumGunAnahtari acik={tumGun} onDegistir={setTumGun} />
        </div>

        <div className={`grid gap-3 mb-4 ${tumGun ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!tumGun && (
            <div>
              <FieldLabel>Süre (dk)</FieldLabel>
              <input
                type="number"
                value={sure}
                onChange={(e) => setSure(e.target.value)}
                placeholder="120"
                min="0"
                className="input-field"
              />
            </div>
          )}
          <div>
            <FieldLabel>Nerede</FieldLabel>
            <input value={konum} onChange={(e) => setKonum(e.target.value)} placeholder="Moda" className="input-field" />
          </div>
        </div>

        <FieldLabel>Not</FieldLabel>
        <textarea
          value={notlar}
          onChange={(e) => setNotlar(e.target.value)}
          rows={2}
          placeholder="Opsiyonel"
          className="input-field resize-none mb-4"
        />

        {hata && (
          <div className="flex items-start gap-2 bg-white border border-rose-200 rounded-xl px-4 py-3 mb-4">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={kaydediliyor} className="btn-ghost flex-1 border border-ink-100">
            Vazgeç
          </button>
          <button
            onClick={() => void kaydet()}
            disabled={kaydediliyor}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {kaydediliyor ? '...' : 'Oluştur'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------- sohbet ----------------

function SohbetSekmesi({
  grup,
  benimId,
  adHaritasi,
  benimAdim,
  digerUyeler,
  tumu,
  aramaAcik,
  onAramaKapat,
  odakMesajId,
}: {
  grup: Grup
  benimId: string
  adHaritasi: Map<string, string>
  benimAdim: string
  digerUyeler: Profil[]
  tumu: boolean
  aramaAcik: boolean
  onAramaKapat: () => void
  odakMesajId?: string | null
}) {
  const [mesajlar, setMesajlar] = useState<GrupMesaji[]>([])
  const [planlar, setPlanlar] = useState<Map<string, GrupPlani>>(new Map())
  const [planYanitlari, setPlanYanitlari] = useState<PlanYaniti[]>([])
  const [hata, setHata] = useState<string | null>(null)
  const [sihirbazAcik, setSihirbazAcik] = useState(false)
  const [paylasAcik, setPaylasAcik] = useState(false)
  const [acikPlan, setAcikPlan] = useState<GrupPlani | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const tema = useSohbetTemasi()
  const sonRef = useSonaKaydir([mesajlar.length])
  const yeniMi = useYeniMesajEsigi(mesajlar, !yukleniyor)

  const sosyalSurum = useSosyalSurum()
  const hedef = useMemo<SohbetHedefi>(() => ({ tur: 'grup', id: grup.id }), [grup.id])
  const adAl = useCallback(
    (id: string) => adHaritasi.get(id) ?? `${UYGULAMA_ADI} kullanıcısı`,
    [adHaritasi],
  )
  const gonder = useCallback(
    (metin: string, ek: MesajGonderimEki) => mesajGonder(grup.id, metin, null, ek),
    [grup.id],
  )
  // Reply, react, edit, delete... (see MesajIslemleri.tsx).
  const islemler = useMesajIslemleri({ hedef, benimId, mesajlar, adAl, gonder, onHata: setHata })
  useMesajaOdaklan(odakMesajId, !yukleniyor, islemler.mesajaGit)

  // Messages plus the plans and answers behind plan cards, so a card can be
  // answered right in the chat. Plans are always fetched for the whole list
  // so a reload never drops cards that were already showing.
  const tazele = useCallback(async () => {
    const liste = await mesajlariGetir(grup.id, tumu ? Infinity : undefined)
    const idler = liste.map((m) => m.plan_id).filter((x): x is string => !!x)
    const [haritalar, yanitlar] = idler.length
      ? await Promise.all([planlariIdyeGoreGetir(idler), planYanitlariGetir(idler)])
      : [new Map<string, GrupPlani>(), [] as PlanYaniti[]]
    setMesajlar(liste)
    setPlanlar(haritalar)
    setPlanYanitlari(yanitlar)
    if (liste.some((m) => m.gonderen_id !== benimId)) void grupOkunduIsaretle(grup.id).catch(() => {})
  }, [grup.id, benimId, tumu])

  async function planaYanit(plan: GrupPlani, durum: YanitDurumu) {
    await grupPlaniYanitla(plan, durum, grup)
    await tazele()
  }

  useEffect(() => {
    let iptal = false
    tazele()
      .catch((err) => {
        if (!iptal) setHata(err instanceof Error ? err.message : 'Mesajlar alınamadı')
      })
      .finally(() => {
        if (!iptal) setYukleniyor(false)
      })
    return () => {
      iptal = true
    }
  }, [tazele, sosyalSurum])

  return (
    <>
      {aramaAcik && <SohbetIciArama mesajlar={mesajlar} onGit={islemler.mesajaGit} onKapat={onAramaKapat} />}
      <SohbetUstSeridi islemler={islemler} />

      <SohbetZemini tema={tema} className="px-4 pb-4">
        <div className="space-y-2 pt-2">
          {mesajlar.length === 0 && (
            <div className="card p-5 text-center">
              <p className="text-sm text-ink-400 mb-3">Sohbet boş. İlk mesajı sen yaz.</p>
              <button
                onClick={() => setSihirbazAcik(true)}
                className="chip bg-brand-100 text-brand-700 mx-auto"
              >
                <Icon name="Wand2" className="w-4 h-4" />
                Yapay zekâdan plan iste
              </button>
            </div>
          )}

          {mesajlar.map((m) => {
            const plan = m.plan_id ? planlar.get(m.plan_id) : null
            return (
              <MesajSatiri
                key={m.id}
                mesaj={m}
                islemler={islemler}
                yeni={yeniMi(m.olusturulma)}
                gonderenAd={adAl(m.gonderen_id)}
                ek={
                  plan && (
                    <GrupPlanKartiSohbet
                      plan={plan}
                      yanitlar={planYanitlari.filter((y) => y.plan_id === plan.id)}
                      benimId={benimId}
                      adHaritasi={adHaritasi}
                      onYanit={(d) => planaYanit(plan, d)}
                      onAc={() => setAcikPlan(plan)}
                    />
                  )
                }
              />
            )
          })}

          {hata && (
            <div className="flex items-start gap-2 bg-white border border-rose-200 rounded-xl px-4 py-3">
              <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700">{hata}</p>
            </div>
          )}
          <div ref={sonRef} />
        </div>
      </SohbetZemini>

      <MesajYazmaAlani islemler={islemler} onPlanPaylas={() => setPaylasAcik(true)} />
      <MesajKatmanlari islemler={islemler} />

      {sihirbazAcik && (
        <OrtakPlanSihirbazi
          benimAdim={benimAdim}
          grup={grup}
          grupUyeleri={digerUyeler}
          onKapat={() => setSihirbazAcik(false)}
          onOlusturuldu={tazele}
        />
      )}

      {acikPlan && <GrupPlanDetayi plan={acikPlan} grup={grup} benimId={benimId} onClose={() => setAcikPlan(null)} />}

      {paylasAcik && (
        <PlanPaylasSheet
          hedef={{ tur: 'grup', grup }}
          onKapat={() => setPaylasAcik(false)}
          onUygunSaat={() => {
            setPaylasAcik(false)
            setSihirbazAcik(true)
          }}
        />
      )}
    </>
  )
}

// ---------------- üyeler ----------------

function UyelerSekmesi({
  grup,
  benimId,
  uyeler,
  arkadaslar,
  onUyeAc,
  onDegisti,
  onAyrildi,
}: {
  grup: Grup
  benimId: string
  uyeler: GrupUyesi[]
  arkadaslar: Arkadas[]
  onUyeAc: (uye: GrupUyesi) => void
  onDegisti: () => Promise<void>
  onAyrildi: () => Promise<void>
}) {
  const [hata, setHata] = useState<string | null>(null)
  const [ayrilOnay, setAyrilOnay] = useState(false)

  const uyeIdler = new Set(uyeler.map((u) => u.kullanici_id))
  const eklenebilir = arkadaslar.filter((a) => a.durum === 'kabul' && !uyeIdler.has(a.profil.id))

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-5">
      {hata && (
        <div className="flex items-start gap-2 bg-white border border-rose-200 rounded-xl px-4 py-3">
          <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700">{hata}</p>
        </div>
      )}

      <div className="space-y-3">
        {uyeler.map((u) => {
          const ben = u.kullanici_id === benimId
          const iliski = arkadaslar.find((a) => a.profil.id === u.kullanici_id)
          const rol = u.rol === 'yonetici' ? 'Yönetici' : 'Üye'
          const bag = iliski?.durum === 'kabul' ? 'Arkadaşın' : iliski?.yon === 'giden' ? 'İstek gönderildi' : null
          const icerik = (
            <>
              <Avatar ad={u.profil?.ad ?? '?'} foto={u.profil?.avatar} emoji={u.profil?.emoji} renk={u.profil?.renk} boyut="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-700 truncate">
                  {u.profil?.ad ?? `${UYGULAMA_ADI} kullanıcısı`}
                  {ben && <span className="text-ink-400 font-normal"> (sen)</span>}
                </p>
                <p className="text-xs text-ink-400">{bag ? `${rol} · ${bag}` : rol}</p>
              </div>
            </>
          )
          // My own row is just a row; anyone else's opens their profile.
          return ben ? (
            <div key={u.kullanici_id} className="card p-4 flex items-center gap-3">
              {icerik}
            </div>
          ) : (
            <button
              key={u.kullanici_id}
              onClick={() => onUyeAc(u)}
              className="w-full card p-4 flex items-center gap-3 text-left active:opacity-80 transition-transform lg:hover:border-brand-200"
            >
              {icerik}
              <Icon name="ChevronRight" className="w-4 h-4 text-ink-400 shrink-0" />
            </button>
          )
        })}
      </div>

      {eklenebilir.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-500 mb-3 px-1">Arkadaşlarından ekle</h3>
          <div className="space-y-3">
            {eklenebilir.map((a) => (
              <div key={a.profil.id} className="card p-4 flex items-center gap-3">
                <Avatar ad={a.profil.ad} foto={a.profil.avatar} emoji={a.profil.emoji} renk={a.profil.renk} boyut="sm" />
                <p className="flex-1 min-w-0 text-sm font-medium text-ink-700 truncate">{a.profil.ad}</p>
                <button
                  onClick={async () => {
                    setHata(null)
                    try {
                      await grubaUyeEkle(grup.id, a.profil.id)
                      await onDegisti()
                    } catch (err) {
                      setHata(err instanceof Error ? err.message : 'Eklenemedi')
                    }
                  }}
                  className="btn-primary text-sm px-3.5 py-2 shrink-0"
                >
                  Ekle
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={async () => {
          if (!ayrilOnay) {
            setAyrilOnay(true)
            setTimeout(() => setAyrilOnay(false), 4000)
            return
          }
          await gruptanAyril(grup.id, benimId)
          await onAyrildi()
        }}
        className={`w-full rounded-2xl py-3 text-sm font-semibold transition-all active:opacity-80 ${
          ayrilOnay ? 'bg-rose-500 text-white' : 'bg-mist-50 text-rose-600 border border-rose-100'
        }`}
      >
        {ayrilOnay ? 'Emin misin? Dokun ve ayrıl' : 'Gruptan ayrıl'}
      </button>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-label text-ink-500 mb-2">
      {children}
    </label>
  )
}
