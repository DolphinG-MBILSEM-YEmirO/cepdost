import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Icon } from './Icon'
import { db, type Kayit } from '../db'
import { CATEGORY_LABELS, CATEGORY_MARK_COLORS, CATEGORIES, parseLocalDate } from '../lib/format'
import { UZUN_ARA_GUN, neKadarOnce, ortakGecmis, planOzeti, type OrtakGecmis } from '../lib/planIstatistikleri'
import { goreceGun } from '../lib/takvimIzgarasi'
import { useBugun } from '../hooks/useBugun'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { arkadasPlandaMi } from '../sosyal/ortakGecmis'

// The numbers on the profile pages: my month and habits on mine, what we've
// done together on a friend's.

function Kutucuk({ deger, etiket, alt }: { deger: React.ReactNode; etiket: string; alt?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-mist-100/70 px-3 py-3 text-center min-w-0">
      <p className="font-display text-2xl font-bold text-ink-700 leading-none">{deger}</p>
      <p className="text-xs text-ink-500 mt-1.5">{etiket}</p>
      {alt && <p className="text-[11px] text-ink-400 mt-0.5 truncate">{alt}</p>}
    </div>
  )
}

function Baslik({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">{children}</h3>
}

// This month's plans by category: one bar split in the categories' fixed
// order (so neighbours keep apart in colour), with a labelled count for each.
function KategoriPayi({ kategoriler, toplam }: { kategoriler: ReturnType<typeof planOzeti>['kategoriler']; toplam: number }) {
  const sirali = CATEGORIES.flatMap((c) => kategoriler.filter((k) => k.kategori === c))
  const aciklama = sirali.map((k) => `${CATEGORY_LABELS[k.kategori]} ${k.sayi}`).join(', ')
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 rounded-full overflow-hidden" role="img" aria-label={`Bu ayın ${toplam} planı: ${aciklama}`}>
        {sirali.map((k) => (
          <span key={k.kategori} className={CATEGORY_MARK_COLORS[k.kategori]} style={{ flexGrow: k.sayi }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-2" aria-hidden="true">
        {sirali.map((k) => (
          <li key={k.kategori} className="flex items-center gap-1.5 text-xs text-ink-500">
            <span className={`w-2 h-2 rounded-full ${CATEGORY_MARK_COLORS[k.kategori]}`} />
            {CATEGORY_LABELS[k.kategori]}
            <span className="text-ink-400">{k.sayi}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PlanOzetiKarti({ kayitlar }: { kayitlar: Kayit[] }) {
  const bugun = useBugun()
  const ozet = useMemo(() => planOzeti(kayitlar, bugun), [kayitlar, bugun])
  const ayAdi = parseLocalDate(bugun).toLocaleDateString('tr-TR', { month: 'long' })
  const hicTarihliYok = !kayitlar.some((k) => k.tarih)

  return (
    <section className="card p-5" aria-label="Planların">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="Sparkles" className="w-4 h-4 text-orchid-500" />
        <h2 className="text-sm font-semibold text-ink-600">Planların</h2>
        <span className="ml-auto text-xs text-ink-400 capitalize">{ayAdi}</span>
      </div>

      {hicTarihliYok ? (
        <p className="text-sm text-ink-400">
          Plan yaptıkça burada ayın özeti, kaç haftadır plan yaptığın, en çok kiminle ve nereye gittiğin çıkacak.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            <Kutucuk
              deger={ozet.buAy}
              etiket="bu ay plan"
              alt={`geçen ay ${ozet.gecenAy}`}
            />
            <Kutucuk deger={ozet.buAyYapilan} etiket="yapıldı" alt={ozet.buAy > 0 ? `${ozet.buAy} plandan` : undefined} />
            <Kutucuk
              deger={
                <span className="inline-flex items-center gap-1">
                  {ozet.seri}
                  {ozet.seri >= 2 && <Icon name="Flame" className="w-5 h-5 text-amber-500" />}
                </span>
              }
              etiket="haftalık seri"
              alt={ozet.seri === 0 ? 'bu hafta bir plan yap' : undefined}
            />
          </div>

          {ozet.kategoriler.length > 0 && <KategoriPayi kategoriler={ozet.kategoriler} toplam={ozet.buAy} />}

          {ozet.kisiler.length > 0 && (
            <div>
              <Baslik>En çok kiminle</Baslik>
              <ul className="space-y-2">
                {ozet.kisiler.map((k) => (
                  <li key={`${k.tur}:${k.id}`} className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-orchid-100 text-orchid-600 flex items-center justify-center text-sm font-semibold shrink-0">
                      {k.tur === 'grup' ? <Icon name="Users" className="w-4 h-4" /> : k.ad.slice(0, 1).toLocaleUpperCase('tr-TR')}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-medium text-ink-700 truncate">{k.ad}</span>
                    <span className="text-xs text-ink-400 shrink-0">{k.sayi} plan</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ozet.yerler.length > 0 && (
            <div>
              <Baslik>En çok nereye</Baslik>
              <ul className="space-y-2">
                {ozet.yerler.map((y) => (
                  <li key={y.ad} className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                      <Icon name="MapPin" className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-medium text-ink-700 truncate">{y.ad}</span>
                    <span className="text-xs text-ink-400 shrink-0">{y.sayi} kez</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-ink-300">Planlarından hesaplanır, yalnızca sen görürsün.</p>
        </div>
      )}
    </section>
  )
}

// What a friend and I have done together, under their name on their
// profile. Nothing shows until there's a plan to count.
export function OrtakGecmisSatiri({ arkadasId }: { arkadasId: string }) {
  const bugun = useBugun()
  const surum = useSosyalSurum()
  const kayitlar = useLiveQuery(() => db.kayitlar.toArray(), [])
  const [gecmis, setGecmis] = useState<OrtakGecmis | null>(null)

  useEffect(() => {
    if (!kayitlar) return
    let iptal = false
    arkadasPlandaMi(arkadasId, kayitlar)
      .then((birlikte) => !iptal && setGecmis(ortakGecmis(kayitlar, birlikte, bugun)))
      .catch(() => !iptal && setGecmis(null))
    return () => {
      iptal = true
    }
  }, [arkadasId, kayitlar, bugun, surum])

  if (!gecmis || gecmis.toplam === 0) return null
  const uzunAra = gecmis.sonBulusma && gecmis.sonBulusma.gunOnce >= UZUN_ARA_GUN && !gecmis.siradaki

  return (
    <section className="mt-5 max-w-sm mx-auto" aria-label="Ortak geçmiş">
      <div className="grid grid-cols-3 divide-x divide-ink-100 rounded-2xl bg-mist-50/80 border border-ink-100/70 py-3">
        <div className="px-2">
          <p className="font-display text-lg font-bold text-ink-700 leading-tight">{gecmis.toplam}</p>
          <p className="text-[11px] text-ink-400">birlikte plan</p>
        </div>
        <div className="px-2 min-w-0">
          <p className="text-sm font-semibold text-ink-700 leading-tight truncate mt-0.5">
            {gecmis.sonBulusma ? neKadarOnce(gecmis.sonBulusma.gunOnce) : 'Henüz yok'}
          </p>
          <p className="text-[11px] text-ink-400 mt-1">son buluşma</p>
        </div>
        <div className="px-2 min-w-0">
          <p className="text-sm font-semibold text-ink-700 leading-tight truncate mt-0.5">
            {gecmis.siradaki ? goreceGun(gecmis.siradaki.tarih, bugun) : 'Plan yok'}
          </p>
          <p className="text-[11px] text-ink-400 mt-1">sıradaki</p>
        </div>
      </div>
      {gecmis.sonBulusma && (
        <p className="text-xs text-ink-400 mt-2 truncate">
          Son: {gecmis.sonBulusma.baslik}
          {gecmis.enSikYer && ` · En sık: ${gecmis.enSikYer}`}
        </p>
      )}
      {uzunAra && <p className="text-xs font-medium text-amber-700 mt-1">Uzun zamandır görüşmediniz, bir plan yapın mı?</p>}
    </section>
  )
}
