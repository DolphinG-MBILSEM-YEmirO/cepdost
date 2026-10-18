import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { KOD_UZUNLUGU, epostaNormallestir, kodGoster, kodNormallestir } from '../../shared/epostaOnayi'
import { epostayiKaydet, kodIste, koduDogrula, type KodBileti } from '../sosyal/eposta'
import type { EpostaOnayi } from '../sosyal/epostaImzacisi'

// Email verification: the user types an address, gets a code by mail and
// types it back; the server's attestation then goes to `onDogrulandi` (see
// sosyal/eposta.ts). Used by account setup, by the one-time screen for
// older accounts, and in Settings to change the address.

// How long "send again" stays off after a code goes out.
const TEKRAR_BEKLEME_SN = 30

function hataMetni(err: unknown, yedek: string): string {
  return err instanceof Error && err.message ? err.message : yedek
}

export function EpostaDogrulama({
  baslangic = '',
  onDogrulandi,
}: {
  baslangic?: string
  onDogrulandi: (eposta: string, onay: EpostaOnayi) => Promise<void> | void
}) {
  const [eposta, setEposta] = useState(baslangic)
  const [bilet, setBilet] = useState<KodBileti | null>(null)
  const [kod, setKod] = useState('')
  const [calisiyor, setCalisiyor] = useState<'kod' | 'dogrula' | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [bekleme, setBekleme] = useState(0)

  useEffect(() => {
    if (bekleme <= 0) return
    const zamanlayici = setTimeout(() => setBekleme((b) => b - 1), 1000)
    return () => clearTimeout(zamanlayici)
  }, [bekleme])

  const adresGecerli = epostaNormallestir(eposta) !== null
  const kodTamam = kod.length === KOD_UZUNLUGU

  async function kodGonder(e?: React.FormEvent) {
    e?.preventDefault()
    if (!adresGecerli || calisiyor) return
    setCalisiyor('kod')
    setHata(null)
    try {
      setBilet(await kodIste(eposta))
      setKod('')
      setBekleme(TEKRAR_BEKLEME_SN)
    } catch (err) {
      setHata(hataMetni(err, 'Kod gönderilemedi.'))
    } finally {
      setCalisiyor(null)
    }
  }

  async function dogrula(e: React.FormEvent) {
    e.preventDefault()
    if (!bilet || !kodTamam || calisiyor) return
    setCalisiyor('dogrula')
    setHata(null)
    try {
      const onay = await koduDogrula(bilet, kod)
      await onDogrulandi(bilet.eposta, onay)
    } catch (err) {
      setHata(hataMetni(err, 'Doğrulanamadı.'))
    } finally {
      setCalisiyor(null)
    }
  }

  const hataKutusu = hata && (
    <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mt-3">
      <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
      <p className="text-sm text-rose-700">{hata}</p>
    </div>
  )

  if (!bilet) {
    return (
      <form onSubmit={kodGonder}>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={eposta}
          onChange={(e) => setEposta(e.target.value)}
          placeholder="ornek@gmail.com"
          className="input-field mb-3"
        />
        <button
          type="submit"
          disabled={!adresGecerli || calisiyor !== null}
          className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {calisiyor === 'kod' ? (
            <>
              <Icon name="Loader2" className="w-5 h-5 animate-spin" />
              Kod gönderiliyor...
            </>
          ) : (
            <>
              <Icon name="Mail" className="w-5 h-5" />
              Doğrulama kodu gönder
            </>
          )}
        </button>
        {hataKutusu}
      </form>
    )
  }

  return (
    <div>
      <p className="text-sm text-ink-500 leading-relaxed mb-3">
        <span className="font-semibold text-ink-700">{bilet.eposta}</span> adresine 8 haneli bir kod gönderdik. Gelen
        kutunu, gelmediyse spam klasörünü kontrol et.
      </p>
      <form onSubmit={dogrula}>
        <input
          value={kod.length > 4 ? kodGoster(kod) : kod}
          onChange={(e) => setKod(kodNormallestir(e.target.value).slice(0, KOD_UZUNLUGU))}
          placeholder="ABCD-EFGH"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Doğrulama kodu"
          autoFocus
          className="input-field mb-3 text-center font-mono text-lg tracking-[0.3em] uppercase"
        />
        <button
          type="submit"
          disabled={!kodTamam || calisiyor !== null}
          className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {calisiyor === 'dogrula' ? (
            <>
              <Icon name="Loader2" className="w-5 h-5 animate-spin" />
              Doğrulanıyor...
            </>
          ) : (
            <>
              <Icon name="MailCheck" className="w-5 h-5" />
              Doğrula
            </>
          )}
        </button>
      </form>
      <div className="flex items-center justify-between mt-3 text-xs font-semibold">
        <button
          onClick={() => {
            setBilet(null)
            setHata(null)
          }}
          disabled={calisiyor !== null}
          className="text-ink-400 disabled:opacity-50"
        >
          Adresi değiştir
        </button>
        <button
          onClick={() => void kodGonder()}
          disabled={bekleme > 0 || calisiyor !== null}
          className="text-coral-600 disabled:text-ink-300"
        >
          {calisiyor === 'kod' ? 'Gönderiliyor...' : bekleme > 0 ? `Tekrar gönder (${bekleme})` : 'Kodu tekrar gönder'}
        </button>
      </div>
      {hataKutusu}
    </div>
  )
}

// A verified address with a way to change it.
export function DogrulanmisEposta({ eposta, onDegistir }: { eposta: string; onDegistir?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-teal-50 border border-teal-100 px-3.5 py-3">
      <Icon name="MailCheck" className="w-5 h-5 text-teal-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink-700 truncate">{eposta}</p>
        <p className="text-xs text-teal-700">Doğrulandı</p>
      </div>
      {onDegistir && (
        <button onClick={onDegistir} className="text-xs font-semibold text-coral-600 shrink-0">
          Değiştir
        </button>
      )}
    </div>
  )
}

// Asked once of accounts made before an email was required. Social
// features stay closed until it's done, like a new account's setup.
export function EpostaDogrulamaEkrani({
  onTamamlandi,
  onCikis,
}: {
  onTamamlandi: () => Promise<void>
  onCikis: () => void
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
        <h1 className="font-display text-2xl font-bold text-ink-700">E-postanı doğrula</h1>
        <p className="text-sm text-ink-400 mt-0.5">Tek seferlik bir adım</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24">
        <div className="card p-4 mb-4 bg-teal-50/60 border-teal-100">
          <div className="flex items-start gap-2.5">
            <Icon name="ShieldCheck" className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
            <p className="text-xs text-teal-800 leading-relaxed">
              Herkese açık hesaplar gittikleri yerleri Keşfet'te paylaşabiliyor. Botları uzak tutmak için her
              hesaptan bir kez e-posta doğrulaması istiyoruz. Adresin profilinde görünmez, kimseyle paylaşılmaz.
            </p>
          </div>
        </div>

        <div className="card p-5 mb-4">
          <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">E-posta adresin</label>
          <EpostaDogrulama
            onDogrulandi={async (eposta, onay) => {
              await epostayiKaydet(eposta, onay)
              await onTamamlandi()
            }}
          />
        </div>

        <button onClick={onCikis} className="btn-ghost w-full text-sm">
          Başka bir hesapla gir
        </button>
      </div>
    </div>
  )
}
