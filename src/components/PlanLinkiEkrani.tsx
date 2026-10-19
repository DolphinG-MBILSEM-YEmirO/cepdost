import { useCallback, useEffect, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { Avatar } from './Avatar'
import { formatDate, formatDuration, formatPlanTime } from '../lib/format'
import { linkKaydi, linkPlaniniYanitla } from '../lib/planPaylasimi'
import { motor, motorVarMi } from '../sosyal/cekirdek'
import { arkadaslariGetir, profilimiGetir } from '../sosyal/api'
import {
  linkeYanitVer,
  linkiOku,
  misafirAdi,
  misafirAdiniKaydet,
  misafirMotoru,
  type LinkDurumu,
  type LinkKatilimcisi,
  type LinkPlani,
  type LinkYaniti,
  type PlanLinki,
} from '../sosyal/planLinki'
import type { SosyalMotor } from '../sosyal/nostr/motor'
import { UYGULAMA_ADI } from '../../shared/marka'

// What someone sees when they open a plan link: the plan, who's coming,
// and their own answer. It works without an account (the answer is signed
// with a key made for this browser) and also for signed-in people, whose
// "coming" goes into their calendar like an accepted invite.
interface Props {
  link: PlanLinki
  // Signed in: answers come from the account and the page can be closed.
  girisli: boolean
  onKapat: () => void
  // Opens the app with the host found under Sohbet → Arkadaşlar (after
  // sign-up, for someone without an account).
  onSahibiEkle: (sahipKodu: string) => void
}

const YANIT_SECENEKLERI: { yanit: LinkYaniti; etiket: string; ikon: IconName }[] = [
  { yanit: 'geliyorum', etiket: 'Geliyorum', ikon: 'CheckCircle2' },
  { yanit: 'belki', etiket: 'Belki', ikon: 'CircleHelp' },
  { yanit: 'gelemiyorum', etiket: 'Gelemiyorum', ikon: 'CircleX' },
]

export function PlanLinkiEkrani({ link, girisli, onKapat, onSahibiEkle }: Props) {
  const [m] = useState<SosyalMotor>(() => (girisli && motorVarMi() ? motor() : misafirMotoru()))
  const [durum, setDurum] = useState<LinkDurumu | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [ad, setAd] = useState(() => (girisli ? '' : misafirAdi()))
  const [gonderiliyor, setGonderiliyor] = useState<LinkYaniti | null>(null)
  const [takvimde, setTakvimde] = useState(false)
  const [arkadasMi, setArkadasMi] = useState(true)

  const oku = useCallback(async () => {
    try {
      setDurum(await linkiOku(m, link))
      setHata(null)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Plan açılamadı')
    }
  }, [m, link])

  useEffect(() => {
    void oku()
  }, [oku])

  // Signed in: answer under my profile name, and offer to add the host
  // when we aren't friends yet.
  useEffect(() => {
    if (!girisli) return
    void profilimiGetir()
      .then((p) => p && setAd(p.ad))
      .catch(() => {})
    void arkadaslariGetir()
      .then((liste) => setArkadasMi(liste.some((a) => a.profil.id === link.sahip && a.durum === 'kabul')))
      .catch(() => {})
    void linkKaydi(link.anahtar).then((k) => setTakvimde(!!k))
  }, [girisli, link])

  const plan = durum?.plan ?? null
  const benim = durum?.katilimcilar.find((k) => k.id === m.benimId) ?? null
  const sahibimMi = m.benimId === link.sahip

  async function yanitla(yanit: LinkYaniti) {
    if (!plan) return
    setGonderiliyor(yanit)
    setHata(null)
    try {
      if (girisli) {
        await linkPlaniniYanitla(m, link, plan, ad, yanit)
        setTakvimde(yanit === 'geliyorum')
      } else {
        await linkeYanitVer(m, link, plan, ad, yanit)
        misafirAdiniKaydet(ad)
      }
      await oku()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Yanıt gönderilemedi')
    } finally {
      setGonderiliyor(null)
    }
  }

  return (
    <div className="min-h-screen bg-uygulama">
      <header className="max-w-md mx-auto px-5 pt-[calc(1rem+var(--safe-top))] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/icons/icon-192.png" alt="" className="w-8 h-8 rounded-xl" />
          <span className="font-display text-lg font-bold text-gradient-orchid">{UYGULAMA_ADI}</span>
        </div>
        {girisli && (
          <button
            onClick={onKapat}
            className="text-sm font-semibold text-ink-500 rounded-xl px-3 py-2 hover:bg-ink-50 active:scale-95 transition-all"
          >
            Uygulamaya dön
          </button>
        )}
      </header>

      <main className="max-w-md mx-auto px-5 pt-4 pb-[calc(2.5rem+var(--safe-bottom))] space-y-4">
        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        {!durum ? (
          !hata && (
            <div className="space-y-4">
              <div className="skeleton h-56 rounded-3xl" />
              <div className="skeleton h-32 rounded-3xl" />
            </div>
          )
        ) : !plan ? (
          <div className="card p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-orchid-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="CalendarX" className="w-7 h-7 text-orchid-500" />
            </div>
            <p className="font-semibold text-ink-600 mb-1">Bu plan bulunamadı</p>
            <p className="text-sm text-ink-400 mb-4">
              Link eksik kopyalanmış ya da planın süresi dolmuş olabilir. Linki gönderen kişiye sorabilirsin.
            </p>
            <button onClick={onKapat} className="btn-primary text-sm px-5 py-2.5">
              {UYGULAMA_ADI} uygulamasını aç
            </button>
          </div>
        ) : (
          <>
            <PlanKarti plan={plan} />

            <Katilimcilar
              sahipAdi={plan.sahipAdi}
              katilimcilar={durum.katilimcilar}
              benimId={m.benimId}
            />

            {!plan.iptal && !sahibimMi && (
              <div className="card p-5">
                <h2 className="font-semibold text-ink-700 mb-3">Sen geliyor musun?</h2>
                {!girisli && (
                  <>
                    <label htmlFor="link-ad" className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
                      Adın
                    </label>
                    <input
                      id="link-ad"
                      value={ad}
                      onChange={(e) => setAd(e.target.value)}
                      maxLength={60}
                      placeholder="Adın ve soyadın"
                      autoComplete="name"
                      className="input-field mb-4"
                    />
                  </>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {YANIT_SECENEKLERI.map((s) => {
                    const secili = benim?.yanit === s.yanit
                    return (
                      <button
                        key={s.yanit}
                        onClick={() => void yanitla(s.yanit)}
                        disabled={gonderiliyor !== null}
                        aria-pressed={secili}
                        className={`flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60 ${
                          secili
                            ? 'bg-gradient-orchid text-white shadow-brand'
                            : 'bg-mist-100 text-ink-500 border border-ink-100 hover:border-orchid-200'
                        }`}
                      >
                        <Icon
                          name={gonderiliyor === s.yanit ? 'Loader2' : s.ikon}
                          className={`w-5 h-5 ${gonderiliyor === s.yanit ? 'animate-spin' : ''}`}
                        />
                        {s.etiket}
                      </button>
                    )
                  })}
                </div>
                {benim && (
                  <p className="text-xs text-ink-400 mt-3">
                    Yanıtın iletildi; istediğin zaman değiştirebilirsin.
                    {girisli && takvimde && ' Plan takvimine de eklendi.'}
                  </p>
                )}
              </div>
            )}

            {sahibimMi && (
              <p className="text-sm text-ink-400 text-center px-4">
                Bu senin planın. Linki açan herkesin yanıtı burada ve planın sayfasında görünür.
              </p>
            )}

            {!girisli ? (
              <div className="card p-5 bg-gradient-orchid-soft border-orchid-100">
                <p className="font-semibold text-ink-700 mb-1">Planlarını {UYGULAMA_ADI} ile kur</p>
                <p className="text-sm text-ink-500 mb-4">
                  {plan.sahipAdi} ile arkadaş ol; boş saatlerinizi görün, sonraki planı birlikte ayarlayın. Ücretsiz.
                </p>
                <button onClick={() => onSahibiEkle(plan.sahipKodu)} className="btn-primary w-full">
                  Hesap oluştur
                </button>
              </div>
            ) : (
              !arkadasMi &&
              !sahibimMi && (
                <button
                  onClick={() => onSahibiEkle(plan.sahipKodu)}
                  className="w-full card p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                >
                  <Avatar ad={plan.sahipAdi} boyut="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink-700 truncate">{plan.sahipAdi}</p>
                    <p className="text-xs text-ink-400">Arkadaş olarak ekle</p>
                  </div>
                  <Icon name="UserPlus" className="w-5 h-5 text-orchid-500 shrink-0" />
                </button>
              )
            )}
          </>
        )}
      </main>
    </div>
  )
}

function PlanKarti({ plan }: { plan: LinkPlani }) {
  const gun = formatDate(plan.tarih)
  const saat = [formatPlanTime(plan.saat, plan.tum_gun), formatDuration(plan.sure)].filter(Boolean).join(' · ')
  const harita = plan.konum ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plan.konum)}` : null

  return (
    <div className="card overflow-hidden">
      <div className="bg-gradient-orchid-soft px-5 pt-6 pb-5 text-center">
        <div className="w-16 h-16 rounded-3xl bg-mist-50 shadow-soft flex items-center justify-center mx-auto mb-3">
          {plan.emoji ? (
            <span className="text-3xl" aria-hidden="true">
              {plan.emoji}
            </span>
          ) : (
            <Icon name="CalendarDays" className="w-8 h-8 text-orchid-500" />
          )}
        </div>
        <p className="text-sm text-ink-500">{plan.sahipAdi} seni davet ediyor</p>
        <h1 className="font-display text-2xl font-bold text-ink-700 mt-1 break-words">{plan.baslik}</h1>
      </div>

      {plan.iptal && (
        <div className="flex items-center gap-2 bg-rose-50 border-y border-rose-100 px-5 py-3">
          <Icon name="AlertCircle" className="w-4 h-4 text-rose-500 shrink-0" />
          <p className="text-sm font-medium text-rose-700">Bu plan iptal edildi.</p>
        </div>
      )}

      <div className="px-5 py-4 space-y-3">
        {gun && <Bilgi ikon="CalendarDays" metin={gun} alt={saat || null} />}
        {plan.konum && (
          <Bilgi
            ikon="MapPin"
            metin={plan.konum}
            alt={
              harita ? (
                <a href={harita} target="_blank" rel="noreferrer" className="text-orchid-600 font-medium">
                  Haritada aç
                </a>
              ) : null
            }
          />
        )}
        {plan.not && <p className="text-sm text-ink-500 italic">“{plan.not}”</p>}
      </div>
    </div>
  )
}

function Bilgi({ ikon, metin, alt }: { ikon: IconName; metin: string; alt?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-orchid-50 flex items-center justify-center shrink-0">
        <Icon name={ikon} className="w-4 h-4 text-orchid-500" />
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-semibold text-ink-700 break-words">{metin}</p>
        {alt && <p className="text-xs text-ink-400 mt-0.5">{alt}</p>}
      </div>
    </div>
  )
}

// The host first (they're coming), then everyone who answered. People who
// can't come are only counted.
export function Katilimcilar({
  sahipAdi,
  katilimcilar,
  benimId,
}: {
  sahipAdi: string | null
  katilimcilar: LinkKatilimcisi[]
  benimId?: string
}) {
  const gelenler = katilimcilar.filter((k) => k.yanit === 'geliyorum')
  const belkiler = katilimcilar.filter((k) => k.yanit === 'belki')
  const gelemeyen = katilimcilar.filter((k) => k.yanit === 'gelemiyorum').length
  const gelenSayisi = gelenler.length + (sahipAdi ? 1 : 0)

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold text-ink-700">Kimler geliyor</h2>
        <p className="text-xs text-ink-400">
          {gelenSayisi} geliyor{belkiler.length > 0 && ` · ${belkiler.length} belki`}
          {gelemeyen > 0 && ` · ${gelemeyen} gelemiyor`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {sahipAdi && <Kisi ad={sahipAdi} etiket="Düzenleyen" />}
        {gelenler.map((k) => (
          <Kisi key={k.id} ad={k.ad} etiket={k.id === benimId ? 'Sen' : undefined} />
        ))}
        {belkiler.map((k) => (
          <Kisi key={k.id} ad={k.ad} etiket={k.id === benimId ? 'Sen · belki' : 'Belki'} soluk />
        ))}
        {gelenSayisi === 0 && belkiler.length === 0 && (
          <p className="text-sm text-ink-400">Henüz yanıt yok.</p>
        )}
      </div>
    </div>
  )
}

function Kisi({ ad, etiket, soluk }: { ad: string; etiket?: string; soluk?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 ${
        soluk ? 'bg-mist-100 border-ink-100 opacity-70' : 'bg-mist-50 border-ink-100'
      }`}
    >
      <Avatar ad={ad} boyut="sm" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-700 truncate max-w-[9rem]">{ad}</p>
        {etiket && <p className="text-[11px] text-ink-400 leading-tight">{etiket}</p>}
      </div>
    </div>
  )
}
