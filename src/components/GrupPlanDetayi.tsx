import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { GrupAvatari } from './Avatar'
import { GeriSayimRozeti, KatilimListesi } from './PlanAyrintilari'
import { GetirListesiKarti } from './GetirListesi'
import { PlanAnilariKarti } from './PlanAnilari'
import { formatDate, formatDuration, formatPlanTime } from '../lib/format'
import { grupPlaniKaydi, grupPlaniYanitla, planGectiMi } from '../lib/planPaylasimi'
import { useGeriIleKapat } from '../lib/geriTusu'
import { kayitGuncelle } from '../db'
import { planiTakvimeIndir } from '../takvim'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { planYanitlariGetir, type Grup, type GrupPlani, type YanitDurumu } from '../sosyal/gruplar'
import { grupPlaniKatilimi, type PlanKatilimi } from '../sosyal/planKatilimi'

// A group plan's own page, opened from the group's plans or a plan card in
// its chat: my answer, who is coming (the owner can nudge), and the shared
// "who brings what" list. Once it's over, the photos from that day.

const SECENEKLER: { d: YanitDurumu; etiket: string; renk: string }[] = [
  { d: 'geliyorum', etiket: 'Geliyorum', renk: 'bg-teal-500 text-white' },
  { d: 'belki', etiket: 'Belki', renk: 'bg-amber-400 text-amber-900' },
  { d: 'gelmiyorum', etiket: 'Yokum', renk: 'bg-ink-200 text-ink-600' },
]

interface Props {
  plan: GrupPlani
  grup: Grup
  benimId: string
  onClose: () => void
}

export function GrupPlanDetayi({ plan, grup, benimId, onClose }: Props) {
  useGeriIleKapat(onClose)
  const surum = useSosyalSurum()
  const [benimYanit, setBenimYanit] = useState<YanitDurumu | null>(null)
  const [katilim, setKatilim] = useState<PlanKatilimi | null>(null)
  const [isleniyor, setIsleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const gecti = planGectiMi(plan.tarih)

  useEffect(() => {
    let iptal = false
    Promise.all([planYanitlariGetir([plan.id]), grupPlaniKatilimi(plan.id, benimId)])
      .then(([yanitlar, k]) => {
        if (iptal) return
        setBenimYanit(yanitlar.find((y) => y.kullanici_id === benimId)?.durum ?? null)
        setKatilim(k)
      })
      .catch(() => {})
    return () => {
      iptal = true
    }
  }, [plan.id, benimId, surum])

  async function yanitla(durum: YanitDurumu) {
    setIsleniyor(true)
    setHata(null)
    try {
      await grupPlaniYanitla(plan, durum, grup)
      setBenimYanit(durum)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Yanıt gönderilemedi')
    } finally {
      setIsleniyor(false)
    }
  }

  const zaman = [formatDate(plan.tarih) ?? plan.tarih, formatPlanTime(plan.saat, plan.tum_gun), formatDuration(plan.sure)]
    .filter(Boolean)
    .join(' · ')
  const zamanli = { tarih: plan.tarih, saat: plan.saat, sure: plan.sure, tumGun: plan.tum_gun }

  return (
    <div className="panel-tam z-[60]" role="dialog" aria-label={plan.baslik}>
      <div className="flex items-center gap-3 px-5 pt-[calc(1rem+var(--safe-top))] pb-3 shrink-0">
        <button
          onClick={onClose}
          aria-label="Geri"
          className="w-10 h-10 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform shrink-0"
        >
          <Icon name="ArrowLeft" className="w-5 h-5 text-ink-500" />
        </button>
        <GrupAvatari grup={grup} boyut="sm" />
        <div className="min-w-0">
          <p className="text-xs text-ink-400">Grup planı</p>
          <p className="text-sm font-semibold text-ink-700 truncate">{grup.ad}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <div className="card p-5 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orchid-100 flex items-center justify-center text-2xl shrink-0">
              {plan.emoji ?? <Icon name="CalendarClock" className="w-6 h-6 text-orchid-500" />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-bold text-ink-700 leading-snug">{plan.baslik}</h2>
              <p className="text-sm text-ink-500 mt-0.5">{zaman}</p>
            </div>
          </div>
          {!gecti && (
            <div className="mt-3">
              <GeriSayimRozeti kayit={zamanli} />
            </div>
          )}
          {plan.konum && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plan.konum)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm text-teal-600 font-medium mt-3"
            >
              <Icon name="MapPin" className="w-4 h-4 shrink-0" />
              <span className="truncate">{plan.konum}</span>
              <Icon name="ExternalLink" className="w-3 h-3 shrink-0" />
            </a>
          )}
          {plan.notlar && <p className="text-sm text-ink-500 whitespace-pre-wrap leading-relaxed mt-3">{plan.notlar}</p>}

          <div className="mt-4 pt-4 border-t border-ink-100">
            {gecti ? (
              <p className="text-sm font-semibold text-ink-300">Bu plan geçti</p>
            ) : (
              <>
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Yanıtın</p>
                <div className="flex gap-2" role="group" aria-label="Yanıtın">
                  {SECENEKLER.map((s) => (
                    <button
                      key={s.d}
                      onClick={() => void yanitla(s.d)}
                      disabled={isleniyor}
                      aria-pressed={benimYanit === s.d}
                      className={`flex-1 rounded-xl py-2.5 text-sm font-semibold active:scale-95 transition-all disabled:opacity-60 ${
                        benimYanit === s.d ? s.renk : 'bg-mist-100 text-ink-400 border border-ink-100'
                      }`}
                    >
                      {s.etiket}
                    </button>
                  ))}
                </div>
                {benimYanit === 'geliyorum' && (
                  <button
                    onClick={() =>
                      planiTakvimeIndir({
                        baslik: plan.baslik,
                        tarih: plan.tarih,
                        saat: plan.tum_gun ? null : plan.saat,
                        sure: plan.sure,
                        konum: plan.konum,
                        notlar: plan.notlar,
                        uid: plan.id,
                      })
                    }
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-800"
                  >
                    <Icon name="CalendarPlus" className="w-4 h-4" />
                    Telefon takvimine ekle
                  </button>
                )}
                {hata && <p className="text-xs text-rose-600 mt-2">{hata}</p>}
              </>
            )}
          </div>
        </div>

        {gecti && (
          <PlanAnilariKarti
            grupId={grup.id}
            tarih={plan.tarih}
            konum={plan.konum}
            planBasligi={plan.baslik}
            hedefAdi={grup.ad}
            onEklendi={async () => {
              // A photo from it means it happened: my copy counts as done,
              // and the reminder on Planlar doesn't ask again.
              const kayit = await grupPlaniKaydi(plan.id)
              if (kayit) await kayitGuncelle(kayit.id, { aniEklendi: true, durum: 'yapildi' })
            }}
          />
        )}

        {katilim && (
          <KatilimListesi katilim={katilim} plan={{ baslik: plan.baslik, anahtar: plan.id }} durtulebilir={!gecti} />
        )}

        <GetirListesiKarti planId={plan.id} gecti={gecti} />
      </div>
    </div>
  )
}
