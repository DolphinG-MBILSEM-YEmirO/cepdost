import { useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { ErtelemeSecici, GeriAlCubugu } from './TakvimIslemleri'
import { KisilerleSihirbaz } from './OrtakPlanSihirbazi'
import { type Kategori, type Kayit, goruntulemeBasligi } from '../db'
import { CATEGORIES, CATEGORY_COLORS, CATEGORY_ICON_NAME, CATEGORY_LABELS, deDa } from '../lib/format'
import { fikirIstegi, fikirKisileri, fikirler, type FikirKisileri } from '../lib/fikirler'
import { planiSil } from '../lib/planPaylasimi'
import { useTopluIslem } from '../lib/topluIslem'
import { tiklanabilir } from '../lib/a11y'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { BOS_FIKIR_BAGLAMI, fikirBaglamiGetir, type FikirBaglami } from '../sosyal/fikirBaglami'
import { adListesi } from '../sosyal/adlar'
import type { Profil } from '../sosyal/api'

// Plans with no day yet, in a list of their own: who else wants to go,
// a day picked in one tap, or a time found with those friends.

type Filtre = 'hepsi' | Kategori

// Faces shown next to an idea before the names say the rest.
const YUZ_SAYISI = 3

interface Props {
  kayitlar: Kayit[]
  onRecordClick: (kayit: Kayit) => void
}

export function FikirlerView({ kayitlar, onRecordClick }: Props) {
  const liste = useMemo(() => fikirler(kayitlar), [kayitlar])
  const [filtre, setFiltre] = useState<Filtre>('hepsi')
  const [baglam, setBaglam] = useState<FikirBaglami>(BOS_FIKIR_BAGLAMI)
  const [gunSecilen, setGunSecilen] = useState<string | null>(null)
  const [planlanan, setPlanlanan] = useState<{ fikir: Kayit; kisiler: Profil[] } | null>(null)
  const islem = useTopluIslem()
  const sosyalSurum = useSosyalSurum()

  useEffect(() => {
    let iptal = false
    void fikirBaglamiGetir()
      .then((b) => !iptal && setBaglam(b))
      .catch(() => {})
    return () => {
      iptal = true
    }
  }, [sosyalSurum])

  // Category chips only when there's more than one kind to tell apart.
  const kategoriler = CATEGORIES.filter((c) => liste.some((k) => (k.kategori ?? 'not') === c))
  const gorunen = filtre === 'hepsi' || kategoriler.length < 2 ? liste : liste.filter((k) => (k.kategori ?? 'not') === filtre)

  async function gunSec(fikir: Kayit, tarih: string) {
    setGunSecilen(null)
    await islem.uygula([fikir], { tur: 'tasi', tarih })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
        <h1 className="font-display text-2xl font-bold text-ink-700">Fikirler</h1>
        <p className="text-sm text-ink-400 mt-0.5">
          {liste.length > 0 ? `Günü belli olmayan ${liste.length} plan` : 'Günü belli olmayan planlar'}
        </p>
      </div>

      {kategoriler.length > 1 && (
        <div className="flex gap-1.5 px-5 pb-3 overflow-x-auto no-scrollbar shrink-0" role="group" aria-label="Fikirleri süz">
          {(['hepsi', ...kategoriler] as Filtre[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltre(f)}
              aria-pressed={filtre === f}
              className={`chip text-xs shrink-0 ${
                filtre === f ? 'bg-orchid-600 text-white' : 'bg-mist-50 text-ink-400 border border-ink-100'
              }`}
            >
              {f === 'hepsi' ? 'Hepsi' : CATEGORY_LABELS[f]}
            </button>
          ))}
        </div>
      )}

      {/* On a phone the last card scrolls clear of the bottom bar and the
          assistant button. */}
      <div className="flex-1 overflow-y-auto px-5 pb-[calc(10.5rem+var(--safe-bottom))] lg:pb-6 space-y-3">
        {liste.length === 0 ? (
          <div className="flex flex-col items-center text-center py-14 px-4 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <Icon name="Lightbulb" className="w-8 h-8 text-amber-600" />
            </div>
            <p className="font-semibold text-ink-500 mb-1">Henüz fikir yok</p>
            <p className="text-sm text-ink-400 max-w-xs">
              Akışta bir anının altında "Ben de gitmek istiyorum" dediğin yerler ve günü olmadan kaydettiğin planlar burada toplanır.
            </p>
          </div>
        ) : (
          gorunen.map((fikir) => {
            const kisiler = fikirKisileri(fikir, baglam.anilar, baglam.etkilesimler, baglam.benimId)
            const planlanabilir = [...kisiler.gidenler, ...kisiler.isteyenler].flatMap((id) => baglam.arkadaslar.get(id) ?? [])
            return (
              <FikirKarti
                key={fikir.id}
                fikir={fikir}
                kisiler={kisiler}
                profiller={baglam.profiller}
                gunSeciliyor={gunSecilen === fikir.id}
                mesgul={islem.mesgul}
                onAc={() => onRecordClick(fikir)}
                onGunSecici={() => setGunSecilen(gunSecilen === fikir.id ? null : fikir.id)}
                onGunSec={(tarih) => void gunSec(fikir, tarih)}
                onBirliktePlanla={planlanabilir.length > 0 ? () => setPlanlanan({ fikir, kisiler: planlanabilir }) : undefined}
              />
            )
          })
        )}
      </div>

      <GeriAlCubugu sonIslem={islem.sonIslem} onGeriAl={() => void islem.geriAl()} onKapat={islem.kapat} />

      {/* The plan found with friends takes the idea's place in my calendar. */}
      {planlanan && (
        <KisilerleSihirbaz
          kisiler={planlanan.kisiler}
          baslangicIstegi={fikirIstegi(planlanan.fikir, goruntulemeBasligi(planlanan.fikir))}
          onKapat={() => setPlanlanan(null)}
          onOlusturuldu={() => planiSil(planlanan.fikir)}
        />
      )}
    </div>
  )
}

function FikirKarti({
  fikir,
  kisiler,
  profiller,
  gunSeciliyor,
  mesgul,
  onAc,
  onGunSecici,
  onGunSec,
  onBirliktePlanla,
}: {
  fikir: Kayit
  kisiler: FikirKisileri
  profiller: Map<string, Profil>
  gunSeciliyor: boolean
  mesgul: boolean
  onAc: () => void
  onGunSecici: () => void
  onGunSec: (tarih: string) => void
  onBirliktePlanla?: () => void
}) {
  const kategori = fikir.kategori ?? 'not'
  const renk = CATEGORY_COLORS[kategori]
  const baslik = goruntulemeBasligi(fikir)
  const konum = fikir.konum?.trim()
  const yuzler = [...kisiler.gidenler, ...kisiler.isteyenler].slice(0, YUZ_SAYISI)
  const durdur = (is: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    is()
  }

  return (
    <div {...tiklanabilir(onAc)} className="card p-4 cursor-pointer transition-all duration-200 active:opacity-80">
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-2xl ${renk.bg} ${renk.text} flex items-center justify-center text-xl shrink-0`}>
          {fikir.emoji ? <span aria-hidden="true">{fikir.emoji}</span> : <Icon name={CATEGORY_ICON_NAME[kategori]} className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-ink-700 leading-snug text-balance">{baslik}</h3>
          {konum && konum !== baslik && (
            <p className="flex items-center gap-1 text-xs text-teal-600 font-medium mt-0.5">
              <Icon name="MapPin" className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{konum}</span>
            </p>
          )}
          {fikir.ozetNot && <p className="text-xs text-ink-400 mt-1 line-clamp-2">{fikir.ozetNot}</p>}
        </div>
      </div>

      {yuzler.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          <div className="flex -space-x-1.5 shrink-0" aria-hidden="true">
            {yuzler.map((id) => {
              const p = profiller.get(id)
              return (
                <div key={id} className="rounded-2xl ring-2 ring-white">
                  <Avatar ad={p?.ad ?? '?'} foto={p?.avatar} emoji={p?.emoji} renk={p?.renk} boyut="xs" />
                </div>
              )
            })}
          </div>
          <p className="text-xs text-ink-500 min-w-0">{kisiCumlesi(kisiler, profiller)}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mt-3">
        <button
          onClick={durdur(onGunSecici)}
          aria-expanded={gunSeciliyor}
          className={`chip text-xs active:opacity-80 ${
            gunSeciliyor ? 'bg-orchid-50 text-orchid-700 border border-orchid-100' : 'bg-mist-50 text-ink-500 border border-ink-100'
          }`}
        >
          <Icon name="CalendarPlus" className="w-3.5 h-3.5" />
          Gün seç
        </button>
        {onBirliktePlanla && (
          <button onClick={durdur(onBirliktePlanla)} className="chip text-xs bg-teal-50 text-teal-700 border border-teal-100 active:opacity-80">
            <Icon name="Users" className="w-3.5 h-3.5" />
            Birlikte planla
          </button>
        )}
      </div>

      {gunSeciliyor && (
        <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
          <ErtelemeSecici tarih={null} onSec={onGunSec} mesgul={mesgul} etiket={baslik} />
        </div>
      )}
    </div>
  )
}

// "Ali oraya gitti · Ayşe de gitmek istiyor"
function kisiCumlesi(kisiler: FikirKisileri, profiller: Map<string, Profil>): string {
  const parcalar: string[] = []
  if (kisiler.gidenler.length > 0) parcalar.push(`${adListesi(kisiler.gidenler, profiller)} oraya gitti`)
  if (kisiler.isteyenler.length > 0) {
    const adlar = adListesi(kisiler.isteyenler, profiller)
    parcalar.push(`${adlar} ${deDa(adlar)} gitmek istiyor`)
  }
  return parcalar.join(' · ')
}

