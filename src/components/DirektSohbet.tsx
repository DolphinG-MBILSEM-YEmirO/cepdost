import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { SohbetZemini, useSonaKaydir, useYeniMesajEsigi } from './SohbetGovde'
import { MesajKatmanlari, MesajSatiri, MesajYazmaAlani, SohbetUstSeridi } from './MesajIslemleri'
import { useMesajIslemleri } from './useMesajIslemleri'
import { TemaSheet } from './SohbetTemaSecici'
import { DavetKartiSohbet } from './SohbetPlanKarti'
import { PlanPaylasSheet } from './PlanPaylas'
import { ArkadaslaSihirbaz } from './OrtakPlanSihirbazi'
import { ArkadasProfili } from './ArkadasProfili'
import { useSohbetTemasi } from '../sohbetTema'
import { davetiYanitla } from '../lib/planPaylasimi'
import { useSosyalSurum } from '../sosyal/cekirdek'
import {
  direktMesajGonder,
  direktMesajlariGetir,
  okunduIsaretle,
  type DirektMesaj,
} from '../sosyal/mesajlar'
import { davetiIptalEt, davetleriIdyeGoreGetir, type PlanDaveti, type Profil } from '../sosyal/api'
import { useGeriAdimi, useGeriIleKapat } from '../lib/geriTusu'
import type { MesajGonderimEki } from '../sosyal/mesajOrtak'
import type { SohbetHedefi } from '../sosyal/mesajIslemleri'

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
  useGeriIleKapat(onClose, !gomulu)
  // Desktop: the chat sits in the side pane, so only back closes it.
  useGeriAdimi(onClose, gomulu)
  const [mesajlar, setMesajlar] = useState<DirektMesaj[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
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
  const hedef = useMemo<SohbetHedefi>(() => ({ tur: 'arkadas', id: arkadas.id }), [arkadas.id])
  const adAl = useCallback((id: string) => (id === arkadas.id ? arkadas.ad : 'Sen'), [arkadas.id, arkadas.ad])
  const gonder = useCallback(
    (metin: string, ek: MesajGonderimEki) => direktMesajGonder(arkadas.id, metin, null, ek),
    [arkadas.id],
  )
  // Reply, react, edit, delete... (see MesajIslemleri.tsx).
  const islemler = useMesajIslemleri({ hedef, benimId, mesajlar, adAl, gonder, onHata: setHata })

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

      <SohbetUstSeridi islemler={islemler} />

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
                <MesajSatiri
                  key={m.id}
                  mesaj={m}
                  islemler={islemler}
                  yeni={yeniMi(m.olusturulma)}
                  okunduGoster
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
                />
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

      <MesajYazmaAlani islemler={islemler} onPlanPaylas={() => setPaylasAcik(true)} />
      <MesajKatmanlari islemler={islemler} />
    </div>
  )
}
