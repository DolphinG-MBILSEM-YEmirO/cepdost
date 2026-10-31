import { useState } from 'react'
import { Icon } from './Icon'
import type { Profil } from '../sosyal/api'
import type { Ani } from '../sosyal/gruplar'
import {
  ANI_TEPKILERI,
  YORUM_AZAMI,
  aniYorumunuSil,
  aniyaTepkiVer,
  aniyaYorumYap,
  type AniEtkilesimi,
} from '../sosyal/aniEtkilesimi'
import { deDa, formatRelativeTime } from '../lib/format'
import { adListesi } from '../sosyal/adlar'

// Under a memory in the feed: reactions, "I want to go too" and comments.
// On Keşfet (`yanitlanabilir` off) only "I want to go too" is there, and it
// stays on this phone. On a plan's page, where everyone was there, there's
// no "I want to go too" (no `onGitmek`).

// Comments shown before "show all".
const KISA_YORUM = 2


export function AniYanitlari({
  ani,
  etkilesim,
  profiller,
  benimId,
  yanitlanabilir,
  onGitmek,
  onPlanla,
}: {
  ani: Ani
  etkilesim: AniEtkilesimi
  profiller: Map<string, Profil>
  benimId: string
  yanitlanabilir: boolean
  // I want to go there too (or not any more).
  onGitmek?: (ani: Ani, istiyor: boolean) => Promise<void>
  // The one who shared it makes it a plan.
  onPlanla?: (ani: Ani) => Promise<void>
}) {
  const [secici, setSecici] = useState(false)
  const [yorumlarAcik, setYorumlarAcik] = useState(false)
  const [yorum, setYorum] = useState('')
  const [isleniyor, setIsleniyor] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  const benim = ani.sahip_id === benimId
  const tepkim = etkilesim.tepkiler.find((t) => t.kullanici_id === benimId)?.emoji ?? null
  const gitmekIstiyorum = etkilesim.gitmekIsteyenler.includes(benimId)
  const digerIsteyenler = etkilesim.gitmekIsteyenler.filter((id) => id !== benimId)
  const ozet = ANI_TEPKILERI.map((emoji) => ({
    emoji,
    kimler: etkilesim.tepkiler.filter((t) => t.emoji === emoji).map((t) => t.kullanici_id),
  })).filter((t) => t.kimler.length > 0)
  const gorunenYorumlar = yorumlarAcik ? etkilesim.yorumlar : etkilesim.yorumlar.slice(-KISA_YORUM)
  const isteyenAdlari = adListesi(digerIsteyenler, profiller, benimId)

  async function calistir(anahtar: string, is: () => Promise<unknown>) {
    setIsleniyor(anahtar)
    setHata(null)
    try {
      await is()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Olmadı, tekrar dener misin?')
    } finally {
      setIsleniyor(null)
    }
  }

  function yorumGonder() {
    const metin = yorum.trim()
    if (!metin) return
    setYorum('')
    setYorumlarAcik(true)
    void calistir('yorum', () => aniyaYorumYap(ani, metin))
  }

  return (
    <div className="px-4 pb-4 -mt-1" aria-label="Anıya yanıtlar">
      {ozet.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2">
          {ozet.map((t) => (
            <li
              key={t.emoji}
              aria-label={`${t.emoji} ${adListesi(t.kimler, profiller, benimId)}`}
              className="chip text-xs py-0.5 bg-mist-100 text-ink-500 border border-ink-100"
            >
              <span aria-hidden="true">{t.emoji}</span>
              <span aria-hidden="true">{t.kimler.length}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {yanitlanabilir && (
          <button
            onClick={() => setSecici(!secici)}
            aria-expanded={secici}
            aria-label={tepkim ? `Tepkin: ${tepkim}` : 'Tepki ver'}
            className={`chip text-xs active:opacity-80 ${tepkim ? 'bg-brand-50 text-brand-700 border border-brand-100' : 'bg-white text-ink-600 border border-ink-200'}`}
          >
            {tepkim ? <span aria-hidden="true">{tepkim}</span> : <Icon name="SmilePlus" className="w-3.5 h-3.5" />}
            Tepki
          </button>
        )}
        {yanitlanabilir && (
          <button
            onClick={() => setYorumlarAcik(!yorumlarAcik)}
            aria-expanded={yorumlarAcik}
            className="chip text-xs bg-white text-ink-600 border border-ink-200 active:opacity-80"
          >
            <Icon name="MessageCircle" className="w-3.5 h-3.5" />
            Yorum{etkilesim.yorumlar.length > 0 ? ` (${etkilesim.yorumlar.length})` : ''}
          </button>
        )}
        {!benim && onGitmek && (
          <button
            onClick={() => void calistir('gitmek', () => onGitmek(ani, !gitmekIstiyorum))}
            disabled={isleniyor === 'gitmek'}
            aria-pressed={gitmekIstiyorum}
            className={`chip text-xs active:opacity-80 disabled:opacity-50 ${
              gitmekIstiyorum ? 'bg-teal-100 text-teal-700' : 'bg-white text-ink-600 border border-ink-200'
            }`}
          >
            <Icon name={gitmekIstiyorum ? 'Check' : 'MapPin'} className="w-3.5 h-3.5" />
            Ben de gitmek istiyorum
          </button>
        )}
      </div>

      {secici && (
        <div className="flex gap-1 mt-2 animate-fade-in" role="group" aria-label="Tepki seç">
          {ANI_TEPKILERI.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                setSecici(false)
                void calistir('tepki', () => aniyaTepkiVer(ani, emoji))
              }}
              aria-label={`${emoji} bırak`}
              aria-pressed={tepkim === emoji}
              className={`w-10 h-10 rounded-full text-xl flex items-center justify-center active:opacity-80 transition-transform ${
                tepkim === emoji ? 'bg-brand-100 ring-2 ring-brand-300' : 'bg-mist-100 hover:bg-mist-200'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {digerIsteyenler.length > 0 && (
        <div className="flex items-center gap-2 mt-2.5 rounded-2xl bg-teal-50 border border-teal-100 px-3 py-2">
          <Icon name="MapPin" className="w-4 h-4 text-teal-600 shrink-0" />
          <p className="flex-1 min-w-0 text-xs text-teal-800">
            {isteyenAdlari} {deDa(isteyenAdlari)} {gitmekIstiyorum ? 'seninle gitmek istiyor' : 'gitmek istiyor'}
          </p>
          {benim && onPlanla && (
            <button
              onClick={() => void calistir('planla', () => onPlanla(ani))}
              disabled={isleniyor === 'planla'}
              className="chip text-xs py-1 bg-white text-teal-700 border border-teal-200 shrink-0 active:opacity-80 disabled:opacity-50"
            >
              <Icon name="CalendarPlus" className="w-3.5 h-3.5" />
              Plan yap
            </button>
          )}
        </div>
      )}

      {yanitlanabilir && etkilesim.yorumlar.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label="Yorumlar">
          {!yorumlarAcik && etkilesim.yorumlar.length > KISA_YORUM && (
            <li>
              <button onClick={() => setYorumlarAcik(true)} className="text-xs font-medium text-ink-400">
                Tüm yorumlar ({etkilesim.yorumlar.length})
              </button>
            </li>
          )}
          {gorunenYorumlar.map((y) => (
            <li key={y.id} className="group flex items-start gap-2 text-sm">
              <p className="flex-1 min-w-0 break-words text-ink-600">
                <span className="font-semibold text-ink-700">{y.yazar === benimId ? 'Sen' : (profiller.get(y.yazar)?.ad ?? 'Bir arkadaşın')}</span>{' '}
                {y.metin}
                <span className="text-[11px] text-ink-400 ml-1.5">{formatRelativeTime(y.zaman)}</span>
              </p>
              {y.yazar === benimId && (
                <button
                  onClick={() => void calistir(`sil:${y.id}`, () => aniYorumunuSil(ani, y.id))}
                  disabled={isleniyor === `sil:${y.id}`}
                  aria-label="Yorumunu sil"
                  className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-ink-200 hover:text-rose-500 hover:bg-rose-50"
                >
                  <Icon name="X" className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {yanitlanabilir && (yorumlarAcik || etkilesim.yorumlar.length > 0) && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            yorumGonder()
          }}
          className="flex gap-2 mt-2.5"
        >
          <input
            value={yorum}
            onChange={(e) => setYorum(e.target.value)}
            maxLength={YORUM_AZAMI}
            placeholder="Yorum ekle..."
            aria-label="Yorum"
            className="input-field flex-1 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!yorum.trim() || isleniyor === 'yorum'}
            aria-label="Yorumu gönder"
            className="w-10 shrink-0 rounded-2xl bg-brand-600 text-white flex items-center justify-center active:opacity-80 transition-transform disabled:opacity-40"
          >
            <Icon name={isleniyor === 'yorum' ? 'Loader2' : 'Send'} className={`w-4 h-4 ${isleniyor === 'yorum' ? 'animate-spin' : ''}`} />
          </button>
        </form>
      )}

      {hata && <p className="text-xs text-rose-600 mt-2">{hata}</p>}
    </div>
  )
}
