import { useState } from 'react'
import { Icon } from './Icon'
import { useLooppoint } from '../sosyal/looppoint'
import { NEDEN_METINLERI, PUANLAR, SEVIYELER, LOOPPOINT_ADI } from '../../shared/looppoint'

// The person's LoopPoint on their profile: balance, level, what earned
// them and how to earn more. Points are written only by the server when a
// business's till scans the person's QR (shared/looppoint.ts).

const GOSTERILEN = 5

export function LooppointKarti() {
  const { ozet, hareketler, yukleniyor } = useLooppoint()
  const [tumu, setTumu] = useState(false)
  const sonraki = ozet.sonrakiSeviye
  const onceki = [...SEVIYELER].reverse().find((s) => s.esik <= ozet.kazanilan)?.esik ?? 0
  const ilerleme = sonraki ? Math.min(1, (ozet.kazanilan - onceki) / (sonraki.esik - onceki)) : 1
  const liste = tumu ? hareketler : hareketler.slice(0, GOSTERILEN)

  return (
    <section className="card p-5" aria-label={LOOPPOINT_ADI}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
            <Icon name="Star" className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-ink-700 leading-tight">{LOOPPOINT_ADI}</h2>
            <p className="text-xs text-ink-400">{ozet.seviye} seviye</p>
          </div>
        </div>
        <p className="text-[1.625rem] leading-8 font-extrabold text-amber-600 tabular-nums">
          {yukleniyor && hareketler.length === 0 ? '…' : ozet.bakiye}
        </p>
      </div>

      <div className="mt-4">
        <div className="h-2 rounded-full bg-amber-100 overflow-hidden">
          <div className="h-full rounded-full bg-amber-400 transition-[width] duration-700" style={{ width: `${Math.round(ilerleme * 100)}%` }} />
        </div>
        <p className="text-xs text-ink-400 mt-1.5">
          {sonraki
            ? `${sonraki.ad} seviye için ${sonraki.esik - ozet.kazanilan} ${LOOPPOINT_ADI} daha. Üst seviyeleri işletmeler kasada görür, öncelik tanıyabilir.`
            : 'En üst seviyedesin. İşletmeler bunu kasada görür.'}
        </p>
      </div>

      {hareketler.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-mist-100 p-4 text-sm text-ink-500 space-y-1.5">
          <p className="font-semibold text-ink-600">Nasıl kazanılır?</p>
          <p>Akış'taki "Yakınında"dan bir mekana git, kasada Sharloop QR'ını okut: +{PUANLAR.ziyaret}.</p>
          <p>Sponsorlu mekanlarda +{PUANLAR.oneCikan}, plan yapıp gidersen +{PUANLAR.plan} daha.</p>
          <p>Arkadaşlarınla aynı plana gelirseniz her birinize +{PUANLAR.grup}.</p>
          <p>Biriktirdiklerini mekanların ödüllerine harca: ikram, indirim, rezervasyon önceliği.</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-ink-100">
          {liste.map((h, i) => (
            <li key={`${h.gun}-${h.isletme}-${h.tur}-${i}`} className="py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-700 truncate">{h.isletmeAdi ?? 'Bir işletme'}</p>
                <p className="text-xs text-ink-400 truncate">
                  {h.tur === 'harcama' ? `Ödül: ${h.odul ?? ''}` : h.nedenler.map((n) => NEDEN_METINLERI[n]).join(' · ')}
                  {' · '}
                  {new Date(`${h.gun}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <span className={`text-sm font-bold tabular-nums ${h.tur === 'harcama' ? 'text-ink-400' : 'text-amber-600'}`}>
                {h.tur === 'harcama' ? '−' : '+'}
                {h.puan}
              </span>
            </li>
          ))}
        </ul>
      )}
      {hareketler.length > GOSTERILEN && (
        <button onClick={() => setTumu((t) => !t)} className="text-sm font-semibold text-bolum-koyu mt-2">
          {tumu ? 'Daha az göster' : `Tümünü göster (${hareketler.length})`}
        </button>
      )}
    </section>
  )
}
