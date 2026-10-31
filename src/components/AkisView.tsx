import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { ChatButton } from './ChatButton'
import { EkranBasligi } from '../ui/EkranBasligi'
import { BosDurum } from '../ui/BosDurum'
import { SegmentedControl } from '../ui/SegmentedControl'
import { AkisKarti } from './AkisKarti'
import { AniYanitlari } from './AniYanitlari'
import { motor, motorVarMi, useSosyalSurum } from '../sosyal/cekirdek'
import { akisAnilariGetir, gruplarimiGetir, profilleriGetir, type AkisKapsami, type Ani, type Grup } from '../sosyal/gruplar'
import { ozettenProfil, type Profil } from '../sosyal/api'
import { BOS_ETKILESIM, aniEtkilesimleri, gitmekIstiyorum, yanitlayanlar, type AniEtkilesimi } from '../sosyal/aniEtkilesimi'
import { anidanPlan } from '../lib/planPaylasimi'
import type { Kayit } from '../db'
import { akisSecenekleri, secimdekiler, yeniMi, type AkisSecimi } from '../lib/akisSuzgeci'

// "İnsanların ve arkadaşların paylaştıkları" — tek akış, iki kapsam:
// Arkadaşlar (bana/gruplarıma özel paylaşılanlar) ve Herkes (Keşfet).
// Friends answer a memory with a reaction or a comment; anyone can say
// they want to go there too, which puts the place in their calendar. The
// friends feed narrows to one person or group, and marks what came in
// since the last look on this device.

// How long "added to your plans" stays on screen.
const EKLENDI_MS = 6000

const SON_BAKIS_ANAHTARI = 'cepdost_akis_son_bakis'

// When I last opened the feed on this device.
function sonBakisiOku(benimId: string): string | null {
  try {
    return localStorage.getItem(`${SON_BAKIS_ANAHTARI}:${benimId}`)
  } catch {
    // Private mode: nothing is marked new.
    return null
  }
}

function sonBakisiYaz(benimId: string) {
  try {
    localStorage.setItem(`${SON_BAKIS_ANAHTARI}:${benimId}`, new Date().toISOString())
  } catch {
    // Private mode: see above.
  }
}

interface Props {
  onPlanAc: (kayit: Kayit) => void
  onAsistan?: () => void
  // Opens the post composer, so an empty feed isn't a dead end.
  onPaylas?: () => void
}

export function AkisView({ onPlanAc, onAsistan, onPaylas }: Props) {
  const [kapsam, setKapsam] = useState<AkisKapsami>('arkadaslar')
  const [anilar, setAnilar] = useState<Ani[] | null>(null)
  const [profiller, setProfiller] = useState<Map<string, Profil>>(new Map())
  const [etkilesimler, setEtkilesimler] = useState<Map<string, AniEtkilesimi>>(new Map())
  const [eklenen, setEklenen] = useState<Kayit | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [gruplar, setGruplar] = useState<Map<string, Grup>>(new Map())
  const [secim, setSecim] = useState<AkisSecimi | null>(null)
  const sosyalSurum = useSosyalSurum()
  const benimId = motorVarMi() ? motor().benimId : ''
  // Read once when the feed opens, then this visit becomes the last look;
  // posts arriving while it's open are new too.
  const [sonBakis] = useState(() => (benimId ? sonBakisiOku(benimId) : null))
  useEffect(() => {
    if (benimId) sonBakisiYaz(benimId)
  }, [benimId])
  // The friends feed is read from the local copy, so it follows every sync;
  // Keşfet asks the relays, so it only reloads when opened.
  const surumBagimliligi = kapsam === 'arkadaslar' ? sosyalSurum : 0

  const tazele = useCallback(async () => {
    setHata(null)
    try {
      const liste = await akisAnilariGetir(kapsam)
      // Answers only exist on the friends feed (see aniEtkilesimi.ts).
      const yanitlar = kapsam === 'arkadaslar' ? await aniEtkilesimleri(liste) : new Map<string, AniEtkilesimi>()
      const grupListesi = kapsam === 'arkadaslar' ? await gruplarimiGetir() : []
      setAnilar(liste)
      setEtkilesimler(yanitlar)
      setGruplar(new Map(grupListesi.map((g) => [g.id, g])))
      setProfiller(await profilleriGetir([...liste.map((a) => a.sahip_id), ...yanitlayanlar(yanitlar)]))
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Akış yüklenemedi')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kapsam, surumBagimliligi])

  useEffect(() => {
    void tazele()
  }, [tazele])

  useEffect(() => {
    if (!eklenen) return
    const zamanlayici = setTimeout(() => setEklenen(null), EKLENDI_MS)
    return () => clearTimeout(zamanlayici)
  }, [eklenen])

  // "Ben de gitmek istiyorum": the one who shared it hears about it (friends
  // feed only), and the place goes into my plans as an idea.
  async function gitmek(ani: Ani, istiyor: boolean) {
    if (kapsam === 'arkadaslar') await gitmekIstiyorum(ani, istiyor)
    if (!istiyor) return
    const sahip = profiller.get(ani.sahip_id)?.ad ?? ani.sahip?.ad ?? null
    setEklenen((await anidanPlan(ani.mekan_adi, sahip)).kayit)
  }

  // The one who shared it makes a plan of it, straight on the plan's page.
  async function planla(ani: Ani) {
    onPlanAc((await anidanPlan(ani.mekan_adi, null)).kayit)
  }

  function kapsamSec(yeni: AkisKapsami) {
    if (yeni === kapsam) return
    setAnilar(null)
    setSecim(null)
    setKapsam(yeni)
  }

  const arkadasAkisi = kapsam === 'arkadaslar'
  const secenekler = useMemo(
    () =>
      arkadasAkisi && anilar
        ? akisSecenekleri(
            anilar,
            benimId,
            (id) => profiller.get(id)?.ad ?? null,
            (id) => gruplar.get(id)?.ad ?? null,
          )
        : [],
    [arkadasAkisi, anilar, benimId, profiller, gruplar],
  )
  // A choice that's gone from the list (its posts deleted) stops filtering.
  const gecerliSecim = secim && secenekler.some((s) => s.tur === secim.tur && s.id === secim.id) ? secim : null
  const gorunenler = anilar ? secimdekiler(anilar, gecerliSecim) : null
  const yeniSayisi = arkadasAkisi && anilar ? anilar.filter((a) => yeniMi(a, benimId, sonBakis)).length : 0

  return (
    <div className="flex flex-col h-full">
      <EkranBasligi
        baslik="Akış"
        altBaslik={
          <>
            Paylaşılan mekanlar
            {yeniSayisi > 0 && <span className="font-semibold text-white"> · {yeniSayisi} yeni</span>}
          </>
        }
        eylemler={onAsistan && <ChatButton onClick={onAsistan} />}
      >
        <div className="lg:max-w-sm">
          <SegmentedControl
            etiket="Akış kapsamı"
            secili={kapsam}
            onSec={kapsamSec}
            segmentler={[
              { id: 'arkadaslar', etiket: 'Arkadaşlar' },
              { id: 'herkes', etiket: 'Keşfet' },
            ]}
          />
        </div>
      </EkranBasligi>

      {secenekler.length > 0 && (
        <div
          className="flex gap-1.5 px-4 pb-3 shrink-0 overflow-x-auto no-scrollbar"
          role="group"
          aria-label="Kişiye ya da gruba göre süz"
        >
          {[null, ...secenekler].map((s) => {
            const secili = s ? gecerliSecim?.tur === s.tur && gecerliSecim.id === s.id : !gecerliSecim
            return (
              <button
                key={s ? `${s.tur}:${s.id}` : 'hepsi'}
                onClick={() => setSecim(s && { tur: s.tur, id: s.id })}
                aria-pressed={secili}
                className={`chip text-xs shrink-0 ${secili ? 'bg-bolum text-white shadow-glow' : 'bg-white text-ink-600 shadow-soft hover:bg-bolum-soluk'}`}
              >
                {s?.tur === 'grup' && <Icon name="Users" className="w-3.5 h-3.5" />}
                {s ? s.ad : 'Hepsi'}
                <span className={secili ? 'text-white/80' : 'text-ink-400'}>{s ? s.sayi : anilar?.length}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* On a phone the last card scrolls clear of the bottom bar and the
          assistant button, so its comment box and buttons stay tappable. */}
      <div className="flex-1 overflow-y-auto px-4 pb-[calc(10.5rem+var(--safe-bottom))] space-y-4 kademeli lg:pb-10 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0 lg:items-start">
        {hata && (
          <div className="flex items-start gap-2 bg-white border border-rose-200 rounded-xl px-4 py-3 lg:col-span-2">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        {anilar === null && !hata ? (
          <>
            <div className="skeleton h-72 rounded-3xl" />
            <div className="skeleton h-72 rounded-3xl" />
          </>
        ) : anilar && anilar.length === 0 ? (
          <div className="card lg:col-span-2">
            <BosDurum
              ikon="ImageIcon"
              baslik="Henüz paylaşım yok"
              aciklama={
                kapsam === 'arkadaslar'
                  ? 'Arkadaşların seninle bir mekan fotoğrafı paylaştığında burada görünecek.'
                  : 'Herkese açık paylaşılan mekan fotoğrafları burada görünecek.'
              }
              eylem={onPaylas && { etiket: 'İlk paylaşımı sen yap', ikon: 'Camera', onClick: onPaylas }}
              sikisik
            />
          </div>
        ) : (
          gorunenler?.map((a) => (
            <AkisKarti
              key={a.id}
              ani={a}
              sahip={profiller.get(a.sahip_id) ?? (a.sahip ? ozettenProfil(a.sahip_id, a.sahip) : null)}
              grupAdi={a.grup_id ? gruplar.get(a.grup_id)?.ad : null}
              yeni={arkadasAkisi && yeniMi(a, benimId, sonBakis)}
            >
              <AniYanitlari
                ani={a}
                etkilesim={etkilesimler.get(a.id) ?? BOS_ETKILESIM}
                profiller={profiller}
                benimId={benimId}
                yanitlanabilir={kapsam === 'arkadaslar'}
                onGitmek={gitmek}
                onPlanla={planla}
              />
            </AkisKarti>
          ))
        )}
      </div>

      {eklenen && (
        <div role="status" className="fixed z-[45] inset-x-4 mx-auto max-w-sm bottom-[calc(10.5rem+var(--safe-bottom))] lg:bottom-6 animate-fade-in">
          <div className="flex items-center gap-3 rounded-2xl bg-ink-800/95 text-white shadow-float pl-4 pr-2 py-2.5">
            <Icon name="CalendarPlus" className="w-4 h-4 text-teal-300 shrink-0" />
            <span className="flex-1 text-sm leading-snug">Planlarına eklendi, günü sen seç</span>
            <button
              onClick={() => {
                onPlanAc(eklenen)
                setEklenen(null)
              }}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-brand-200 hover:bg-white/10 active:opacity-80"
            >
              Aç
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
