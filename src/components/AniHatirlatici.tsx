import { useMemo, useState } from 'react'
import { Icon } from './Icon'
import { AniEkleModal } from './AniArsivi'
import { kayitGuncelle, type Kayit } from '../db'
import { formatDate, toDateString } from '../lib/format'

// F20 — "plan tarihi geçtiğinde fotoğraf paylaş" çağrısı.
//
// Plan detayına girmeden de görünsün diye Planlar sekmesinin üstünde
// duruyor. Sadece BİRLİKTE yapılan (grup ya da arkadaş) ve tarihi geçmiş
// planlar için çıkıyor — tek başına bir plana "anı ekle" demek anlamsız,
// çünkü anının bir arşivi olmalı.

// Çok eski planlar için sormanın anlamı yok; iki hafta makul bir pencere.
const GERIYE_GUN = 14

export function AniHatirlatici({ kayitlar }: { kayitlar: Kayit[] }) {
  const [acik, setAcik] = useState<Kayit | null>(null)
  // Kullanıcı "şimdi değil" derse bu oturumda tekrar göstermiyoruz.
  const [gizlenen, setGizlenen] = useState<string[]>([])

  const adaylar = useMemo(() => {
    const bugun = toDateString(new Date())
    const alt = new Date()
    alt.setDate(alt.getDate() - GERIYE_GUN)
    const altStr = toDateString(alt)

    return kayitlar
      .filter(
        (k) =>
          !k.aniEklendi &&
          !gizlenen.includes(k.id) &&
          (!!k.grupId || !!k.arkadasId) &&
          !!k.tarih &&
          k.tarih < bugun &&
          k.tarih >= altStr,
      )
      .sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''))
      .slice(0, 3)
  }, [kayitlar, gizlenen])

  if (adaylar.length === 0) return null

  return (
    <>
      <div className="px-4 pb-3 space-y-2">
        {adaylar.map((k) => (
          <div key={k.id} className="card p-4 bg-brand-50/70 border-brand-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-ink-50 flex items-center justify-center shrink-0">
                <Icon name="Camera" className="w-5 h-5 text-ink-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink-700 truncate">
                  {k.baslik ?? 'Planın'} nasıl geçti?
                </p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {formatDate(k.tarih) ?? k.tarih}
                  {k.konum ? ` · ${k.konum}` : ''} — fotoğraf ekleyip{' '}
                  {k.grupAdi ?? k.arkadasAdi ?? 'arkadaşın'} arşivine bırak.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setGizlenen((e) => [...e, k.id])}
                    className="chip bg-white text-ink-600 border border-ink-200 text-xs"
                  >
                    Şimdi değil
                  </button>
                  <button onClick={() => setAcik(k)} className="chip bg-brand-600 text-white text-xs">
                    <Icon name="ImageIcon" className="w-4 h-4" />
                    Fotoğraf ekle
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {acik && (
        <AniEkleModal
          grupId={acik.grupId}
          arkadasId={acik.arkadasId}
          hedefAdi={acik.grupAdi ?? acik.arkadasAdi ?? 'arkadaşın'}
          baslangicMekan={acik.konum}
          baslangicTarih={acik.tarih}
          onClose={() => setAcik(null)}
          onEklendi={async () => {
            await kayitGuncelle(acik.id, { aniEklendi: true })
            setAcik(null)
          }}
        />
      )}
    </>
  )
}
