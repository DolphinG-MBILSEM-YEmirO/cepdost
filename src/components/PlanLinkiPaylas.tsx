import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'
import { Katilimcilar } from './PlanLinkiEkrani'
import { goruntulemeBasligi, type Kayit } from '../db'
import { formatDate, formatPlanTime } from '../lib/format'
import { paylasVeyaKopyala } from '../lib/paylas'
import { motor } from '../sosyal/cekirdek'
import { benimLinkim, linkAdresi, linkiOku, planiLinklePaylas, type LinkKatilimcisi } from '../sosyal/planLinki'

// The host's side of plan links: sharing a plan as a link, and seeing who
// answered through it.

function paylasimMetni(kayit: Kayit): string {
  const ne = [kayit.emoji, goruntulemeBasligi(kayit)].filter(Boolean).join(' ')
  const zaman = [formatDate(kayit.tarih), formatPlanTime(kayit.saat, kayit.tumGun)].filter(Boolean).join(', ')
  return `${ne}${zaman ? ` · ${zaman}` : ''}. Geliyor musun?`
}

async function linkiPaylas(kayit: Kayit): Promise<'paylasildi' | 'kopyalandi' | 'vazgecildi'> {
  const url = await planiLinklePaylas(kayit)
  return paylasVeyaKopyala({ baslik: goruntulemeBasligi(kayit), metin: paylasimMetni(kayit), url })
}

// Top of "Kiminle paylaşalım?": the link works for anyone, app or not.
export function LinkSatiri({ kayit }: { kayit: Kayit }) {
  const [durum, setDurum] = useState<'bos' | 'calisiyor' | 'kopyalandi' | 'paylasildi'>('bos')
  const [hata, setHata] = useState<string | null>(null)

  async function paylas() {
    setDurum('calisiyor')
    setHata(null)
    try {
      const sonuc = await linkiPaylas(kayit)
      setDurum(sonuc === 'vazgecildi' ? 'bos' : sonuc)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Link oluşturulamadı')
      setDurum('bos')
    }
  }

  const alt =
    durum === 'kopyalandi'
      ? 'Link kopyalandı; istediğin yere yapıştır'
      : durum === 'paylasildi'
        ? 'Paylaşıldı; yanıtlar planın sayfasında görünecek'
        : 'Uygulaması olmayanlar da görüp yanıt verebilir'

  return (
    <div className="mb-3">
      <button
        onClick={() => void paylas()}
        disabled={durum === 'calisiyor'}
        className="w-full flex items-center gap-3 rounded-2xl p-2.5 text-left bg-orchid-50/60 hover:bg-orchid-50 active:scale-[0.98] transition-all disabled:opacity-60"
      >
        <span className="w-10 h-10 rounded-xl bg-gradient-orchid flex items-center justify-center shrink-0">
          <Icon name="Link2" className="w-5 h-5 text-white" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-700">Link olarak paylaş</p>
          <p className="text-xs text-ink-400">{alt}</p>
        </div>
        <Icon
          name={durum === 'calisiyor' ? 'Loader2' : durum === 'bos' ? 'Share2' : 'Check'}
          className={`w-4 h-4 shrink-0 ${durum === 'calisiyor' ? 'animate-spin text-ink-300' : 'text-orchid-500'}`}
        />
      </button>
      {hata && <p className="text-xs text-rose-600 mt-2 px-1">{hata}</p>}
    </div>
  )
}

// On the plan's page, once it has a link: who answered, and the link again.
export function LinkYanitlari({ kayit }: { kayit: Kayit }) {
  const [katilimcilar, setKatilimcilar] = useState<LinkKatilimcisi[] | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [kopyalandi, setKopyalandi] = useState(false)

  const oku = useCallback(async () => {
    const link = benimLinkim(kayit)
    if (!link) return
    try {
      setKatilimcilar((await linkiOku(motor(), link)).katilimcilar)
      setHata(null)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Yanıtlar alınamadı')
    }
  }, [kayit])

  useEffect(() => {
    void oku()
  }, [oku])

  async function paylas() {
    setHata(null)
    try {
      if ((await linkiPaylas(kayit)) === 'kopyalandi') {
        setKopyalandi(true)
        setTimeout(() => setKopyalandi(false), 2000)
      }
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Paylaşılamadı')
    }
  }

  async function kopyala() {
    const link = benimLinkim(kayit)
    if (!link) return
    try {
      await navigator.clipboard.writeText(linkAdresi(link))
      setKopyalandi(true)
      setTimeout(() => setKopyalandi(false), 2000)
    } catch {
      setHata('Kopyalanamadı.')
    }
  }

  return (
    <div className="mb-3 space-y-2">
      {katilimcilar ? (
        <Katilimcilar sahipAdi="Sen" katilimcilar={katilimcilar} />
      ) : (
        !hata && <div className="skeleton h-24 rounded-3xl" />
      )}
      <div className="flex gap-2">
        <button
          onClick={() => void paylas()}
          className="flex-1 bg-orchid-50 text-orchid-700 font-medium rounded-2xl px-4 py-3 flex items-center justify-center gap-2 active:scale-[0.97] transition-all hover:bg-orchid-100"
        >
          <Icon name="Share2" className="w-4 h-4" />
          Linki paylaş
        </button>
        <button
          onClick={() => void kopyala()}
          aria-label="Linki kopyala"
          className="w-12 rounded-2xl bg-mist-100 border border-ink-100 flex items-center justify-center active:scale-95 transition-transform"
        >
          <Icon name={kopyalandi ? 'Check' : 'Copy'} className={`w-4 h-4 ${kopyalandi ? 'text-teal-600' : 'text-ink-400'}`} />
        </button>
      </div>
      {hata && <p className="text-xs text-rose-600 px-1">{hata}</p>}
    </div>
  )
}
