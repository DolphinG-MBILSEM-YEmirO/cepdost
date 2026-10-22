import { useEffect, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { Avatar } from './Avatar'
import { kayitDegistir, kayitGuncelle, type Kategori, type Kayit } from '../db'
import { localDateString, formatDate } from '../lib/format'
import {
  MADDE_AZAMI,
  YAPILACAK_AZAMI,
  geriSayim,
  hatirlatmaEtiketi,
  hatirlatmaSecenekleri,
  hatirlatmaZamani,
  maddeEkle,
  maddeyiIsaretle,
  maddeyiSil,
  planBitisi,
  type GeriSayimDurumu,
  type YapilacakMaddesi,
} from '../lib/planAyrintilari'
import { planiGuncelle } from '../lib/planPaylasimi'
import { useGeriAdimi } from '../lib/geriTusu'
import { kayittanIcsIndir } from '../takvim'
import { bildirimIzniVar } from '../bildirim/planHatirlaticilari'
import { motorVarMi, useSosyalSurum } from '../sosyal/cekirdek'
import {
  planKatilimi,
  yanitsizlar,
  yanitsizlariDurt,
  type KatilimDurumu,
  type PlanKatilimi,
} from '../sosyal/planKatilimi'

// The cards on a plan's page that make it more than a title and a date:
// how long is left, a checklist, notes, a reminder, and who is coming.

// Re-renders on a timer so "in 5 minutes" doesn't go stale on screen.
function useSimdi(aralikMs: number): Date {
  const [simdi, setSimdi] = useState(() => new Date())
  useEffect(() => {
    const zamanlayici = setInterval(() => setSimdi(new Date()), aralikMs)
    return () => clearInterval(zamanlayici)
  }, [aralikMs])
  return simdi
}

function KartBasligi({ ikon, baslik, sag }: { ikon: IconName; baslik: string; sag?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <Icon name={ikon} className="w-4 h-4 text-orchid-500 shrink-0" />
        <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wide truncate">{baslik}</h3>
      </div>
      {sag}
    </div>
  )
}

// ---------- countdown ----------

const ROZET_RENKLERI: Record<GeriSayimDurumu, string> = {
  yakin: 'bg-gradient-orchid text-white',
  suruyor: 'bg-teal-100 text-teal-700',
  gelecek: 'bg-orchid-50 text-orchid-700',
  gecti: 'bg-mist-100 text-ink-400',
}

export function GeriSayimRozeti({ kayit }: { kayit: Kayit }) {
  const simdi = useSimdi(30_000)
  const sayim = geriSayim(kayit, simdi)
  if (!sayim) return null
  return (
    <span role="timer" className={`chip font-semibold ${ROZET_RENKLERI[sayim.durum]}`}>
      <Icon name={sayim.durum === 'suruyor' ? 'Sparkles' : 'Clock'} className="w-3.5 h-3.5" />
      {sayim.metin}
    </span>
  )
}

// ---------- checklist ----------

// A few starting points when the list is empty, by the kind of plan.
const ONERILER: Record<Kategori, string[]> = {
  mekan: ['Rezervasyon yap', 'Yol tarifine bak', 'Kimlerin geleceğini netleştir'],
  tarif: ['Malzemeleri al', 'Hazırlık süresine bak', 'Tarifi kaydet'],
  urun: ['Fiyatları karşılaştır', 'Yorumlara bak', 'İndirim kodu ara'],
  etkinlik: ['Bilet al', 'Ulaşımı ayarla', 'Bileti telefona kaydet'],
  not: ['Arkadaşlara haber ver', 'Ne giyeceğine karar ver'],
}

export function YapilacaklarKarti({ kayit }: { kayit: Kayit }) {
  const liste = kayit.yapilacaklar ?? []
  const [yeni, setYeni] = useState('')
  const biten = liste.filter((m) => m.tamam).length
  const dolu = liste.length >= YAPILACAK_AZAMI
  const oneriler = liste.length === 0 ? ONERILER[kayit.kategori ?? 'not'] : []

  // Only on this device and my other ones (plan sync), never shared.
  function degistir(islem: (l: YapilacakMaddesi[]) => YapilacakMaddesi[]) {
    void kayitDegistir(kayit.id, (k) => ({ yapilacaklar: islem(k.yapilacaklar ?? []) }))
  }

  function ekle(metin: string) {
    if (!metin.trim()) return
    degistir((l) => maddeEkle(l, metin))
    setYeni('')
  }

  return (
    <section className="card p-5 mb-4" aria-label="Yapılacaklar">
      <KartBasligi
        ikon="ListChecks"
        baslik="Yapılacaklar"
        sag={liste.length > 0 && <span className="text-xs font-semibold text-ink-400">{biten}/{liste.length}</span>}
      />

      {liste.length > 0 && (
        <>
          <div className="h-1.5 rounded-full bg-mist-100 overflow-hidden mb-3" aria-hidden="true">
            <div
              className="h-full rounded-full bg-gradient-orchid transition-all duration-300"
              style={{ width: `${Math.round((biten / liste.length) * 100)}%` }}
            />
          </div>
          <ul className="mb-2">
            {liste.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-1.5">
                <button
                  onClick={() => degistir((l) => maddeyiIsaretle(l, m.id))}
                  aria-label={m.tamam ? `${m.metin}: yapılmadı olarak işaretle` : `${m.metin}: yapıldı olarak işaretle`}
                  aria-pressed={m.tamam}
                  className={`shrink-0 transition-transform active:scale-90 ${m.tamam ? 'text-teal-500' : 'text-ink-200'}`}
                >
                  <Icon name={m.tamam ? 'CheckCircle2' : 'Circle'} className="w-5 h-5" />
                </button>
                <span className={`flex-1 min-w-0 text-sm break-words ${m.tamam ? 'line-through text-ink-300' : 'text-ink-600'}`}>
                  {m.metin}
                </span>
                <button
                  onClick={() => degistir((l) => maddeyiSil(l, m.id))}
                  aria-label={`${m.metin} maddesini sil`}
                  className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-ink-200 hover:text-rose-500 hover:bg-rose-50 active:scale-90 transition-all"
                >
                  <Icon name="X" className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {!dolu && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            ekle(yeni)
          }}
          className="flex gap-2"
        >
          <input
            value={yeni}
            onChange={(e) => setYeni(e.target.value)}
            maxLength={MADDE_AZAMI}
            placeholder={liste.length ? 'Bir madde daha...' : 'Ne yapman gerekiyor?'}
            aria-label="Yeni madde"
            className="input-field flex-1 py-2.5"
          />
          <button
            type="submit"
            disabled={!yeni.trim()}
            aria-label="Maddeyi ekle"
            className="w-11 shrink-0 rounded-2xl bg-gradient-orchid text-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
          >
            <Icon name="Plus" className="w-5 h-5" />
          </button>
        </form>
      )}

      {oneriler.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {oneriler.map((o) => (
            <button key={o} onClick={() => ekle(o)} className="chip bg-mist-50 text-ink-500 border border-ink-100 active:scale-95">
              <Icon name="Plus" className="w-3.5 h-3.5" />
              {o}
            </button>
          ))}
        </div>
      )}

      <p className="text-[11px] text-ink-300 mt-3">Yalnızca sen görürsün; tüm cihazlarında aynı kalır.</p>
    </section>
  )
}

// ---------- notes ----------

export function NotlarKarti({ kayit }: { kayit: Kayit }) {
  const [duzenleniyor, setDuzenleniyor] = useState(false)
  const [metin, setMetin] = useState(kayit.ozetNot ?? '')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  // Back leaves the note without saving, not the whole plan.
  useGeriAdimi(() => setDuzenleniyor(false), duzenleniyor)

  useEffect(() => {
    if (!duzenleniyor) setMetin(kayit.ozetNot ?? '')
  }, [kayit.ozetNot, duzenleniyor])

  async function kaydet() {
    setKaydediliyor(true)
    try {
      // Through the plan, so a shared link or invite shows the new note too.
      await planiGuncelle(kayit, { ozetNot: metin.trim() || null })
      setDuzenleniyor(false)
    } finally {
      setKaydediliyor(false)
    }
  }

  if (!duzenleniyor && !kayit.ozetNot) {
    return (
      <button
        onClick={() => setDuzenleniyor(true)}
        className="w-full mb-4 rounded-3xl border-2 border-dashed border-ink-100 px-5 py-4 flex items-center gap-2 text-sm font-medium text-ink-400 hover:bg-mist-50 active:scale-[0.98] transition-all"
      >
        <Icon name="Pencil" className="w-4 h-4" />
        Not ekle
      </button>
    )
  }

  return (
    <section className="card p-5 mb-4" aria-label="Notlar">
      <KartBasligi
        ikon="StickyNote"
        baslik="Notlar"
        sag={
          !duzenleniyor && (
            <button onClick={() => setDuzenleniyor(true)} className="text-xs font-semibold text-orchid-600 active:scale-95">
              Düzenle
            </button>
          )
        }
      />
      {duzenleniyor ? (
        <>
          <textarea
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setDuzenleniyor(false)
            }}
            autoFocus
            rows={4}
            placeholder="Ek not, adres tarifi, ne getireceğin..."
            aria-label="Not"
            className="input-field resize-none"
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setDuzenleniyor(false)}
              className="flex-1 rounded-2xl bg-mist-100 text-ink-500 font-medium py-2.5 active:scale-[0.97] transition-transform"
            >
              Vazgeç
            </button>
            <button
              onClick={() => void kaydet()}
              disabled={kaydediliyor}
              className="flex-1 rounded-2xl bg-gradient-orchid text-white font-medium py-2.5 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-50"
            >
              {kaydediliyor && <Icon name="Loader2" className="w-4 h-4 animate-spin" />}
              Kaydet
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-500 whitespace-pre-wrap leading-relaxed">{kayit.ozetNot}</p>
      )}
    </section>
  )
}

// ---------- reminder ----------

function saatMetni(d: Date): string {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

export function HatirlatmaKarti({ kayit }: { kayit: Kayit }) {
  const simdi = useSimdi(60_000)
  const bitis = planBitisi(kayit)
  const bitti = kayit.durum === 'yapildi' || (!!bitis && simdi >= bitis)
  const secili = kayit.hatirlatma ?? null
  const zaman = hatirlatmaZamani(kayit)
  const etiket = hatirlatmaEtiketi(kayit)

  function sec(dk: number | null) {
    void kayitGuncelle(kayit.id, { hatirlatma: dk })
  }

  let aciklama: string | null = null
  if (!bitti && zaman) {
    if (zaman <= simdi) {
      aciklama = 'Hatırlatma zamanı geçti.'
    } else {
      const ne = `Hatırlatma zamanı: ${formatDate(localDateString(zaman))} ${saatMetni(zaman)}.`
      aciklama = bildirimIzniVar()
        ? `${ne} Uygulama açıksa bildirim gelir; telefon kapalıyken de çalması için takvimine alarmıyla ekle.`
        : `${ne} Bildirimler kapalı olduğu için takvimine alarmıyla eklemen en sağlamı.`
    }
  }

  return (
    <section className="card p-5 mb-4" aria-label="Hatırlatma">
      <KartBasligi
        ikon="BellRing"
        baslik="Hatırlatma"
        sag={<span className={`text-xs font-semibold ${etiket ? 'text-orchid-600' : 'text-ink-300'}`}>{etiket ?? 'Kapalı'}</span>}
      />

      {!bitti && (
        <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Ne zaman hatırlatılsın">
          {[{ dk: null, etiket: 'Kapalı' }, ...hatirlatmaSecenekleri(kayit)].map((s) => {
            const aktif = secili === s.dk
            return (
              <button
                key={s.dk ?? 'kapali'}
                onClick={() => sec(s.dk)}
                aria-pressed={aktif}
                className={`chip active:scale-95 ${aktif ? 'bg-orchid-100 text-orchid-700 ring-2 ring-orchid-200' : 'bg-mist-50 text-ink-500 border border-ink-100'}`}
              >
                {s.etiket}
              </button>
            )
          })}
        </div>
      )}

      {aciklama && <p className="text-xs text-ink-400 leading-relaxed mb-3">{aciklama}</p>}

      {/* No browser API writes to the phone's calendar; the standard route
          is an .ics file opened by the calendar app. The reminder goes in it
          as an alarm, which rings even when Sharloop is closed. */}
      <button
        onClick={() => kayittanIcsIndir(kayit)}
        className="w-full bg-sky-50 text-sky-700 font-medium rounded-2xl px-5 py-3.5 flex items-center justify-center gap-2 active:scale-[0.97] transition-all hover:bg-sky-100"
      >
        <Icon name="CalendarPlus" className="w-5 h-5" />
        {secili != null && !bitti ? 'Takvimime alarmıyla ekle' : 'Telefon takvimime ekle'}
      </button>
    </section>
  )
}

// ---------- who is coming ----------

const DURUMLAR: Record<KatilimDurumu, { metin: string; sinif: string }> = {
  geliyor: { metin: 'Geliyor', sinif: 'bg-teal-50 text-teal-700' },
  belki: { metin: 'Belki', sinif: 'bg-amber-50 text-amber-700' },
  bekliyor: { metin: 'Yanıt yok', sinif: 'bg-mist-100 text-ink-400' },
  gelmiyor: { metin: 'Gelmiyor', sinif: 'bg-rose-50 text-rose-600' },
}

// One nudge per plan this often, so a tap doesn't become spam.
const DURTME_ARALIGI_MS = 6 * 60 * 60_000
const DURTMELER_ANAHTARI = 'cepdost_durtmeler'

function sonDurtmeler(): Record<string, number> {
  try {
    const ham = JSON.parse(localStorage.getItem(DURTMELER_ANAHTARI) ?? '{}') as unknown
    return ham && typeof ham === 'object' ? (ham as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function durtmeyiKaydet(anahtar: string): void {
  const simdi = Date.now()
  const liste = Object.fromEntries(Object.entries(sonDurtmeler()).filter(([, z]) => simdi - z < DURTME_ARALIGI_MS))
  liste[anahtar] = simdi
  try {
    localStorage.setItem(DURTMELER_ANAHTARI, JSON.stringify(liste))
  } catch {
    // Not remembered: the next tap can nudge again, nothing worse.
  }
}

function ozet(katilim: PlanKatilimi): string {
  const say = (d: KatilimDurumu) => katilim.katilimcilar.filter((k) => k.durum === d).length
  return [
    `${say('geliyor')} geliyor`,
    say('belki') && `${say('belki')} belki`,
    say('bekliyor') && `${say('bekliyor')} yanıt bekleniyor`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function KatilimcilarKarti({ kayit, onSohbeteGit }: { kayit: Kayit; onSohbeteGit?: (git: string) => void }) {
  const surum = useSosyalSurum()
  const [katilim, setKatilim] = useState<PlanKatilimi | null>(null)
  const [durtme, setDurtme] = useState<'gonderiliyor' | 'gonderildi' | 'ulasmadi' | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const durtmeAnahtari = kayit.grupPlanId ?? kayit.id
  const [yakinDaDurttum] = useState(() => Date.now() - (sonDurtmeler()[durtmeAnahtari] ?? 0) < DURTME_ARALIGI_MS)

  // Re-read when the plan's links or the social data change, not on every
  // write to the plan (a ticked checklist item).
  const { id, grupPlanId, davetId, tarih, baslik } = kayit
  const davetler = kayit.gidenDavetler?.join(',')
  useEffect(() => {
    if (!motorVarMi()) return
    let iptal = false
    planKatilimi(kayit)
      .then((k) => !iptal && setKatilim(k))
      .catch(() => !iptal && setKatilim(null))
    return () => {
      iptal = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, grupPlanId, davetId, tarih, baslik, davetler, surum])

  if (!katilim) return null

  const bekleyenler = yanitsizlar(katilim)
  const durtebilir = katilim.sahibiyim && !katilim.iptal && bekleyenler.length > 0 && kayit.durum === 'bekliyor'

  async function durt() {
    if (!katilim) return
    setDurtme('gonderiliyor')
    setHata(null)
    try {
      const ulasan = await yanitsizlariDurt(kayit, katilim)
      durtmeyiKaydet(durtmeAnahtari)
      setDurtme(ulasan > 0 ? 'gonderildi' : 'ulasmadi')
    } catch (err) {
      setDurtme(null)
      setHata(err instanceof Error ? err.message : 'Gönderilemedi')
    }
  }

  return (
    <section className="card p-5 mb-4" aria-label="Kimler geliyor">
      <KartBasligi
        ikon="Users"
        baslik="Kimler geliyor"
        sag={<span className="text-xs text-ink-400 text-right">{ozet(katilim)}</span>}
      />

      {katilim.iptal && (
        <p className="text-sm text-rose-600 bg-rose-50 rounded-2xl px-4 py-2.5 mb-3">Bu davet geri çekildi.</p>
      )}

      <ul className="space-y-2.5">
        {katilim.katilimcilar.map((k) => (
          <li key={k.id} className="flex items-center gap-3">
            <Avatar ad={k.ad} foto={k.profil?.avatar} emoji={k.profil?.emoji} renk={k.profil?.renk} boyut="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-700 truncate">
                {k.ad}
                {k.ben && <span className="text-ink-300 font-normal"> (sen)</span>}
              </p>
              {k.sahip && <p className="text-[11px] text-ink-400 leading-tight">Düzenleyen</p>}
            </div>
            <span className={`chip text-xs shrink-0 ${DURUMLAR[k.durum].sinif}`}>{DURUMLAR[k.durum].metin}</span>
          </li>
        ))}
      </ul>

      {(durtebilir || (katilim.sohbet && onSohbeteGit)) && (
        <div className="flex gap-2 mt-4">
          {durtebilir && (
            <button
              onClick={() => void durt()}
              disabled={durtme !== null || yakinDaDurttum}
              className="flex-1 rounded-2xl bg-orchid-50 text-orchid-700 font-medium px-4 py-3 flex items-center justify-center gap-2 active:scale-[0.97] transition-all hover:bg-orchid-100 disabled:opacity-50"
            >
              <Icon name={durtme === 'gonderiliyor' ? 'Loader2' : 'BellRing'} className={`w-4 h-4 ${durtme === 'gonderiliyor' ? 'animate-spin' : ''}`} />
              {yakinDaDurttum || durtme === 'gonderildi' || durtme === 'ulasmadi' ? 'Dürtüldü' : `Dürt (${bekleyenler.length})`}
            </button>
          )}
          {katilim.sohbet && onSohbeteGit && (
            <button
              onClick={() => onSohbeteGit(katilim.sohbet!)}
              className="flex-1 rounded-2xl bg-mist-100 text-ink-600 font-medium px-4 py-3 flex items-center justify-center gap-2 active:scale-[0.97] transition-all hover:bg-mist-200"
            >
              <Icon name="MessageCircle" className="w-4 h-4" />
              Sohbete git
            </button>
          )}
        </div>
      )}

      {durtme === 'gonderildi' && bekleyenler.length > 0 && <p className="text-xs text-teal-600 mt-2 px-1">Yanıt vermeyenlere hatırlatma gitti.</p>}
      {durtme === 'ulasmadi' && bekleyenler.length > 0 && (
        <p className="text-xs text-ink-400 mt-2 px-1">Bildirimleri kapalı görünüyor; sohbetten yazmak daha iyi olabilir.</p>
      )}
      {hata && <p className="text-xs text-rose-600 mt-2 px-1">{hata}</p>}
    </section>
  )
}
