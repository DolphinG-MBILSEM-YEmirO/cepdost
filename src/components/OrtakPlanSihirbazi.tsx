import { useMemo, useState } from 'react'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import type { Arkadas, Profil } from '../sosyal/api'
import type { Grup } from '../sosyal/gruplar'
import { gunleriUret, ortakPlanOner, type BosAralik, type OnerilenPlan } from '../sosyal/ortakPlan'
import { planiKur } from '../lib/planPaylasimi'
import { formatDate } from '../lib/format'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'

// F16 — "herkese uyan plan" sihirbazı.
//
// Grup modunda plan grup planı olarak oluşur ve üyeler "geliyorum" dedikçe
// kendi takvimlerine düşer (bkz. GrupDetay'daki yanitla). Arkadaş modunda
// herkese ayrı plan daveti gider, kabul eden kendi takvimine ekler. Her iki
// yolda da kimsenin takvimine onayı olmadan bir şey yazılmıyor — bu bilinçli.

type Asama = 'kisiler' | 'istek' | 'oneri'

interface Props {
  benimAdim: string
  // Grup modu: üyeler sabit. Arkadaş modu: listeden seçiliyor.
  grup?: Grup
  grupUyeleri?: Profil[]
  arkadaslar?: Arkadas[]
  // Opened from a one-to-one chat: the people are fixed, no picking step.
  sabitKisiler?: Profil[]
  onKapat: () => void
  onOlusturuldu: () => void | Promise<void>
}

const GUN_SECENEKLERI = [
  { gun: 3, etiket: '3 gün' },
  { gun: 7, etiket: '1 hafta' },
  { gun: 14, etiket: '2 hafta' },
]

const SURE_SECENEKLERI = [60, 90, 120, 180]

function dakikaFarki(baslangic: string, bitis: string): number {
  const dakika = (s: string) => {
    const [h, m] = s.split(':').map(Number)
    return h * 60 + m
  }
  return Math.max(0, dakika(bitis) - dakika(baslangic))
}

export function OrtakPlanSihirbazi({
  benimAdim,
  grup,
  grupUyeleri,
  arkadaslar,
  sabitKisiler,
  onKapat,
  onOlusturuldu,
}: Props) {
  useEscapeIleKapat(onKapat)
  const grupModu = !!grup
  const secilebilir = useMemo(
    () => (arkadaslar ?? []).filter((a) => a.durum === 'kabul').map((a) => a.profil),
    [arkadaslar],
  )

  const kisilerSabit = grupModu || !!sabitKisiler
  const [asama, setAsama] = useState<Asama>(kisilerSabit ? 'istek' : 'kisiler')
  const [secili, setSecili] = useState<string[]>([])
  const [istek, setIstek] = useState('')
  const [gunSayisi, setGunSayisi] = useState(7)
  const [sure, setSure] = useState(90)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [plan, setPlan] = useState<OnerilenPlan | null>(null)
  const [secenekler, setSecenekler] = useState<OnerilenPlan[]>([])
  const [bosluklar, setBosluklar] = useState<BosAralik[]>([])
  const [mesaj, setMesaj] = useState<string | null>(null)
  const [gonderildi, setGonderildi] = useState(false)

  const katilimcilar = grupModu
    ? (grupUyeleri ?? [])
    : (sabitKisiler ?? secilebilir.filter((p) => secili.includes(p.id)))

  async function oneriAl() {
    if (!istek.trim()) {
      setHata('Ne yapmak istediğini bir cümleyle yaz.')
      return
    }
    setYukleniyor(true)
    setHata(null)
    setMesaj(null)
    try {
      const sonuc = await ortakPlanOner({
        istek: istek.trim(),
        benimAdim,
        katilimcilar,
        gunler: gunleriUret(gunSayisi),
        enAzDakika: sure,
      })
      setPlan(sonuc.plan)
      setSecenekler(sonuc.secenekler)
      setBosluklar(sonuc.bosluklar)
      setMesaj(sonuc.mesaj ?? null)
      setAsama('oneri')
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Öneri alınamadı')
    } finally {
      setYukleniyor(false)
    }
  }

  async function planiOlustur() {
    if (!plan) return
    setYukleniyor(true)
    setHata(null)
    try {
      // The plan always lands in the chat as a card (the group's, or ours
      // with each friend), wherever the wizard was opened from, and goes in
      // my calendar: whoever suggests it is coming.
      await planiKur(
        { ...plan, not: plan.gerekce, emoji: null },
        grupModu && grup ? { tur: 'grup', grup } : { tur: 'arkadaslar', kisiler: katilimcilar },
        grupModu ? `${benimAdim} bir plan önerdi 👇` : undefined,
      )

      setGonderildi(true)
      await onOlusturuldu()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Plan oluşturulamadı')
    } finally {
      setYukleniyor(false)
    }
  }

  if (gonderildi && plan) {
    return (
      <Kabuk baslik="Plan hazır" onKapat={onKapat}>
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="card p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
              <Icon name="CheckCircle2" className="w-7 h-7 text-teal-600" />
            </div>
            <p className="font-display text-lg font-bold text-ink-700 mb-1">{plan.baslik}</p>
            <p className="text-sm text-ink-400 mb-5">
              {formatDate(plan.tarih) ?? plan.tarih} · {plan.saat}
            </p>
            <p className="text-sm text-ink-500">
              {grupModu
                ? 'Plan grup sohbetine düştü. "Geliyorum" diyen herkesin takvimine eklenecek.'
                : `${katilimcilar.length} kişiye davet gönderildi ve sohbetinize düştü. Kabul edenlerin takvimine eklenecek.`}
            </p>
          </div>
          <button onClick={onKapat} className="btn-primary w-full mt-4">
            Tamam
          </button>
        </div>
      </Kabuk>
    )
  }

  return (
    <Kabuk
      baslik={grupModu ? `${grup!.ad} için plan` : 'Yapay zekâ ile plan'}
      onKapat={onKapat}
    >
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        {asama === 'kisiler' && (
          <>
            <p className="text-sm text-ink-400">
              Kimlerle plan yapacaksın? Takvimlerine bakıp herkese uyan bir saat bulacağım.
            </p>

            {secilebilir.length === 0 ? (
              <div className="card p-5 text-center">
                <p className="text-sm text-ink-400">
                  Önce arkadaş ekle — ortak plan için en az bir kişi gerekli.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {secilebilir.map((p) => {
                  const isaretli = secili.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      onClick={() =>
                        setSecili((eski) =>
                          isaretli ? eski.filter((x) => x !== p.id) : [...eski, p.id],
                        )
                      }
                      className={`w-full flex items-center gap-3 rounded-2xl p-3 border transition-all active:scale-[0.98] ${
                        isaretli ? 'bg-orchid-50 border-orchid-200' : 'bg-mist-100 border-ink-100'
                      }`}
                    >
                      <Avatar ad={p.ad} foto={p.avatar} emoji={p.emoji} renk={p.renk} boyut="sm" />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium text-ink-700 truncate">{p.ad}</p>
                        {!p.musaitlik_paylas && (
                          <p className="text-[11px] text-amber-600">Müsaitliğini paylaşmıyor</p>
                        )}
                      </div>
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                          isaretli ? 'bg-orchid-500' : 'bg-mist-50 border border-ink-200'
                        }`}
                      >
                        {isaretli && <Icon name="Check" className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <button
              onClick={() => {
                if (secili.length === 0) {
                  setHata('En az bir kişi seç.')
                  return
                }
                setHata(null)
                setAsama('istek')
              }}
              disabled={secili.length === 0}
              className="btn-primary w-full disabled:opacity-50"
            >
              Devam
            </button>
          </>
        )}

        {asama === 'istek' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {katilimcilar.slice(0, 6).map((p) => (
                <span
                  key={p.id}
                  className="chip bg-mist-100 text-ink-500 border border-ink-100 text-xs"
                >
                  {p.ad}
                </span>
              ))}
              {katilimcilar.length > 6 && (
                <span className="text-xs text-ink-300">+{katilimcilar.length - 6}</span>
              )}
            </div>

            <div>
              <FieldLabel>Ne yapmak istiyorsunuz?</FieldLabel>
              <textarea
                value={istek}
                onChange={(e) => setIstek(e.target.value)}
                placeholder="Hafta sonu kahvaltıda buluşalım"
                rows={3}
                className="input-field resize-none"
                autoFocus
              />
            </div>

            <div>
              <FieldLabel>Hangi aralıkta?</FieldLabel>
              <div className="flex gap-2">
                {GUN_SECENEKLERI.map((s) => (
                  <button
                    key={s.gun}
                    onClick={() => setGunSayisi(s.gun)}
                    className={`chip flex-1 justify-center ${
                      gunSayisi === s.gun
                        ? 'bg-gradient-orchid text-white'
                        : 'bg-mist-100 text-ink-500 border border-ink-100'
                    }`}
                  >
                    {s.etiket}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel>Ne kadar sürsün?</FieldLabel>
              <div className="flex gap-2">
                {SURE_SECENEKLERI.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSure(s)}
                    className={`chip flex-1 justify-center ${
                      sure === s
                        ? 'bg-gradient-orchid text-white'
                        : 'bg-mist-100 text-ink-500 border border-ink-100'
                    }`}
                  >
                    {s >= 60 ? `${s / 60} sa` : `${s} dk`}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => void oneriAl()}
              disabled={yukleniyor}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Icon
                name={yukleniyor ? 'Loader2' : 'Wand2'}
                className={`w-4 h-4 ${yukleniyor ? 'animate-spin' : ''}`}
              />
              {yukleniyor ? 'Takvimlere bakıyorum...' : 'Uygun saati bul'}
            </button>

            {!kisilerSabit && (
              <button onClick={() => setAsama('kisiler')} className="btn-ghost w-full text-sm">
                Kişileri değiştir
              </button>
            )}
          </>
        )}

        {asama === 'oneri' && (
          <>
            {plan ? (
              <>
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-orchid-100 flex items-center justify-center shrink-0">
                      <Icon name="Wand2" className="w-[18px] h-[18px] text-orchid-500" />
                    </div>
                    <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">
                      Herkese uyan öneri
                    </p>
                  </div>

                  <p className="font-display text-lg font-bold text-ink-700 mb-1">{plan.baslik}</p>
                  <div className="flex items-center gap-3 text-sm text-ink-500 mb-3">
                    <span className="flex items-center gap-1.5">
                      <Icon name="CalendarDays" className="w-4 h-4 text-ink-300" />
                      {formatDate(plan.tarih) ?? plan.tarih}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Icon name="Clock" className="w-4 h-4 text-ink-300" />
                      {plan.saat} · {plan.sure} dk
                    </span>
                  </div>
                  {plan.konum && (
                    <p className="flex items-center gap-1.5 text-sm text-ink-500 mb-3">
                      <Icon name="MapPin" className="w-4 h-4 text-orchid-500" />
                      {plan.konum}
                    </p>
                  )}
                  {plan.gerekce && (
                    <p className="text-sm text-ink-400 bg-mist-100 rounded-2xl px-4 py-3">
                      {plan.gerekce}
                    </p>
                  )}
                </div>

                {secenekler.length > 1 && (
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2 px-1">
                      Başka fikirler
                    </p>
                    <div className="space-y-2">
                      {secenekler
                        .filter((s) => s !== plan)
                        .map((s, i) => (
                          <button
                            key={i}
                            onClick={() => setPlan(s)}
                            className="w-full card p-3 text-left active:scale-[0.98] transition-transform"
                          >
                            <p className="text-sm font-semibold text-ink-700 truncate">{s.baslik}</p>
                            <p className="text-xs text-ink-400 mt-0.5">
                              {formatDate(s.tarih) ?? s.tarih} · {s.saat} · {s.sure} dk
                            </p>
                            {s.gerekce && (
                              <p className="text-xs text-ink-400 mt-1 line-clamp-2">{s.gerekce}</p>
                            )}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {bosluklar.length > 1 && (
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2 px-1">
                      Diğer uygun aralıklar
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {bosluklar.slice(0, 8).map((b, i) => (
                        <button
                          key={i}
                          onClick={() =>
                            // Keep the plan inside the slot it was moved to.
                            setPlan({
                              ...plan,
                              tarih: b.tarih,
                              saat: b.baslangic,
                              sure: Math.min(plan.sure, dakikaFarki(b.baslangic, b.bitis)),
                            })
                          }
                          className="chip bg-mist-100 text-ink-500 border border-ink-100 text-xs active:scale-95"
                        >
                          {formatDate(b.tarih) ?? b.tarih} {b.baslangic}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => void planiOlustur()}
                  disabled={yukleniyor}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Icon
                    name={yukleniyor ? 'Loader2' : 'Send'}
                    className={`w-4 h-4 ${yukleniyor ? 'animate-spin' : ''}`}
                  />
                  {grupModu
                    ? 'Planı grupla paylaş'
                    : katilimcilar.length === 1
                      ? `${katilimcilar[0].ad} ile paylaş`
                      : `${katilimcilar.length} kişiye gönder`}
                </button>
              </>
            ) : (
              <div className="card p-5 text-center">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
                  <Icon name="CalendarClock" className="w-6 h-6 text-amber-600" />
                </div>
                <p className="text-sm text-ink-500">{mesaj ?? 'Uygun bir aralık bulunamadı.'}</p>
              </div>
            )}

            <button onClick={() => setAsama('istek')} className="btn-ghost w-full text-sm">
              İsteği değiştir
            </button>
          </>
        )}

        <p className="text-[11px] text-ink-300 text-center leading-relaxed pt-2">
          Yalnızca kimin ne zaman dolu olduğuna bakıyorum — kimsenin plan başlığını,
          yerini ya da detayını görmüyorum.
        </p>
      </div>
    </Kabuk>
  )
}

function Kabuk({
  baslik,
  onKapat,
  children,
}: {
  baslik: string
  onKapat: () => void
  children: React.ReactNode
}) {
  return (
    <div className="panel-tam z-[60]">
      <div className="flex items-center justify-between px-5 pt-[calc(1rem+var(--safe-top))] pb-4 border-b border-ink-100 shrink-0">
        <h2 className="font-display text-base font-bold text-ink-700 truncate">{baslik}</h2>
        <button
          onClick={onKapat}
          className="w-10 h-10 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform shrink-0"
        >
          <Icon name="X" className="w-5 h-5 text-ink-500" />
        </button>
      </div>
      {children}
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
