import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Icon, type IconName } from './Icon'
import { Avatar, GrupAvatari } from './Avatar'
import { AniArsivi } from './AniArsivi'
import { ArkadasMusaitlik } from './ArkadasMusaitlik'
import { PlanPaylasSheet } from './PlanPaylas'
import { ArkadaslaSihirbaz } from './OrtakPlanSihirbazi'
import { OrtakGecmisSatiri } from './PlanIstatistikleri'
import { db, goruntulemeBasligi } from '../db'
import { formatDate, formatPlanTime, localDateString } from '../lib/format'
import { renkAl } from '../lib/kisisellestirme'
import { useGeriIleKapat } from '../lib/geriTusu'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { arkadasliktanCik, davetleriGetir, type Profil } from '../sosyal/api'
import { ortakGruplar, type Grup } from '../sosyal/gruplar'

// A friend's profile: who they are, the two things people usually want
// (write to them, make a plan), what we've done together, and three tabs:
// what we share (upcoming plans and groups), their availability, and our
// memories.
interface Props {
  arkadas: Profil
  benimId: string
  onClose: () => void
  // Opens our chat. Opened from that chat, it just closes the profile.
  onMesaj: () => void
  // Opens one of our shared groups, where the screen can show it.
  onGrupAc?: (grup: Grup) => void
  // Offers unfriending when set (the friends list passes it).
  arkadaslikId?: string
  onCikarildi?: () => void | Promise<void>
}

type Sekme = 'birlikte' | 'musaitlik' | 'anilar'

const SEKMELER: { id: Sekme; etiket: string; ikon: IconName }[] = [
  { id: 'birlikte', etiket: 'Birlikte', ikon: 'Users' },
  { id: 'musaitlik', etiket: 'Müsaitlik', ikon: 'CalendarClock' },
  { id: 'anilar', etiket: 'Anılar', ikon: 'ImageIcon' },
]

export function ArkadasProfili({ arkadas, benimId, onClose, onMesaj, onGrupAc, arkadaslikId, onCikarildi }: Props) {
  const [sekme, setSekme] = useState<Sekme>('birlikte')
  const [paylasAcik, setPaylasAcik] = useState(false)
  const [sihirbazAcik, setSihirbazAcik] = useState(false)
  // Sheets opened from here sit above the profile, so Escape and the back
  // button close them first.
  useGeriIleKapat(onClose)
  const zemin = renkAl(arkadas.renk, arkadas.ad).zemin

  return (
    <div className="panel-tam z-[55]" role="dialog" aria-label={`${arkadas.ad} profili`}>
      <div className={`flex justify-end px-5 pt-[calc(1rem+var(--safe-top))] shrink-0 ${zemin}`}>
        <button
          onClick={onClose}
          aria-label="Kapat"
          className="w-10 h-10 rounded-full bg-mist-50/80 flex items-center justify-center active:opacity-80 transition-transform"
        >
          <Icon name="X" className="w-5 h-5 text-ink-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className={`px-5 pb-6 text-center ${zemin}`}>
          <div className="flex justify-center mb-3">
            <Avatar ad={arkadas.ad} foto={arkadas.avatar} emoji={arkadas.emoji} renk={arkadas.renk} boyut="lg" />
          </div>
          <h2 className="font-display text-xl font-bold text-ink-700 break-words">{arkadas.ad}</h2>
          {arkadas.kullanici_adi && <p className="text-sm text-ink-400">@{arkadas.kullanici_adi}</p>}
          {arkadas.biyografi && (
            <p className="text-sm text-ink-500 mt-2 max-w-sm mx-auto whitespace-pre-line break-words">
              {arkadas.biyografi}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 mt-5 max-w-xs mx-auto">
            <button onClick={onMesaj} className="btn-primary text-sm py-2.5 flex items-center justify-center gap-2">
              <Icon name="MessageCircle" className="w-4 h-4" />
              Mesaj
            </button>
            <button
              onClick={() => setPaylasAcik(true)}
              className="bg-mist-50 text-orchid-700 font-semibold text-sm rounded-2xl py-2.5 flex items-center justify-center gap-2 border border-orchid-100 active:opacity-80 transition-all hover:bg-orchid-50"
            >
              <Icon name="CalendarPlus" className="w-4 h-4" />
              Plan yap
            </button>
          </div>
          <OrtakGecmisSatiri arkadasId={arkadas.id} />
        </div>

        <div className="sticky top-0 z-10 bg-mist-100 flex gap-1.5 px-5 py-3" role="tablist">
          {SEKMELER.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={sekme === s.id}
              onClick={() => setSekme(s.id)}
              className={`chip ${
                sekme === s.id ? 'bg-orchid-600 text-white' : 'bg-mist-50 text-ink-400 border border-ink-100'
              }`}
            >
              <Icon name={s.ikon} className="w-4 h-4" />
              {s.etiket}
            </button>
          ))}
        </div>

        {sekme === 'birlikte' ? (
          <Birlikte arkadas={arkadas} onGrupAc={onGrupAc} arkadaslikId={arkadaslikId} onCikarildi={onCikarildi} />
        ) : sekme === 'musaitlik' ? (
          <ArkadasMusaitlik arkadas={arkadas} />
        ) : (
          <div className="px-5 pb-8">
            <AniArsivi arkadasId={arkadas.id} benimId={benimId} baslik={arkadas.ad} />
          </div>
        )}
      </div>

      {paylasAcik && (
        <PlanPaylasSheet
          hedef={{ tur: 'arkadas', id: arkadas.id, ad: arkadas.ad }}
          onKapat={() => setPaylasAcik(false)}
          onUygunSaat={() => {
            setPaylasAcik(false)
            setSihirbazAcik(true)
          }}
        />
      )}
      {sihirbazAcik && <ArkadaslaSihirbaz arkadas={arkadas} onKapat={() => setSihirbazAcik(false)} />}
    </div>
  )
}

interface OrtakPlan {
  id: string
  baslik: string
  emoji: string | null
  tarih: string
  saat: string | null
  tumGun: boolean
  // An invite from them I haven't answered yet.
  yanitBekliyor: boolean
}

const sirala = (a: OrtakPlan, b: OrtakPlan) =>
  `${a.tarih}${a.saat ?? '99'}`.localeCompare(`${b.tarih}${b.saat ?? '99'}`)

// Plans in my calendar we're both in (an invite either way, or their plan
// link), soonest first.
function takvimdekiOrtakPlanlar(kisiId: string): Promise<OrtakPlan[]> {
  const bugun = localDateString()
  return db.kayitlar
    .filter(
      (k) =>
        (k.arkadasId === kisiId || k.linkSahibi === kisiId) &&
        k.durum === 'bekliyor' &&
        !!k.tarih &&
        k.tarih >= bugun,
    )
    .toArray()
    .then((liste) =>
      liste.map((k) => ({
        id: k.id,
        baslik: goruntulemeBasligi(k),
        emoji: k.emoji ?? null,
        tarih: k.tarih!,
        saat: k.saat,
        tumGun: k.tumGun === true,
        yanitBekliyor: false,
      })),
    )
}

// Their invites still waiting for my answer (not in my calendar yet).
async function bekleyenDavetleri(kisiId: string): Promise<OrtakPlan[]> {
  const bugun = localDateString()
  const { gelen } = await davetleriGetir()
  return gelen
    .filter((d) => d.gonderen_id === kisiId && d.durum === 'bekliyor' && d.tarih >= bugun)
    .map((d) => ({
      id: d.id,
      baslik: d.baslik,
      emoji: d.emoji,
      tarih: d.tarih,
      saat: d.saat,
      tumGun: d.tum_gun,
      yanitBekliyor: true,
    }))
}

function Birlikte({
  arkadas,
  onGrupAc,
  arkadaslikId,
  onCikarildi,
}: Pick<Props, 'arkadas' | 'onGrupAc' | 'arkadaslikId' | 'onCikarildi'>) {
  const takvimde = useLiveQuery(() => takvimdekiOrtakPlanlar(arkadas.id), [arkadas.id])
  const [bekleyen, setBekleyen] = useState<OrtakPlan[]>([])
  const [gruplar, setGruplar] = useState<Grup[] | null>(null)
  const surum = useSosyalSurum()

  useEffect(() => {
    let iptal = false
    ortakGruplar(arkadas.id)
      .then((g) => !iptal && setGruplar(g))
      .catch(() => !iptal && setGruplar([]))
    bekleyenDavetleri(arkadas.id)
      .then((d) => !iptal && setBekleyen(d))
      .catch(() => {})
    return () => {
      iptal = true
    }
  }, [arkadas.id, surum])

  const planlar = takvimde && [...bekleyen, ...takvimde].sort(sirala)

  return (
    <div className="px-5 pt-1 pb-8 space-y-6">
      <Bolum baslik="Yaklaşan planlarınız">
        {planlar === undefined ? (
          <div className="skeleton h-16 rounded-2xl" />
        ) : planlar.length === 0 ? (
          <p className="card p-4 text-sm text-ink-400">
            Henüz birlikte bir planınız yok. “Plan yap” ile ilkini kurabilirsin.
          </p>
        ) : (
          <div className="space-y-2">
            {planlar.map((p) => (
              <div key={p.id} className="card p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orchid-50 flex items-center justify-center shrink-0">
                  {p.emoji ? (
                    <span className="text-lg" aria-hidden="true">
                      {p.emoji}
                    </span>
                  ) : (
                    <Icon name="CalendarDays" className="w-5 h-5 text-orchid-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-700 truncate">{p.baslik}</p>
                  <p className="text-xs text-ink-400 truncate">
                    {[formatDate(p.tarih), formatPlanTime(p.saat, p.tumGun)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {p.yanitBekliyor && (
                  <span className="chip text-[11px] py-1 bg-amber-100 text-amber-700 shrink-0">Yanıtını bekliyor</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Bolum>

      <Bolum baslik="Ortak gruplar">
        {gruplar === null ? (
          <div className="skeleton h-16 rounded-2xl" />
        ) : gruplar.length === 0 ? (
          <p className="card p-4 text-sm text-ink-400">Ortak bir grubunuz yok.</p>
        ) : (
          <div className="space-y-2">
            {gruplar.map((g) => (
              <button
                key={g.id}
                onClick={() => onGrupAc?.(g)}
                disabled={!onGrupAc}
                className="card p-3 w-full flex items-center gap-3 text-left active:opacity-80 transition-transform disabled:active:opacity-100"
              >
                <GrupAvatari grup={g} boyut="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-700 truncate">{g.ad}</p>
                  {g.aciklama && <p className="text-xs text-ink-400 truncate">{g.aciklama}</p>}
                </div>
                {onGrupAc && <Icon name="ChevronRight" className="w-4 h-4 text-ink-400 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </Bolum>

      {arkadaslikId && <ArkadasliktanCik ad={arkadas.ad} arkadaslikId={arkadaslikId} onCikarildi={onCikarildi} />}
    </div>
  )
}

function ArkadasliktanCik({
  ad,
  arkadaslikId,
  onCikarildi,
}: {
  ad: string
  arkadaslikId: string
  onCikarildi?: () => void | Promise<void>
}) {
  const [onay, setOnay] = useState(false)
  const [calisiyor, setCalisiyor] = useState(false)

  if (!onay) {
    return (
      <button
        onClick={() => setOnay(true)}
        className="w-full flex items-center justify-center gap-2 text-sm font-medium text-ink-400 py-2 active:opacity-80 transition-transform"
      >
        <Icon name="UserMinus" className="w-4 h-4" />
        Arkadaşlıktan çıkar
      </button>
    )
  }
  return (
    <div className="card p-4 text-center">
      <p className="text-sm text-ink-500 mb-3">
        {ad} artık müsaitliğini ve paylaştıklarını göremeyecek. Emin misin?
      </p>
      <div className="flex gap-2">
        <button onClick={() => setOnay(false)} className="btn-ghost flex-1 border border-ink-100 text-sm py-2.5">
          Vazgeç
        </button>
        <button
          onClick={async () => {
            setCalisiyor(true)
            try {
              await arkadasliktanCik(arkadaslikId)
              await onCikarildi?.()
            } finally {
              setCalisiyor(false)
            }
          }}
          disabled={calisiyor}
          className="flex-1 rounded-2xl bg-rose-50 text-rose-600 font-semibold text-sm py-2.5 active:opacity-80 transition-all disabled:opacity-60"
        >
          {calisiyor ? '...' : 'Çıkar'}
        </button>
      </div>
    </div>
  )
}

function Bolum({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2 px-1">{baslik}</h3>
      {children}
    </section>
  )
}
