import { useState } from 'react'
import { Icon } from './Icon'
import { kayitOlustur, type Kategori } from '../db'
import { siniflandirOnizleme, type SiniflandirmaSonucu } from '../classify'
import { CATEGORIES, CATEGORY_ICON_NAME, CATEGORY_LABELS } from '../lib/format'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'

// F22 — arşive elle link ekleme.
//
// "+" akışı plan oluşturmaya ayrıldığında (F19) manuel yakalama yolu tamamen
// kalkmıştı; link/görsel yalnızca telefonun paylaş menüsünden geliyordu.
// Masaüstünde ya da paylaş menüsünün olmadığı durumlarda bir link'i arşive
// koymanın yolu kalmıyordu — bu düğme o boşluğu kapatıyor.
//
// Bilinçli olarak SADECE link: görsel yolu ürün kararıyla kaldırıldı,
// ekran görüntüleri paylaş menüsünden zaten otomatik akıyor.

interface Props {
  onClose: () => void
  onEklendi: () => void
}

export function LinkEkleModal({ onClose, onEklendi }: Props) {
  useEscapeIleKapat(onClose)
  const [link, setLink] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [sonuc, setSonuc] = useState<SiniflandirmaSonucu | null>(null)

  const [baslik, setBaslik] = useState('')
  const [kategori, setKategori] = useState<Kategori>('not')
  const [tarih, setTarih] = useState('')
  const [saat, setSaat] = useState('')
  const [konum, setKonum] = useState('')

  function linkGecerliMi(deger: string): boolean {
    try {
      const u = new URL(deger.trim())
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
      return false
    }
  }

  async function analizEt() {
    const temiz = link.trim()
    if (!linkGecerliMi(temiz)) {
      setHata('Geçerli bir bağlantı yapıştır (https://... ile başlamalı).')
      return
    }
    setYukleniyor(true)
    setHata(null)
    try {
      const res = await siniflandirOnizleme({ hamLink: temiz })
      setSonuc(res)
      setBaslik(res.baslik ?? '')
      setKategori(res.kategori)
      setTarih(res.tarih ?? '')
      setSaat(res.saat ?? '')
      setKonum(res.konum ?? '')
    } catch (err) {
      // Sınıflandırma başarısız olsa da linki kaybettirmiyoruz: elle
      // doldurulabilir bir forma düşüyoruz.
      setHata(
        err instanceof Error
          ? `${err.message} — yine de elle kaydedebilirsin.`
          : 'Bağlantı okunamadı — yine de elle kaydedebilirsin.',
      )
      setSonuc({
        kategori: 'not',
        baslik: null,
        tarih: null,
        saat: null,
        konum: null,
        oncelik: 'orta',
        sure: null,
        ozetNot: null,
        mekanOnerisi: null,
        yakinOneriler: null,
      })
      // Clear everything a previous link may have filled in, or its date and
      // place would be saved with this one.
      setBaslik('')
      setKategori('not')
      setTarih('')
      setSaat('')
      setKonum('')
    } finally {
      setYukleniyor(false)
    }
  }

  async function kaydet() {
    if (!baslik.trim()) {
      setHata('Bir başlık yaz.')
      return
    }
    setYukleniyor(true)
    setHata(null)
    try {
      await kayitOlustur({
        kategori,
        baslik: baslik.trim(),
        tarih: tarih || null,
        saat: saat || null,
        konum: konum.trim() || null,
        oncelik: sonuc?.oncelik ?? 'orta',
        sure: sonuc?.sure ?? null,
        ozetNot: sonuc?.ozetNot ?? null,
        mekanOnerisi: sonuc?.mekanOnerisi ?? null,
        yakinOneriler: sonuc?.yakinOneriler ?? null,
        kaynakTipi: 'link',
        hamBaslik: '',
        hamMetin: '',
        hamLink: link.trim(),
        gorseller: [],
      })
      onEklendi()
      onClose()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setYukleniyor(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm mx-4 mb-4 sm:mb-0 p-5 animate-slide-up max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-orchid-100 flex items-center justify-center shrink-0">
            <Icon name="LinkIcon" className="w-5 h-5 text-orchid-500" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-ink-700">Link ekle</h3>
            <p className="text-xs text-ink-400">Arşivine kaydedeyim</p>
          </div>
        </div>

        {!sonuc ? (
          <>
            <textarea
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              rows={3}
              inputMode="url"
              autoFocus
              className="input-field resize-none mb-2"
            />
            <p className="text-xs text-ink-400 mb-4">
              Bağlantıyı okuyup başlık, kategori ve varsa tarihi çıkarayım.
            </p>
          </>
        ) : (
          <div className="space-y-4 mb-4">
            <div>
              <FieldLabel>Başlık</FieldLabel>
              <input
                value={baslik}
                onChange={(e) => setBaslik(e.target.value)}
                placeholder="Kayıt başlığı"
                className="input-field"
                autoFocus
              />
            </div>

            <div>
              <FieldLabel>Kategori</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setKategori(c)}
                    className={`chip ${
                      kategori === c
                        ? 'bg-gradient-orchid text-white'
                        : 'bg-mist-100 text-ink-500 border border-ink-100'
                    }`}
                  >
                    <Icon name={CATEGORY_ICON_NAME[c]} className="w-4 h-4" />
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Tarih</FieldLabel>
                <input
                  type="date"
                  value={tarih}
                  onChange={(e) => setTarih(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <FieldLabel>Saat</FieldLabel>
                <input
                  type="time"
                  value={saat}
                  onChange={(e) => setSaat(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>

            <div>
              <FieldLabel>Konum</FieldLabel>
              <input
                value={konum}
                onChange={(e) => setKonum(e.target.value)}
                placeholder="Opsiyonel"
                className="input-field"
              />
            </div>

            <p className="text-[11px] text-ink-300 break-all">{link.trim()}</p>
          </div>
        )}

        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mb-4">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={sonuc ? () => setSonuc(null) : onClose}
            disabled={yukleniyor}
            className="btn-ghost flex-1 border border-ink-100 disabled:opacity-50"
          >
            {sonuc ? 'Geri' : 'Vazgeç'}
          </button>
          <button
            onClick={() => void (sonuc ? kaydet() : analizEt())}
            disabled={yukleniyor}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Icon
              name={yukleniyor ? 'Loader2' : sonuc ? 'Check' : 'Sparkles'}
              className={`w-5 h-5 ${yukleniyor ? 'animate-spin' : ''}`}
            />
            {yukleniyor ? (sonuc ? 'Kaydediliyor' : 'Okuyorum') : sonuc ? 'Kaydet' : 'Anla'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
      {children}
    </label>
  )
}
