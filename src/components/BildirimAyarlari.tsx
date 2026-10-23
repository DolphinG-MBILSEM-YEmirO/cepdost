import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import type { BildirimTuru } from '../../shared/bildirim'
import {
  bildirimleriAc,
  bildirimleriKapat,
  cihazDurumu,
  guncelAdres,
  turTercihleri,
  turTercihleriniKaydet,
  type CihazDurumu,
} from '../bildirim/cihaz'
import { adresimiKaydet, adresimiSil, kendimeDene } from '../sosyal/bildirimler'

// Turning push notifications on for this device (Ayarlar), and a one-time
// nudge in the chat list for people who haven't decided yet.

const SECENEKLER: { baslik: string; aciklama: string; turler: BildirimTuru[] }[] = [
  { baslik: 'Mesajlar', aciklama: 'Arkadaşlarından gelen mesajlar ve anılarına yanıtlar', turler: ['mesaj'] },
  { baslik: 'Arkadaşlık', aciklama: 'Yeni istekler ve kabul edilenler', turler: ['istek', 'kabul'] },
  { baslik: 'Planlar', aciklama: 'Davetler, yanıtlar ve plan linkine gelenler', turler: ['davet', 'link'] },
  { baslik: 'Gruplar', aciklama: 'Grup sohbetleri, grup planları ve anılar', turler: ['grup'] },
]

const DURUM_METNI: Record<Exclude<CihazDurumu, 'acik' | 'kapali'>, string> = {
  'ana-ekran-gerekli': 'iPhone ve iPad’de bildirimler için önce Safari’de Paylaş → Ana Ekrana Ekle ile uygulamayı ekle, sonra oradan aç.',
  reddedildi: 'Bu sitenin bildirimlerini engellemişsin. Tarayıcının site ayarlarından izin verip buraya dön.',
  desteklenmiyor: 'Bu tarayıcı bildirimleri desteklemiyor. Telefonunda Chrome ya da Safari ile dene.',
}

async function cihaziAc(): Promise<void> {
  await adresimiKaydet(await bildirimleriAc())
}

export function BildirimAyarlari() {
  const [durum, setDurum] = useState<CihazDurumu | null>(null)
  const [turler, setTurler] = useState<BildirimTuru[]>(turTercihleri)
  const [calisiyor, setCalisiyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [denendi, setDenendi] = useState(false)

  useEffect(() => {
    void cihazDurumu().then(setDurum)
  }, [])

  async function calistir(is: () => Promise<void>) {
    setCalisiyor(true)
    setHata(null)
    try {
      await is()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Bir şeyler ters gitti.')
    } finally {
      setDurum(await cihazDurumu())
      setCalisiyor(false)
    }
  }

  const kapat = () =>
    calistir(async () => {
      const endpoint = await bildirimleriKapat()
      if (endpoint) await adresimiSil(endpoint)
    })

  const dene = () =>
    calistir(async () => {
      const adres = await guncelAdres()
      if (!adres) throw new Error('Bu cihazda bildirimler kapalı.')
      await kendimeDene(adres)
      setDenendi(true)
    })

  async function turDegistir(secenek: BildirimTuru[]) {
    const acik = secenek.every((t) => turler.includes(t))
    const yeni = acik ? turler.filter((t) => !secenek.includes(t)) : [...turler, ...secenek]
    setTurler(yeni)
    turTercihleriniKaydet(yeni)
    const adres = await guncelAdres()
    if (adres) await adresimiKaydet(adres).catch(() => {})
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-orchid-100 flex items-center justify-center">
          <Icon name="BellRing" className="w-5 h-5 text-orchid-600" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-ink-700">Bildirimler</h2>
          {durum === 'acik' && <p className="text-xs text-teal-600 font-medium">Bu cihazda açık</p>}
        </div>
      </div>

      {durum === null ? (
        <div className="skeleton h-12 rounded-2xl" />
      ) : durum === 'acik' ? (
        <>
          <div className="space-y-3 mb-4">
            {SECENEKLER.map((s) => (
              <Anahtar
                key={s.baslik}
                acik={s.turler.every((t) => turler.includes(t))}
                onDegistir={() => void turDegistir(s.turler)}
                baslik={s.baslik}
                aciklama={s.aciklama}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void dene()}
              disabled={calisiyor}
              className="flex-1 bg-orchid-50 text-orchid-700 font-medium text-sm rounded-2xl py-2.5 active:scale-[0.97] transition-all disabled:opacity-60"
            >
              {denendi ? 'Gönderildi ✓' : 'Deneme bildirimi'}
            </button>
            <button
              onClick={() => void kapat()}
              disabled={calisiyor}
              className="flex-1 btn-ghost border border-ink-100 text-sm py-2.5 disabled:opacity-60"
            >
              Bu cihazda kapat
            </button>
          </div>
        </>
      ) : durum === 'kapali' ? (
        <>
          <p className="text-sm text-ink-400 mb-4">
            Mesajlar, arkadaşlık istekleri ve plan davetleri uygulama kapalıyken de telefonuna gelsin.
          </p>
          <button
            onClick={() => void calistir(cihaziAc)}
            disabled={calisiyor}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {calisiyor ? <Icon name="Loader2" className="w-5 h-5 animate-spin" /> : <Icon name="Bell" className="w-4 h-4" />}
            Bildirimleri aç
          </button>
        </>
      ) : (
        <p className="text-sm text-ink-400">{DURUM_METNI[durum]}</p>
      )}

      {hata && <p className="text-xs text-rose-600 mt-3">{hata}</p>}
    </div>
  )
}

const BANT_ANAHTARI = 'cepdost_bildirim_bandi'

// Above the chat list until notifications are on or the person says no.
export function BildirimBandi() {
  const [durum, setDurum] = useState<CihazDurumu | null>(null)
  const [kapandi, setKapandi] = useState(() => {
    try {
      return localStorage.getItem(BANT_ANAHTARI) === '1'
    } catch {
      return false
    }
  })
  const [calisiyor, setCalisiyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    if (!kapandi) void cihazDurumu().then(setDurum)
  }, [kapandi])

  function vazgec() {
    try {
      localStorage.setItem(BANT_ANAHTARI, '1')
    } catch {
      // Private mode: it just comes back next time.
    }
    setKapandi(true)
  }

  async function ac() {
    setCalisiyor(true)
    setHata(null)
    try {
      await cihaziAc()
      setDurum('acik')
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Açılamadı.')
      setDurum(await cihazDurumu())
    } finally {
      setCalisiyor(false)
    }
  }

  if (kapandi || (durum !== 'kapali' && durum !== 'ana-ekran-gerekli')) return null

  return (
    <div className="card p-4 mb-4 flex items-start gap-3 bg-gradient-orchid-soft border-orchid-100">
      <div className="w-10 h-10 rounded-xl bg-mist-50 flex items-center justify-center shrink-0">
        <Icon name="BellRing" className="w-5 h-5 text-orchid-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink-700">Mesajlar telefonuna gelsin mi?</p>
        <p className="text-xs text-ink-500 mt-0.5">
          {durum === 'ana-ekran-gerekli'
            ? 'iPhone’da önce Paylaş → Ana Ekrana Ekle ile uygulamayı ekle; bildirimler oradan açılır.'
            : 'Mesaj, istek ya da davet gelince haber verelim.'}
        </p>
        {hata && <p className="text-xs text-rose-600 mt-1">{hata}</p>}
        <div className="flex gap-2 mt-3">
          {durum === 'kapali' && (
            <button
              onClick={() => void ac()}
              disabled={calisiyor}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-60"
            >
              {calisiyor ? '...' : 'Aç'}
            </button>
          )}
          <button onClick={vazgec} className="text-sm font-medium text-ink-400 px-3 py-2">
            {durum === 'kapali' ? 'Şimdi değil' : 'Tamam'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Anahtar({
  acik,
  onDegistir,
  baslik,
  aciklama,
}: {
  acik: boolean
  onDegistir: () => void
  baslik: string
  aciklama: string
}) {
  return (
    <button
      role="switch"
      aria-checked={acik}
      onClick={onDegistir}
      className="w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
    >
      <div className={`w-11 h-6 rounded-full transition-colors shrink-0 relative ${acik ? 'bg-gradient-orchid' : 'bg-ink-200'}`}>
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-soft transition-all ${
            acik ? 'left-[1.375rem]' : 'left-0.5'
          }`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-600">{baslik}</p>
        <p className="text-xs text-ink-400">{aciklama}</p>
      </div>
    </button>
  )
}
