import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { Avatar } from './Avatar'
import { AniArsivi } from './AniArsivi'
import {
  grubaUyeEkle,
  grupPlaniOlustur,
  grupPlanlariGetir,
  grupUyeleriGetir,
  gruptanAyril,
  grupOkunduIsaretle,
  mesajGonder,
  mesajlariGetir,
  planaYanitVer,
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
import {
  Baloncuk,
  GonderButonu,
  SohbetZemini,
  useSonaKaydir,
  useYeniMesajEsigi,
} from './SohbetGovde'
import { TemaSheet } from './SohbetTemaSecici'
import { useSohbetTemasi } from '../sohbetTema'
import { db, kayitOlustur, kayitSil } from '../db'
import { formatDate, formatMessageTime, formatTime, toDateString } from '../lib/format'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'

type Sekme = 'planlar' | 'sohbet' | 'anilar' | 'uyeler'

interface Props {
  grup: Grup
  benimId: string
  arkadaslar: Arkadas[]
  onClose: () => void
  onAyrildi: () => Promise<void>
  // Desktop: shown in the chat list's side pane instead of over the page.
  gomulu?: boolean
}

export function GrupDetay({ grup, benimId, arkadaslar, onClose, onAyrildi, gomulu = false }: Props) {
  useEscapeIleKapat(onClose, !gomulu)
  const [sekme, setSekme] = useState<Sekme>('planlar')
  const [uyeler, setUyeler] = useState<GrupUyesi[]>([])
  // Everything in the group (members, plans, answers, messages) is read
  // from the local copy and reloads when social data changes.
  const sosyalSurum = useSosyalSurum()

  const uyeleriTazele = useCallback(async () => {
    setUyeler(await grupUyeleriGetir(grup.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grup.id, sosyalSurum])

  useEffect(() => {
    void uyeleriTazele()
  }, [uyeleriTazele])

  const adHaritasi = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of uyeler) m.set(u.kullanici_id, u.profil?.ad ?? 'CepDost kullanıcısı')
    return m
  }, [uyeler])

  const sekmeler: { id: Sekme; etiket: string; ikon: IconName }[] = [
    { id: 'planlar', etiket: 'Planlar', ikon: 'CalendarClock' },
    { id: 'sohbet', etiket: 'Sohbet', ikon: 'MessageCircle' },
    { id: 'anilar', etiket: 'Anılar', ikon: 'ImageIcon' },
    { id: 'uyeler', etiket: 'Üyeler', ikon: 'Users' },
  ]

  return (
    <div className={gomulu ? 'flex flex-col h-full min-h-0' : 'panel-tam z-[55]'}>
      <div className="flex items-center gap-3 px-5 pt-[calc(1rem+var(--safe-top))] pb-3 shrink-0">
        <button
          onClick={onClose}
          aria-label="Geri"
          className="w-10 h-10 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform shrink-0"
        >
          <Icon name="ArrowLeft" className="w-5 h-5 text-ink-500" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold text-ink-700 truncate">{grup.ad}</h2>
          <p className="text-xs text-ink-400">{uyeler.length} üye</p>
        </div>
      </div>

      <div className="flex gap-1.5 px-5 pb-3 shrink-0 overflow-x-auto no-scrollbar">
        {sekmeler.map((s) => (
          <button
            key={s.id}
            onClick={() => setSekme(s.id)}
            className={`chip shrink-0 ${
              sekme === s.id ? 'bg-coral-500 text-white' : 'bg-cream-50 text-ink-400 border border-ink-100/40'
            }`}
          >
            <Icon name={s.ikon} className="w-4 h-4" />
            {s.etiket}
          </button>
        ))}
      </div>

      {sekme === 'planlar' && (
        <PlanlarSekmesi
          grup={grup}
          benimId={benimId}
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
        />
      )}
      {sekme === 'anilar' && (
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          <AniArsivi grupId={grup.id} benimId={benimId} baslik={grup.ad} />
        </div>
      )}
      {sekme === 'uyeler' && (
        <UyelerSekmesi
          grup={grup}
          benimId={benimId}
          uyeler={uyeler}
          arkadaslar={arkadaslar}
          onDegisti={uyeleriTazele}
          onAyrildi={onAyrildi}
        />
      )}
    </div>
  )
}

// ---------------- planlar ----------------

// Grup planına yanıt + kişisel takvimi yanıta göre eşitleme.
//
// Hem Planlar sekmesi hem sohbetteki plan kartı bunu çağırıyor; mantık iki
// yerde kopyalansaydı biri düzeltilip diğeri unutulurdu.
//
// Ölçüt "önceki yanıt ne idi" DEĞİL, "bu plana ait yerel kayıt var mı":
// önceki duruma bakan sürümde geliyorum → belki → geliyorum turu ikinci bir
// kayıt açıyordu (canlı testte yakalandı). Yanıt "geliyorum"dan çıkarsa kayıt
// siliniyor — gitmeyeceğin bir plan takvimini ve müsaitliğini kirletmemeli.
async function grupPlaniYanitla(
  plan: GrupPlani,
  durum: YanitDurumu,
  grup: Grup,
): Promise<void> {
  await planaYanitVer(plan.id, durum)

  const mevcut = (await db.kayitlar.toArray()).find((k) => k.grupPlanId === plan.id)

  if (durum === 'geliyorum') {
    if (mevcut) return
    await kayitOlustur({
      kategori: 'etkinlik',
      baslik: `${plan.baslik} (${grup.ad})`,
      tarih: plan.tarih,
      saat: plan.saat ? plan.saat.slice(0, 5) : null,
      konum: plan.konum,
      oncelik: 'orta',
      sure: plan.sure,
      ozetNot: plan.notlar,
      mekanOnerisi: null,
      yakinOneriler: null,
      kaynakTipi: 'metin',
      hamBaslik: '',
      hamMetin: '',
      hamLink: '',
      gorseller: [],
      grupId: grup.id,
      grupAdi: grup.ad,
      grupPlanId: plan.id,
    })
  } else if (mevcut) {
    await kayitSil(mevcut.id)
  }
}

function PlanlarSekmesi({
  grup,
  benimId,
  adHaritasi,
  benimAdim,
  digerUyeler,
}: {
  grup: Grup
  benimId: string
  adHaritasi: Map<string, string>
  benimAdim: string
  digerUyeler: Profil[]
}) {
  const [planlar, setPlanlar] = useState<GrupPlani[] | null>(null)
  const [yanitlar, setYanitlar] = useState<PlanYaniti[]>([])
  const [ekleAcik, setEkleAcik] = useState(false)
  const [sihirbazAcik, setSihirbazAcik] = useState(false)
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
    await grupPlaniYanitla(plan, durum, grup)
    await tazele()
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-3">
        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
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
          className="w-full btn-ghost border border-ink-100/40 flex items-center justify-center gap-2 text-sm py-3"
        >
          <Icon name="Plus" className="w-4 h-4" />
          Kendim plan oluştur
        </button>

        {planlar === null ? (
          <div className="space-y-3">
            <div className="skeleton h-28 rounded-3xl" />
            <div className="skeleton h-28 rounded-3xl" />
          </div>
        ) : planlar.length === 0 ? (
          <div className="card p-5 text-center">
            <p className="text-sm text-ink-400">Henüz grup planı yok. İlkini sen oluştur.</p>
          </div>
        ) : (
          planlar.map((p) => (
            <PlanKarti
              key={p.id}
              plan={p}
              benimId={benimId}
              yanitlar={yanitlar.filter((y) => y.plan_id === p.id)}
              adHaritasi={adHaritasi}
              onYanit={(d) => void yanitla(p, d)}
            />
          ))
        )}
      </div>

      {ekleAcik && (
        <PlanEkleModal
          grupId={grup.id}
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
    </>
  )
}

function PlanKarti({
  plan,
  benimId,
  yanitlar,
  adHaritasi,
  onYanit,
}: {
  plan: GrupPlani
  benimId: string
  yanitlar: PlanYaniti[]
  adHaritasi: Map<string, string>
  onYanit: (d: YanitDurumu) => void
}) {
  const benimYanit = yanitlar.find((y) => y.kullanici_id === benimId)?.durum ?? null
  const gelenler = yanitlar.filter((y) => y.durum === 'geliyorum')
  const detay = [formatDate(plan.tarih), plan.saat ? formatTime(plan.saat.slice(0, 5)) : null, plan.konum]
    .filter(Boolean)
    .join(' · ')

  const secenekler: { d: YanitDurumu; etiket: string; renk: string }[] = [
    { d: 'geliyorum', etiket: 'Geliyorum', renk: 'bg-teal-500 text-white' },
    { d: 'belki', etiket: 'Belki', renk: 'bg-amber-400 text-amber-900' },
    { d: 'gelmiyorum', etiket: 'Yokum', renk: 'bg-ink-200 text-ink-600' },
  ]

  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-ink-700">{plan.baslik}</p>
      <p className="text-xs text-ink-500 mt-0.5">{detay}</p>
      {plan.notlar && <p className="text-xs text-ink-400 mt-1">{plan.notlar}</p>}

      <p className="text-xs text-ink-400 mt-3 mb-2">
        {gelenler.length > 0
          ? `${gelenler.map((y) => adHaritasi.get(y.kullanici_id) ?? '?').join(', ')} geliyor`
          : 'Henüz kimse yanıtlamadı'}
      </p>

      <div className="flex gap-2">
        {secenekler.map((s) => (
          <button
            key={s.d}
            onClick={() => onYanit(s.d)}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold active:scale-95 transition-all ${
              benimYanit === s.d ? s.renk : 'bg-cream-100 text-ink-400 border border-ink-100/40'
            }`}
          >
            {s.etiket}
          </button>
        ))}
      </div>
    </div>
  )
}

function PlanEkleModal({
  grupId,
  onClose,
  onEklendi,
}: {
  grupId: string
  onClose: () => void
  onEklendi: () => Promise<void>
}) {
  const [baslik, setBaslik] = useState('')
  const [tarih, setTarih] = useState(toDateString(new Date()))
  const [saat, setSaat] = useState('')
  const [sure, setSure] = useState('')
  const [konum, setKonum] = useState('')
  const [notlar, setNotlar] = useState('')
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
        grupId,
        baslik: baslik.trim(),
        tarih,
        saat: saat || null,
        sure: sure ? Number(sure) : null,
        konum: konum.trim() || null,
        notlar: notlar.trim() || null,
      })
      // Hangi yoldan oluşturulursa oluşturulsun plan sohbete düşsün —
      // yoksa üyeler Planlar sekmesine bakmadan haberdar olmuyor.
      try {
        await mesajGonder(grupId, 'Yeni bir plan 👇', planId)
      } catch {
        /* plan oluştu; sohbet kartı isteğe bağlı bir ekstra */
      }
      await onEklendi()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Oluşturulamadı')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
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

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <FieldLabel>Tarih</FieldLabel>
            <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} className="input-field" />
          </div>
          <div>
            <FieldLabel>Saat</FieldLabel>
            <input type="time" value={saat} onChange={(e) => setSaat(e.target.value)} className="input-field" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
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
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mb-4">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={kaydediliyor} className="btn-ghost flex-1 border border-ink-100/40">
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
}: {
  grup: Grup
  benimId: string
  adHaritasi: Map<string, string>
  benimAdim: string
  digerUyeler: Profil[]
}) {
  const [mesajlar, setMesajlar] = useState<GrupMesaji[]>([])
  const [planlar, setPlanlar] = useState<Map<string, GrupPlani>>(new Map())
  const [planYanitlari, setPlanYanitlari] = useState<PlanYaniti[]>([])
  const [girdi, setGirdi] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [sihirbazAcik, setSihirbazAcik] = useState(false)
  const [temaAcik, setTemaAcik] = useState(false)
  const [yukleniyor, setYukleniyor] = useState(true)
  const tema = useSohbetTemasi()
  const sonRef = useSonaKaydir([mesajlar.length])
  const yeniMi = useYeniMesajEsigi(mesajlar, !yukleniyor)

  const sosyalSurum = useSosyalSurum()

  // Messages plus the plans and answers behind plan cards, so a card can be
  // answered right in the chat. Plans are always fetched for the whole list
  // so a reload never drops cards that were already showing.
  const tazele = useCallback(async () => {
    const liste = await mesajlariGetir(grup.id)
    const idler = liste.map((m) => m.plan_id).filter((x): x is string => !!x)
    const [haritalar, yanitlar] = idler.length
      ? await Promise.all([planlariIdyeGoreGetir(idler), planYanitlariGetir(idler)])
      : [new Map<string, GrupPlani>(), [] as PlanYaniti[]]
    setMesajlar(liste)
    setPlanlar(haritalar)
    setPlanYanitlari(yanitlar)
    if (liste.some((m) => m.gonderen_id !== benimId)) void grupOkunduIsaretle(grup.id).catch(() => {})
  }, [grup.id, benimId])

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

  async function gonder() {
    const metin = girdi.trim()
    if (!metin || gonderiliyor) return
    setGirdi('')
    setGonderiliyor(true)
    setHata(null)
    try {
      await mesajGonder(grup.id, metin)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Gönderilemedi')
      setGirdi(metin)
    } finally {
      setGonderiliyor(false)
    }
  }

  return (
    <>
      <SohbetZemini tema={tema} className="px-5 pb-4">
        <div className="space-y-2 pt-2">
          {mesajlar.length === 0 && (
            <div className="card p-5 text-center">
              <p className="text-sm text-ink-400 mb-3">Sohbet boş. İlk mesajı sen yaz.</p>
              <button
                onClick={() => setSihirbazAcik(true)}
                className="chip bg-coral-100 text-coral-700 mx-auto"
              >
                <Icon name="Wand2" className="w-4 h-4" />
                Yapay zekâdan plan iste
              </button>
            </div>
          )}

          {mesajlar.map((m) => {
            const plan = m.plan_id ? planlar.get(m.plan_id) : null
            return (
              <Baloncuk
                key={m.id}
                benim={m.gonderen_id === benimId}
                yeni={yeniMi(m.olusturulma)}
                gonderenAd={adHaritasi.get(m.gonderen_id) ?? 'CepDost kullanıcısı'}
                zaman={formatMessageTime(m.olusturulma) ?? undefined}
              >
                {m.metin}
                {plan && (
                  <SohbetPlanKarti
                    plan={plan}
                    yanitlar={planYanitlari.filter((y) => y.plan_id === plan.id)}
                    benimId={benimId}
                    adHaritasi={adHaritasi}
                    onYanit={(d) => void planaYanit(plan, d)}
                  />
                )}
              </Baloncuk>
            )
          })}

          {hata && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
              <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700">{hata}</p>
            </div>
          )}
          <div ref={sonRef} />
        </div>
      </SohbetZemini>

      <div className="px-5 pb-[calc(1rem+var(--safe-bottom))] pt-3 border-t border-ink-100/40 safe-x shrink-0 bg-cream-100">
        <div className="flex items-end gap-2">
          <button
            onClick={() => setTemaAcik(true)}
            aria-label="Sohbet temasını değiştir"
            className="w-11 h-11 rounded-full bg-ink-50 text-ink-400 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <Icon name="Palette" className="w-5 h-5" />
          </button>
          <button
            onClick={() => setSihirbazAcik(true)}
            aria-label="Yapay zekâdan plan iste"
            className="w-11 h-11 rounded-full bg-coral-100 text-coral-600 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <Icon name="Wand2" className="w-5 h-5" />
          </button>
          <textarea
            value={girdi}
            onChange={(e) => setGirdi(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void gonder()
              }
            }}
            placeholder="Mesaj yaz..."
            rows={1}
            className="flex-1 bg-cream-50 border border-ink-100/40 rounded-2xl px-4 py-3 text-ink-700 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral-200 transition-all resize-none max-h-32"
          />
          <GonderButonu
            onClick={() => void gonder()}
            gonderiliyor={gonderiliyor}
            pasif={!girdi.trim()}
          />
        </div>
      </div>

      {sihirbazAcik && (
        <OrtakPlanSihirbazi
          benimAdim={benimAdim}
          grup={grup}
          grupUyeleri={digerUyeler}
          // Sohbetten açıldığında plan otomatik olarak sohbete de düşsün —
          // "gruba paylaş" bu akışın doğal sonu.
          sohbetePaylas
          onKapat={() => setSihirbazAcik(false)}
          onOlusturuldu={tazele}
        />
      )}

      {temaAcik && <TemaSheet onKapat={() => setTemaAcik(false)} />}
    </>
  )
}

// Sohbetteki plan kartı. Baloncuğun içinde durduğu için kendi rengini
// baloncuktan bağımsız tutuyoruz — koyu temada da okunur kalsın.
// Yanıt doğrudan burada veriliyor: kullanıcıyı Planlar sekmesine göndermek
// gereksiz bir adımdı (birebir sohbetteki davet kartı da böyle çalışıyor).
function SohbetPlanKarti({
  plan,
  yanitlar,
  benimId,
  adHaritasi,
  onYanit,
}: {
  plan: GrupPlani
  yanitlar: PlanYaniti[]
  benimId: string
  adHaritasi: Map<string, string>
  onYanit: (d: YanitDurumu) => void
}) {
  const benimYanit = yanitlar.find((y) => y.kullanici_id === benimId)?.durum ?? null
  const gelenler = yanitlar.filter((y) => y.durum === 'geliyorum')

  const secenekler: { d: YanitDurumu; etiket: string; renk: string }[] = [
    { d: 'geliyorum', etiket: 'Geliyorum', renk: 'bg-teal-500 text-white' },
    { d: 'belki', etiket: 'Belki', renk: 'bg-amber-400 text-amber-900' },
    { d: 'gelmiyorum', etiket: 'Yokum', renk: 'bg-ink-200 text-ink-600' },
  ]

  return (
    <div className="mt-2 rounded-xl bg-cream-50 border border-ink-100/50 p-3 text-ink-700">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon name="CalendarClock" className="w-3.5 h-3.5 text-coral-500 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-coral-600">Plan</span>
      </div>
      <p className="text-sm font-semibold leading-snug">{plan.baslik}</p>
      <p className="text-xs text-ink-400 mt-0.5">
        {formatDate(plan.tarih) ?? plan.tarih}
        {plan.saat && ` · ${plan.saat.slice(0, 5)}`}
        {plan.sure ? ` · ${plan.sure} dk` : ''}
      </p>
      {plan.konum && (
        <p className="flex items-center gap-1 text-xs text-ink-500 mt-1">
          <Icon name="MapPin" className="w-3 h-3 text-coral-500 shrink-0" />
          {plan.konum}
        </p>
      )}

      <p className="text-[11px] text-ink-400 mt-2 mb-2">
        {gelenler.length > 0
          ? `${gelenler.map((y) => adHaritasi.get(y.kullanici_id) ?? '?').join(', ')} geliyor`
          : 'Henüz kimse yanıtlamadı'}
      </p>

      <div className="flex gap-1.5">
        {secenekler.map((s) => (
          <button
            key={s.d}
            onClick={() => onYanit(s.d)}
            className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold active:scale-95 transition-all ${
              benimYanit === s.d ? s.renk : 'bg-cream-100 text-ink-400 border border-ink-100/40'
            }`}
          >
            {s.etiket}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------- üyeler ----------------

function UyelerSekmesi({
  grup,
  benimId,
  uyeler,
  arkadaslar,
  onDegisti,
  onAyrildi,
}: {
  grup: Grup
  benimId: string
  uyeler: GrupUyesi[]
  arkadaslar: Arkadas[]
  onDegisti: () => Promise<void>
  onAyrildi: () => Promise<void>
}) {
  const [hata, setHata] = useState<string | null>(null)
  const [ayrilOnay, setAyrilOnay] = useState(false)

  const uyeIdler = new Set(uyeler.map((u) => u.kullanici_id))
  const eklenebilir = arkadaslar.filter((a) => a.durum === 'kabul' && !uyeIdler.has(a.profil.id))

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-5">
      {hata && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
          <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700">{hata}</p>
        </div>
      )}

      <div className="space-y-3">
        {uyeler.map((u) => (
          <div key={u.kullanici_id} className="card p-4 flex items-center gap-3">
            <Avatar ad={u.profil?.ad ?? '?'} foto={u.profil?.avatar} emoji={u.profil?.emoji} renk={u.profil?.renk} boyut="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-700 truncate">
                {u.profil?.ad ?? 'CepDost kullanıcısı'}
                {u.kullanici_id === benimId && <span className="text-ink-300 font-normal"> (sen)</span>}
              </p>
              <p className="text-xs text-ink-400">{u.rol === 'yonetici' ? 'Yönetici' : 'Üye'}</p>
            </div>
          </div>
        ))}
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
        className={`w-full rounded-2xl py-3 text-sm font-semibold transition-all active:scale-[0.97] ${
          ayrilOnay ? 'bg-rose-500 text-white' : 'bg-cream-50 text-rose-600 border border-rose-100'
        }`}
      >
        {ayrilOnay ? 'Emin misin? Dokun ve ayrıl' : 'Gruptan ayrıl'}
      </button>
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
