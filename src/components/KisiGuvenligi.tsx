import { useState } from 'react'
import { Icon } from './Icon'
import { ConfirmDialog } from './ConfirmDialog'
import { SikayetSayfasi } from './SikayetSayfasi'
import { engelle } from '../sosyal/api'

interface KisiGuvenligiProps {
  kisi: { id: string; ad: string; kullaniciAdi?: string | null }
  // The person is blocked: the screen showing them should close.
  onEngellendi?: () => void
}

// "Report" and "Block" for a person, under their profile or group card.
export function KisiGuvenligi({ kisi, onEngellendi }: KisiGuvenligiProps) {
  const [sikayetAcik, setSikayetAcik] = useState(false)
  const [engelOnay, setEngelOnay] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  async function engelleVeKapat() {
    setEngelOnay(false)
    setHata(null)
    try {
      await engelle(kisi.id)
      onEngellendi?.()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Engellenemedi, tekrar dener misin?')
    }
  }

  return (
    <div>
      <div className="flex justify-center gap-4">
        <button
          type="button"
          onClick={() => setSikayetAcik(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-400 hover:text-rose-600 py-2 transition-colors"
        >
          <Icon name="Flag" className="w-3.5 h-3.5" />
          Şikâyet et
        </button>
        <button
          type="button"
          onClick={() => setEngelOnay(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-400 hover:text-rose-600 py-2 transition-colors"
        >
          <Icon name="Ban" className="w-3.5 h-3.5" />
          Engelle
        </button>
      </div>
      {hata && <p className="text-xs text-rose-600 text-center">{hata}</p>}

      {sikayetAcik && (
        <SikayetSayfasi
          hedef={{ tur: 'kisi', kisiId: kisi.id, ad: kisi.ad, kullaniciAdi: kisi.kullaniciAdi ?? null }}
          onKapat={() => setSikayetAcik(false)}
          onEngellendi={onEngellendi}
        />
      )}
      {engelOnay && (
        <ConfirmDialog
          title={`${kisi.ad} engellensin mi?`}
          message="Mesajlarını, anılarını ve arkadaşlık isteklerini artık görmezsin; arkadaşsanız arkadaşlığınız biter. Kişiye bildirilmez."
          confirmLabel="Engelle"
          onConfirm={() => void engelleVeKapat()}
          onCancel={() => setEngelOnay(false)}
        />
      )}
    </div>
  )
}
