import { useState } from 'react'
import { Icon } from './Icon'
import { profilGuncelle, type Gizlilik, type Profil } from '../sosyal/api'

// Giriş yaptıktan sonraki ilk adım: isim + kullanıcı adı + hesap gizliliği.
// Kullanıcı adı boşsa bu ekran gösterilir, yani kurulumu tamamlamadan
// sosyal katmana geçilemiyor (Instagram/TikTok akışı).
//
// E-posta doğrulaması ayrıca istenmiyor: sihirli linke tıklamadan ya da
// Google ile giriş yapmadan buraya gelinemiyor — hesap zaten doğrulanmış
// oluyor.
interface Props {
  profil: Profil
  onTamamlandi: () => Promise<void>
}

export function HesapKurulumu({ profil, onTamamlandi }: Props) {
  const [ad, setAd] = useState(profil.ad)
  const [kullaniciAdi, setKullaniciAdi] = useState('')
  const [gizlilik, setGizlilik] = useState<Gizlilik>('arkadaslar')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  // Sunucudaki CHECK ile aynı kural — kullanıcıyı sunucuya gidip hata
  // almadan önce uyaralım. Nokta serbest ama başta/sonda ve arka arkaya
  // olamaz (taklit edilebilir adları önlemek için).
  const temizKullaniciAdi = kullaniciAdi.trim().toLocaleLowerCase('tr-TR').replace(/^@/, '')
  const kullaniciAdiGecerli =
    /^[a-z0-9_](\.?[a-z0-9_])*$/.test(temizKullaniciAdi) &&
    temizKullaniciAdi.length >= 3 &&
    temizKullaniciAdi.length <= 20

  async function kaydet() {
    if (!ad.trim()) {
      setHata('Adını yaz — arkadaşların seni bu isimle görecek.')
      return
    }
    if (!kullaniciAdiGecerli) {
      setHata('Kullanıcı adı 3-20 karakter olmalı; küçük harf, rakam, _ ve nokta kullanabilirsin.')
      return
    }
    setKaydediliyor(true)
    setHata(null)
    try {
      await profilGuncelle({ ad: ad.trim(), kullanici_adi: temizKullaniciAdi, gizlilik })
      await onTamamlandi()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
        <h1 className="font-display text-2xl font-bold text-ink-700">Hesabını kur</h1>
        <p className="text-sm text-ink-400 mt-0.5">Son bir adım kaldı</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24">
        <div className="card p-5 mb-4">
          <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
            Adın
          </label>
          <input
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            placeholder="Yunus Emir"
            className="input-field mb-4"
            autoFocus
          />

          <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
            Kullanıcı adın
          </label>
          <div className="flex items-center bg-cream-100 border border-ink-100/40 rounded-xl px-3 mb-2">
            <span className="text-ink-300">@</span>
            <input
              value={kullaniciAdi}
              onChange={(e) => setKullaniciAdi(e.target.value)}
              placeholder="yunus"
              autoCapitalize="none"
              autoCorrect="off"
              className="flex-1 bg-transparent py-2.5 px-1 text-ink-700 font-medium placeholder:text-ink-300 focus:outline-none"
            />
            {temizKullaniciAdi.length > 0 && (
              <Icon
                name={kullaniciAdiGecerli ? 'Check' : 'AlertCircle'}
                className={`w-4 h-4 ${kullaniciAdiGecerli ? 'text-teal-600' : 'text-amber-500'}`}
              />
            )}
          </div>
          <p className="text-xs text-ink-400">
            Arkadaşların seni bu adla bulabilir. Küçük harf, rakam, _ ve nokta kullanabilirsin.
          </p>
        </div>

        <div className="card p-5 mb-4">
          <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">
            Hesabın kime görünsün?
          </label>
          <div className="space-y-2">
            <GizlilikSecenegi
              secili={gizlilik === 'arkadaslar'}
              onSec={() => setGizlilik('arkadaslar')}
              baslik="Sadece arkadaşlarım"
              aciklama="Profilini ve paylaştığın fotoğrafları yalnızca eklediğin kişiler görür."
              ikon="ShieldCheck"
            />
            <GizlilikSecenegi
              secili={gizlilik === 'herkes'}
              onSec={() => setGizlilik('herkes')}
              baslik="Herkes"
              aciklama="Profilin CepDost'taki diğer kullanıcılara açık olur; istersen fotoğraflarını Keşfet'te paylaşabilirsin."
              ikon="Users"
            />
          </div>
          <p className="text-xs text-ink-300 mt-3">
            Bunu daha sonra Arkadaşlar sekmesinden değiştirebilirsin.
          </p>
        </div>

        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mb-4">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        <button
          onClick={() => void kaydet()}
          disabled={kaydediliyor}
          className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {kaydediliyor ? (
            <>
              <Icon name="Loader2" className="w-5 h-5 animate-spin" />
              Kaydediliyor...
            </>
          ) : (
            <>
              <Icon name="Check" className="w-5 h-5" />
              Devam et
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function GizlilikSecenegi({
  secili,
  onSec,
  baslik,
  aciklama,
  ikon,
}: {
  secili: boolean
  onSec: () => void
  baslik: string
  aciklama: string
  ikon: 'ShieldCheck' | 'Users'
}) {
  return (
    <button
      onClick={onSec}
      className={`w-full text-left rounded-2xl p-3.5 border transition-all active:scale-[0.98] flex gap-3 ${
        secili ? 'bg-coral-50 border-coral-200' : 'bg-cream-100 border-ink-100/40'
      }`}
    >
      <Icon
        name={ikon}
        className={`w-5 h-5 shrink-0 mt-0.5 ${secili ? 'text-coral-600' : 'text-ink-300'}`}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${secili ? 'text-coral-800' : 'text-ink-600'}`}>{baslik}</p>
        <p className="text-xs text-ink-400 mt-0.5 leading-relaxed">{aciklama}</p>
      </div>
      <div
        className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
          secili ? 'border-coral-500' : 'border-ink-200'
        }`}
      >
        {secili && <div className="w-2.5 h-2.5 rounded-full bg-coral-500" />}
      </div>
    </button>
  )
}
