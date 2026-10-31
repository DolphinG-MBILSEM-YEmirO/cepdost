import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { DogrulanmisEposta, EpostaDogrulama } from './EpostaDogrulama'
import type { Gizlilik, Profil } from '../sosyal/api'
import { epostaDogrulamasiGerekli, type EpostaOnayi } from '../sosyal/epostaImzacisi'
import { hesabiKur, kullaniciAdiHatasi } from '../sosyal/hesap'
import { UYGULAMA_ADI } from '../../shared/marka'

// First step of a new account: name, username, a verified email (keeps
// bots out) and who can see the profile. Shown while the account has no
// username, so the social features can't be used before setup is done
// (Instagram/TikTok style).
interface Props {
  profil: Profil | null
  onTamamlandi: () => Promise<void>
}

export function HesapKurulumu({ profil, onTamamlandi }: Props) {
  const [ad, setAd] = useState(profil?.ad ?? '')
  const [kullaniciAdi, setKullaniciAdi] = useState('')
  const [gizlilik, setGizlilik] = useState<Gizlilik>('arkadaslar')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  // undefined while asking the server whether emails are verified here.
  const [epostaGerekli, setEpostaGerekli] = useState<boolean>()
  const [eposta, setEposta] = useState<{ adres: string; onay: EpostaOnayi } | null>(null)
  const [epostaDegisiyor, setEpostaDegisiyor] = useState(false)

  useEffect(() => {
    void epostaDogrulamasiGerekli().then(setEpostaGerekli)
  }, [])

  // Dots are allowed but not at the ends or twice in a row, so names can't
  // easily imitate each other.
  const temizKullaniciAdi = kullaniciAdi.trim().toLocaleLowerCase('tr-TR').replace(/^@/, '')
  const kullaniciAdiGecerli = kullaniciAdiHatasi(temizKullaniciAdi) === null

  async function kaydet() {
    if (!ad.trim()) {
      setHata('Adını yaz — arkadaşların seni bu isimle görecek.')
      return
    }
    if (!kullaniciAdiGecerli) {
      setHata('Kullanıcı adı 3-20 karakter olmalı; küçük harf, rakam, _ ve nokta kullanabilirsin.')
      return
    }
    if (epostaGerekli && !eposta) {
      setHata('E-posta adresini doğrula; gelen kodu yazman yeterli.')
      return
    }
    setKaydediliyor(true)
    setHata(null)
    try {
      await hesabiKur({
        ad: ad.trim(),
        kullanici_adi: temizKullaniciAdi,
        gizlilik,
        eposta: eposta?.adres ?? null,
        onay: eposta?.onay ?? null,
      })
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
          <div className="flex items-center bg-mist-100 border border-ink-100 rounded-xl px-3 mb-2">
            <span className="text-ink-400">@</span>
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

        {epostaGerekli && (
          <div className="card p-5 mb-4">
            <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
              E-posta adresin
            </label>
            {eposta && !epostaDegisiyor ? (
              <DogrulanmisEposta eposta={eposta.adres} onDegistir={() => setEpostaDegisiyor(true)} />
            ) : (
              <EpostaDogrulama
                baslangic={eposta?.adres}
                onDogrulandi={(adres, onay) => {
                  setEposta({ adres, onay })
                  setEpostaDegisiyor(false)
                  setHata(null)
                }}
              />
            )}
            <p className="text-xs text-ink-400 mt-3">
              Botları uzak tutmak için gerekli. Adresin profilinde görünmez, kimseyle paylaşılmaz.
            </p>
          </div>
        )}

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
              aciklama={`Profilin diğer ${UYGULAMA_ADI} kullanıcılarına açık olur; istersen fotoğraflarını Keşfet'te paylaşabilirsin.`}
              ikon="Users"
            />
          </div>
          <p className="text-xs text-ink-400 mt-3">
            Bunu daha sonra Hesabım sekmesinden değiştirebilirsin.
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
          disabled={kaydediliyor || epostaGerekli === undefined}
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
      className={`w-full text-left rounded-2xl p-3.5 border transition-all active:opacity-80 flex gap-3 ${
        secili ? 'bg-orchid-50 border-orchid-200' : 'bg-mist-100 border-ink-100'
      }`}
    >
      <Icon
        name={ikon}
        className={`w-5 h-5 shrink-0 mt-0.5 ${secili ? 'text-orchid-600' : 'text-ink-400'}`}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${secili ? 'text-orchid-800' : 'text-ink-600'}`}>{baslik}</p>
        <p className="text-xs text-ink-400 mt-0.5 leading-relaxed">{aciklama}</p>
      </div>
      <div
        className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
          secili ? 'border-orchid-500' : 'border-ink-200'
        }`}
      >
        {secili && <div className="w-2.5 h-2.5 rounded-full bg-orchid-500" />}
      </div>
    </button>
  )
}
