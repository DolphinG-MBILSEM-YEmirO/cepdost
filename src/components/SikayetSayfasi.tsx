import { useState } from 'react'
import { Icon } from './Icon'
import { useGeriIleKapat } from '../lib/geriTusu'
import { engelle } from '../sosyal/api'
import { sikayetGonder } from '../sosyal/sikayet'
import { SIKAYET_NEDENLERI, SIKAYET_SINIRLARI, type Sikayet, type SikayetNedeni } from '../../shared/sikayet'

interface SikayetSayfasiProps {
  hedef: Sikayet['hedef']
  onKapat: () => void
  // Called after the person was blocked here, so the screen can close the
  // chat or profile that no longer applies.
  onEngellendi?: () => void
}

const NEDENLER = Object.entries(SIKAYET_NEDENLERI) as Array<[SikayetNedeni, string]>

// Report sheet for a person, a message or a memory: a reason, an optional
// note, and blocking the person in the same step.
export function SikayetSayfasi({ hedef, onKapat, onEngellendi }: SikayetSayfasiProps) {
  useGeriIleKapat(onKapat)
  const [neden, setNeden] = useState<SikayetNedeni | null>(null)
  const [aciklama, setAciklama] = useState('')
  const [engelleDe, setEngelleDe] = useState(true)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [bitti, setBitti] = useState(false)

  const baslik = hedef.tur === 'kisi' ? 'Kişiyi şikâyet et' : hedef.tur === 'mesaj' ? 'Mesajı şikâyet et' : 'Anıyı şikâyet et'

  async function gonder() {
    if (!neden) return
    setGonderiliyor(true)
    setHata(null)
    try {
      await sikayetGonder(hedef, neden, aciklama)
      if (engelleDe) await engelle(hedef.kisiId)
      setBitti(true)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Şikâyet gönderilemedi.')
    } finally {
      setGonderiliyor(false)
    }
  }

  function kapat() {
    if (bitti && engelleDe) onEngellendi?.()
    onKapat()
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-ink-900/40 animate-fade-in" onClick={kapat}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={baslik}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-mist-50 rounded-t-3xl p-4 pb-[calc(1rem+var(--safe-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-ink-200 mx-auto mb-3" />
        {bitti ? (
          <div className="text-center py-4 px-2">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-3">
              <Icon name="Check" className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-ink-700 mb-1">Teşekkürler, bize ulaştı</h3>
            <p className="text-sm text-ink-400 mb-5">
              24 saat içinde inceleyeceğiz.
              {engelleDe && ' Bu kişiyi engelledin; mesajlarını ve paylaşımlarını artık görmeyeceksin.'}
            </p>
            <button type="button" onClick={kapat} className="btn-primary w-full">
              Tamam
            </button>
          </div>
        ) : (
          <>
            <h3 className="font-semibold text-ink-700 mb-1 px-1">{baslik}</h3>
            <p className="text-xs text-ink-400 mb-3 px-1">
              {hedef.tur === 'kisi'
                ? 'Neden şikâyet ettiğini seç.'
                : 'İçerik ve sebebi ekibimize gönderilir. Şikâyet ettiğin kişiye bildirilmez.'}
            </p>
            <div role="radiogroup" aria-label="Şikâyet sebebi" className="space-y-1.5 mb-3">
              {NEDENLER.map(([anahtar, ad]) => (
                <button
                  key={anahtar}
                  type="button"
                  role="radio"
                  aria-checked={neden === anahtar}
                  onClick={() => setNeden(anahtar)}
                  className={`w-full flex items-center justify-between rounded-2xl border px-3.5 py-2.5 text-sm text-left transition-colors ${
                    neden === anahtar ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-ink-100 bg-white/60 text-ink-700'
                  }`}
                >
                  {ad}
                  {neden === anahtar && <Icon name="Check" className="w-4 h-4" />}
                </button>
              ))}
            </div>
            <textarea
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value.slice(0, SIKAYET_SINIRLARI.aciklama))}
              placeholder="Eklemek istediğin bir şey var mı? (isteğe bağlı)"
              rows={3}
              className="input-field w-full mb-3 resize-none"
            />
            <label className="flex items-center gap-2.5 text-sm text-ink-600 px-1 mb-4">
              <input type="checkbox" checked={engelleDe} onChange={(e) => setEngelleDe(e.target.checked)} />
              {hedef.ad ? `${hedef.ad} adlı kişiyi engelle` : 'Bu kişiyi engelle'}
            </label>
            {hata && <p className="text-xs text-rose-600 mb-3 px-1">{hata}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={kapat} className="btn-ghost flex-1 border border-ink-100">
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void gonder()}
                disabled={!neden || gonderiliyor}
                className="flex-1 bg-rose-500 text-white font-semibold rounded-2xl px-4 py-3 disabled:opacity-50 active:opacity-80 transition-all"
              >
                {gonderiliyor ? 'Gönderiliyor…' : 'Gönder'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
