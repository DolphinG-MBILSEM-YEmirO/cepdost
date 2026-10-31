import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { KartBasligi } from './PlanAyrintilari'
import { motor, motorVarMi, useSosyalSurum } from '../sosyal/cekirdek'
import {
  GETIR_LISTE_AZAMI,
  GETIR_METIN_AZAMI,
  getirEkle,
  getirListesi,
  getirSil,
  getiriUstlen,
  type GetirMaddesi,
} from '../sosyal/getirListesi'
import { grupPlaniKatilimi } from '../sosyal/planKatilimi'

// A group plan's shared "who brings what" list: anyone in the group adds
// what's needed and says what they'll bring.

// Starting points for an empty list.
const ONERILER = ['İçecek', 'Atıştırmalık', 'Buz', 'Hoparlör']

function kimlerGetiriyor(madde: GetirMaddesi, benimId: string, adlar: Map<string, string>): string {
  if (madde.getirenler.length === 0) return 'Henüz kimse üstlenmedi'
  const isimler = madde.getirenler.map((id) => (id === benimId ? 'Sen' : (adlar.get(id) ?? 'Bir üye')))
  return `Getirecek: ${isimler.join(', ')}`
}

export function GetirListesiKarti({ planId, gecti = false }: { planId: string; gecti?: boolean }) {
  const surum = useSosyalSurum()
  const [maddeler, setMaddeler] = useState<GetirMaddesi[] | null>(null)
  const [adlar, setAdlar] = useState<Map<string, string>>(new Map())
  const [yeni, setYeni] = useState('')
  const [isleniyor, setIsleniyor] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const benimId = motorVarMi() ? motor().benimId : ''

  useEffect(() => {
    if (!motorVarMi()) return
    let iptal = false
    Promise.all([getirListesi(planId), grupPlaniKatilimi(planId)])
      .then(([liste, katilim]) => {
        if (iptal) return
        setMaddeler(liste)
        setAdlar(new Map((katilim?.katilimcilar ?? []).map((k) => [k.id, k.ad])))
      })
      .catch(() => !iptal && setMaddeler(null))
    return () => {
      iptal = true
    }
  }, [planId, surum])

  if (!maddeler) return null

  const sahipli = maddeler.filter((m) => m.getirenler.length > 0).length
  const dolu = maddeler.length >= GETIR_LISTE_AZAMI

  async function calistir(anahtar: string, is: () => Promise<unknown>) {
    setIsleniyor(anahtar)
    setHata(null)
    try {
      await is()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Olmadı, tekrar dener misin?')
    } finally {
      setIsleniyor(null)
    }
  }

  function ekle(metin: string) {
    if (!metin.trim()) return
    setYeni('')
    void calistir('ekle', () => getirEkle(planId, metin))
  }

  return (
    <section className="card p-5 mb-4" aria-label="Kim ne getiriyor">
      <KartBasligi
        ikon="ShoppingBag"
        baslik="Kim ne getiriyor"
        sag={
          maddeler.length > 0 && (
            <span className={`text-xs font-semibold ${sahipli === maddeler.length ? 'text-teal-600' : 'text-ink-400'}`}>
              {sahipli}/{maddeler.length} üstlenildi
            </span>
          )
        }
      />

      {maddeler.length > 0 && (
        <ul className="mb-3 divide-y divide-ink-100">
          {maddeler.map((m) => {
            const getiriyorum = m.getirenler.includes(benimId)
            return (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${m.getirenler.length ? 'bg-teal-400' : 'bg-amber-400'}`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-700 break-words">{m.metin}</p>
                  <p className="text-[11px] text-ink-400 leading-tight mt-0.5">{kimlerGetiriyor(m, benimId, adlar)}</p>
                </div>
                {!gecti && (
                  <button
                    onClick={() => void calistir(m.id, () => getiriUstlen(planId, m.id, !getiriyorum))}
                    disabled={isleniyor === m.id}
                    aria-pressed={getiriyorum}
                    aria-label={getiriyorum ? `${m.metin}: getirmekten vazgeç` : `${m.metin}: ben getiririm`}
                    className={`chip text-xs shrink-0 active:opacity-80 disabled:opacity-50 ${
                      getiriyorum ? 'bg-teal-100 text-teal-700' : 'bg-white text-ink-600 border border-ink-200'
                    }`}
                  >
                    <Icon name={getiriyorum ? 'Check' : 'Plus'} className="w-3.5 h-3.5" />
                    {getiriyorum ? 'Getiriyorum' : 'Ben getiririm'}
                  </button>
                )}
                {m.ekleyen === benimId && !gecti && (
                  <button
                    onClick={() => void calistir(`sil:${m.id}`, () => getirSil(planId, m.id))}
                    disabled={isleniyor === `sil:${m.id}`}
                    aria-label={`${m.metin} maddesini kaldır`}
                    className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-ink-200 hover:text-rose-500 hover:bg-rose-50 active:opacity-80 transition-all"
                  >
                    <Icon name="X" className="w-4 h-4" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {maddeler.length === 0 && (
        <p className="text-sm text-ink-400 mb-3">
          {gecti ? 'Bu plan için liste yapılmamış.' : 'Ne lazım olacak? Ekle, herkes üstlensin.'}
        </p>
      )}

      {!gecti && !dolu && (
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
            maxLength={GETIR_METIN_AZAMI}
            placeholder="Örn. buz, hoparlör"
            aria-label="Getirilecek şey"
            className="input-field flex-1 py-2.5"
          />
          <button
            type="submit"
            disabled={!yeni.trim() || isleniyor === 'ekle'}
            aria-label="Listeye ekle"
            className="w-11 shrink-0 rounded-2xl bg-brand-600 text-white flex items-center justify-center active:opacity-80 transition-transform disabled:opacity-40"
          >
            <Icon name={isleniyor === 'ekle' ? 'Loader2' : 'Plus'} className={`w-5 h-5 ${isleniyor === 'ekle' ? 'animate-spin' : ''}`} />
          </button>
        </form>
      )}

      {!gecti && maddeler.length === 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {ONERILER.map((o) => (
            <button key={o} onClick={() => ekle(o)} className="chip bg-white text-ink-600 border border-ink-200 active:opacity-80">
              <Icon name="Plus" className="w-3.5 h-3.5" />
              {o}
            </button>
          ))}
        </div>
      )}

      {hata && <p className="text-xs text-rose-600 mt-2 px-1">{hata}</p>}
      <p className="text-[11px] text-ink-400 mt-3">Gruptaki herkes görür, ekleyebilir ve üstlenebilir.</p>
    </section>
  )
}
