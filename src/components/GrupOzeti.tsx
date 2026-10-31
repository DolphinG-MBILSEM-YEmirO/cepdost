import { useCallback, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { AniGorseli } from './AniGorseli'
import { AniPenceresi } from './AniPenceresi'
import { useArsivAnilari } from './useArsivAnilari'
import type { Grup, GrupPlani, GrupUyesi, PlanYaniti } from '../sosyal/gruplar'
import type { Profil } from '../sosyal/api'
import { adListesi } from '../sosyal/adlar'
import { grupOzeti } from '../lib/grupOzeti'
import { formatPlanTime, localDateString } from '../lib/format'
import { goreceGun, gunFarki } from '../lib/takvimIzgarasi'
import { neKadarOnce } from '../lib/planIstatistikleri'
import { UYGULAMA_ADI } from '../../shared/marka'

// The top of a group's page: who's in it, the next plan and who's coming,
// the last memory, and what the group has done together. Each part opens
// what it's about.

// Faces shown before the names say the rest.
const YUZ_SAYISI = 5

interface Props {
  grup: Grup
  benimId: string
  uyeler: GrupUyesi[]
  planlar: GrupPlani[]
  yanitlar: PlanYaniti[]
  onPlanAc: (plan: GrupPlani) => void
  onUyeler: () => void
}

export function GrupOzetKarti({ grup, benimId, uyeler, planlar, yanitlar, onPlanAc, onUyeler }: Props) {
  const { arsiv } = useArsivAnilari(grup.id)
  const [acikAniId, setAcikAniId] = useState<string | null>(null)
  const kapat = useCallback(() => setAcikAniId(null), [])
  const bugun = localDateString()
  const ozet = useMemo(() => grupOzeti(planlar, arsiv?.anilar ?? [], bugun), [planlar, arsiv, bugun])

  // Admins first, then by name, me last: "Ali, Can ve Sen".
  const sirali = [...uyeler].sort(
    (x, y) =>
      Number(x.kullanici_id === benimId) - Number(y.kullanici_id === benimId) ||
      Number(y.rol === 'yonetici') - Number(x.rol === 'yonetici') ||
      (x.profil?.ad ?? '').localeCompare(y.profil?.ad ?? '', 'tr'),
  )
  const uyeProfilleri = new Map<string, Profil>(uyeler.flatMap((u) => (u.profil ? [[u.kullanici_id, u.profil] as const] : [])))
  const uyeAdlari = adListesi(sirali.map((u) => u.kullanici_id), uyeProfilleri, benimId)

  const { siradaki, sonAni } = ozet
  const siradakiYanitlar = siradaki ? yanitlar.filter((y) => y.plan_id === siradaki.id) : []
  const gelenSayisi = siradakiYanitlar.filter((y) => y.durum === 'geliyorum').length
  const yanitimVar = siradakiYanitlar.some((y) => y.kullanici_id === benimId)
  const sonAniSahibi = sonAni
    ? sonAni.sahip_id === benimId
      ? 'Sen'
      : (arsiv?.profiller.get(sonAni.sahip_id)?.ad ?? uyeProfilleri.get(sonAni.sahip_id)?.ad ?? 'Bir üye')
    : null
  const birlikte = [
    ozet.gecmisPlan > 0 && `Birlikte ${ozet.gecmisPlan} plan`,
    ozet.aniSayisi > 0 && `${ozet.aniSayisi} anı`,
    ozet.enSikYer && `En sık: ${ozet.enSikYer}`,
  ].filter(Boolean)

  return (
    <>
      <section className="card p-4" aria-label="Grup özeti">
        <button onClick={onUyeler} aria-label={`Üyeler: ${uyeAdlari}`} className="w-full flex items-center gap-3 text-left active:opacity-80 transition-transform">
          <div className="flex -space-x-2 shrink-0" aria-hidden="true">
            {sirali.slice(0, YUZ_SAYISI).map((u) => (
              <div key={u.kullanici_id} className="rounded-2xl ring-2 ring-white">
                <Avatar
                  ad={u.profil?.ad ?? `${UYGULAMA_ADI} kullanıcısı`}
                  foto={u.profil?.avatar}
                  emoji={u.profil?.emoji}
                  renk={u.profil?.renk}
                  boyut="sm"
                />
              </div>
            ))}
          </div>
          <p className="flex-1 min-w-0 text-xs text-ink-500 line-clamp-2">{uyeAdlari}</p>
          <Icon name="ChevronRight" className="w-4 h-4 text-ink-400 shrink-0" />
        </button>

        <div className="mt-3 pt-3 border-t border-ink-100">
          {siradaki ? (
            <button onClick={() => onPlanAc(siradaki)} className="w-full flex items-center gap-3 text-left active:opacity-80 transition-transform">
              <div className="w-11 h-11 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center text-xl shrink-0">
                {siradaki.emoji ?? <Icon name="CalendarClock" className="w-5 h-5 text-bolum-koyu" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-label text-ink-500">Sıradaki plan</p>
                <p className="text-sm font-semibold text-ink-700 truncate">{siradaki.baslik}</p>
                <p className="text-xs text-ink-500 truncate">
                  {[goreceGun(siradaki.tarih, bugun), formatPlanTime(siradaki.saat, siradaki.tum_gun), siradaki.konum].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs mt-0.5">
                  <span className="text-teal-700">{gelenSayisi > 0 ? `${gelenSayisi} kişi geliyor` : 'Henüz gelen yok'}</span>
                  {!yanitimVar && <span className="text-amber-700"> · Yanıtın bekleniyor</span>}
                </p>
              </div>
              <Icon name="ChevronRight" className="w-4 h-4 text-ink-400 shrink-0" />
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-mist-100 flex items-center justify-center shrink-0">
                <Icon name="CalendarClock" className="w-5 h-5 text-ink-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-600">Sıradaki plan yok</p>
                <p className="text-xs text-ink-400">Aşağıdan herkese uyan bir saat bulabilirsiniz.</p>
              </div>
            </div>
          )}
        </div>

        {sonAni && (
          <div className="mt-3 pt-3 border-t border-ink-100">
            <button onClick={() => setAcikAniId(sonAni.id)} className="w-full flex items-center gap-3 text-left active:opacity-80 transition-transform">
              <div className="w-11 h-11 rounded-2xl overflow-hidden bg-mist-100 shrink-0">
                <AniGorseli ani={sonAni} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-label text-ink-500">Son anı</p>
                <p className="text-sm font-semibold text-ink-700 truncate">{sonAni.mekan_adi}</p>
                <p className="text-xs text-ink-500 truncate">
                  {sonAniSahibi} · {neKadarOnce(gunFarki(sonAni.tarih, bugun))}
                </p>
              </div>
              <Icon name="ChevronRight" className="w-4 h-4 text-ink-400 shrink-0" />
            </button>
          </div>
        )}

        {birlikte.length > 0 && <p className="mt-3 pt-3 border-t border-ink-100 text-xs text-ink-400">{birlikte.join(' · ')}</p>}
      </section>

      {acikAniId && arsiv && (
        <AniPenceresi
          anilar={arsiv.anilar}
          baslangicId={acikAniId}
          baslik={grup.ad}
          etkilesimler={arsiv.etkilesimler}
          profiller={arsiv.profiller}
          benimId={benimId}
          onKapat={kapat}
        />
      )}
    </>
  )
}
