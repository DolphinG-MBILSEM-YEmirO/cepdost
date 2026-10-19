import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import {
  Baloncuk,
  GonderButonu,
  SohbetZemini,
  useSonaKaydir,
  useYeniMesajEsigi,
} from './SohbetGovde'
import { TemaSheet } from './SohbetTemaSecici'
import { DavetKartiSohbet } from './SohbetPlanKarti'
import { PlanPaylasSheet } from './PlanPaylas'
import { ArkadaslaSihirbaz } from './OrtakPlanSihirbazi'
import { ArkadasProfili } from './ArkadasProfili'
import { useSohbetTemasi } from '../sohbetTema'
import { formatMessageTime } from '../lib/format'
import { davetiYanitla } from '../lib/planPaylasimi'
import { useSosyalSurum } from '../sosyal/cekirdek'
import {
  direktMesajGonder,
  direktMesajlariGetir,
  okunduIsaretle,
  type DirektMesaj,
} from '../sosyal/mesajlar'
import { davetiIptalEt, davetleriIdyeGoreGetir, type PlanDaveti, type Profil } from '../sosyal/api'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'

// One-to-one chat with a friend. Messages are read from the local copy and
// reloaded whenever social data changes (live events, sync, own sends).
interface Props {
  arkadas: Profil
  benimId: string
  onClose: () => void
  // Desktop: shown in the chat list's side pane instead of over the page.
  gomulu?: boolean
}

export function DirektSohbet({ arkadas, benimId, onClose, gomulu = false }: Props) {
  const [profilAcik, setProfilAcik] = useState(false)
  useEscapeIleKapat(onClose, !gomulu && !profilAcik)
  const [mesajlar, setMesajlar] = useState<DirektMesaj[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [girdi, setGirdi] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [temaAcik, setTemaAcik] = useState(false)
  const tema = useSohbetTemasi()
  const sonRef = useSonaKaydir([mesajlar.length])
  // İlk yüklemede gelen geçmiş animasyonsuz gelsin; sonra eklenenler
  // baloncuk animasyonuyla girsin.
  const yeniMi = useYeniMesajEsigi(mesajlar, !yukleniyor)
  const [davetler, setDavetler] = useState<Map<string, PlanDaveti>>(new Map())
  const [paylasAcik, setPaylasAcik] = useState(false)
  const [sihirbazAcik, setSihirbazAcik] = useState(false)
  const sosyalSurum = useSosyalSurum()

  useEffect(() => {
    let iptal = false
    void (async () => {
      try {
        const liste = await direktMesajlariGetir(arkadas.id)
        if (iptal) return
        setMesajlar(liste)
        if (liste.some((m) => m.gonderen_id === arkadas.id && !m.okundu)) {
          void okunduIsaretle(arkadas.id).catch(() => {})
        }
        // Invite cards: always fetched for the whole list, so a reload
        // never drops cards that were already showing.
        const idler = liste.map((m) => m.davet_id).filter((x): x is string => !!x)
        const harita = idler.length ? await davetleriIdyeGoreGetir(idler) : new Map<string, PlanDaveti>()
        if (!iptal) setDavetler(harita)
      } catch (err) {
        if (!iptal) setHata(err instanceof Error ? err.message : 'Mesajlar alınamadı')
      } finally {
        if (!iptal) setYukleniyor(false)
      }
    })()
    return () => {
      iptal = true
    }
  }, [arkadas.id, sosyalSurum])

  async function gonder() {
    const metin = girdi.trim()
    if (!metin || gonderiliyor) return
    setGirdi('')
    setGonderiliyor(true)
    setHata(null)
    try {
      await direktMesajGonder(arkadas.id, metin)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Mesaj gönderilemedi')
      setGirdi(metin)
    } finally {
      setGonderiliyor(false)
    }
  }

  return (
    <div className={gomulu ? 'flex flex-col h-full min-h-0' : 'panel-tam z-[55]'}>
      <div className="flex items-center justify-between px-5 pt-[calc(1rem+var(--safe-top))] pb-4 border-b border-ink-100 shrink-0">
        <button
          onClick={() => setProfilAcik(true)}
          aria-label={`${arkadas.ad} profilini aç`}
          className="flex items-center gap-3 min-w-0 text-left rounded-2xl -m-1 p-1 hover:bg-ink-50 active:scale-[0.98] transition-all"
        >
          <Avatar ad={arkadas.ad} foto={arkadas.avatar} emoji={arkadas.emoji} renk={arkadas.renk} boyut="sm" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-ink-700 leading-tight truncate">
              {arkadas.ad}
            </h2>
            {arkadas.kullanici_adi && (
              <p className="text-xs text-ink-400 truncate">@{arkadas.kullanici_adi}</p>
            )}
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setTemaAcik(true)}
            aria-label="Sohbet temasını değiştir"
            className="w-10 h-10 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform"
          >
            <Icon name="Palette" className="w-5 h-5 text-ink-400" />
          </button>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="w-10 h-10 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform"
          >
            <Icon name="X" className="w-5 h-5 text-ink-500" />
          </button>
        </div>
      </div>

      {temaAcik && <TemaSheet onKapat={() => setTemaAcik(false)} />}

      {profilAcik && (
        <ArkadasProfili
          arkadas={arkadas}
          benimId={benimId}
          onClose={() => setProfilAcik(false)}
          onMesaj={() => setProfilAcik(false)}
        />
      )}

      {paylasAcik && (
        <PlanPaylasSheet
          hedef={{ tur: 'arkadas', id: arkadas.id, ad: arkadas.ad }}
          onKapat={() => setPaylasAcik(false)}
          onUygunSaat={() => {
            setPaylasAcik(false)
            setSihirbazAcik(true)
          }}
        />
      )}

      {sihirbazAcik && (
        <ArkadaslaSihirbaz arkadas={arkadas} onKapat={() => setSihirbazAcik(false)} />
      )}

      <SohbetZemini tema={tema} className="px-5 py-4">
        <div className="space-y-2">
          {yukleniyor ? (
            <div className="flex justify-center py-8">
              <Icon name="Loader2" className="w-5 h-5 animate-spin text-ink-300" />
            </div>
          ) : mesajlar.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-ink-400">Henüz mesaj yok. İlkini sen yaz.</p>
            </div>
          ) : (
            mesajlar.map((m) => {
              const davet = m.davet_id ? davetler.get(m.davet_id) : null
              return (
                <Baloncuk
                  key={m.id}
                  benim={m.gonderen_id === benimId}
                  yeni={yeniMi(m.olusturulma)}
                  zaman={formatMessageTime(m.olusturulma) ?? undefined}
                  ek={
                    davet && (
                      <DavetKartiSohbet
                        davet={davet}
                        benimId={benimId}
                        karsiAd={arkadas.ad}
                        onYanit={(kabul) => davetiYanitla(davet, kabul, arkadas.ad)}
                        onIptal={() => davetiIptalEt(davet.id)}
                      />
                    )
                  }
                >
                  {m.metin}
                </Baloncuk>
              )
            })
          )}

          {hata && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
              <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700">{hata}</p>
            </div>
          )}

          <div ref={sonRef} />
        </div>
      </SohbetZemini>

      <div className="px-5 pb-[calc(1rem+var(--safe-bottom))] pt-3 border-t border-ink-100 safe-x shrink-0 bg-mist-100">
        <div className="flex items-end gap-2">
          <button
            onClick={() => setPaylasAcik(true)}
            aria-label="Plan paylaş"
            className="w-11 h-11 rounded-full bg-orchid-100 text-orchid-600 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <Icon name="CalendarPlus" className="w-5 h-5" />
          </button>
          <textarea
            value={girdi}
            onChange={(e) => setGirdi(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void gonder()
              }
            }}
            placeholder="Mesaj yaz..."
            rows={1}
            className="flex-1 bg-mist-50 border border-ink-100 rounded-2xl px-4 py-3 text-ink-700 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-orchid-200 transition-all resize-none max-h-32"
          />
          <GonderButonu
            onClick={() => void gonder()}
            gonderiliyor={gonderiliyor}
            pasif={!girdi.trim()}
          />
        </div>
      </div>
    </div>
  )
}
