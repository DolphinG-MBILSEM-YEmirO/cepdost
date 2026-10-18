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
import { useSohbetTemasi } from '../sohbetTema'
import { formatMessageTime } from '../lib/format'
import { useSosyalSurum } from '../sosyal/cekirdek'
import {
  direktMesajGonder,
  direktMesajlariGetir,
  okunduIsaretle,
  type DirektMesaj,
} from '../sosyal/mesajlar'
import {
  davetleriIdyeGoreGetir,
  davetYanitla,
  type PlanDaveti,
  type Profil,
} from '../sosyal/api'
import { kayitOlustur } from '../db'
import { formatDate } from '../lib/format'

// One-to-one chat with a friend. Messages are read from the local copy and
// reloaded whenever social data changes (live events, sync, own sends).
interface Props {
  arkadas: Profil
  benimId: string
  onClose: () => void
}

export function DirektSohbet({ arkadas, benimId, onClose }: Props) {
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

  // Karttan kabul/red. Kabulde plan kendi takvimime de düşüyor — davetler
  // sekmesindeki akışla aynı davranış.
  async function davetiYanitla(davet: PlanDaveti, kabul: boolean) {
    if (kabul) {
      await kayitOlustur({
        kategori: 'etkinlik',
        baslik: davet.baslik,
        tarih: davet.tarih,
        saat: davet.saat ? davet.saat.slice(0, 5) : null,
        konum: davet.konum,
        oncelik: 'orta',
        sure: davet.sure,
        ozetNot: davet.mesaj,
        mekanOnerisi: null,
        yakinOneriler: null,
        kaynakTipi: 'metin',
        hamBaslik: '',
        hamMetin: '',
        hamLink: '',
        gorseller: [],
        arkadasId: davet.gonderen_id,
        arkadasAdi: arkadas.ad,
      })
    }
    await davetYanitla(davet.id, kabul)
    setDavetler((eski) => {
      const yeni = new Map(eski)
      yeni.set(davet.id, { ...davet, durum: kabul ? 'kabul' : 'red' })
      return yeni
    })
  }

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
    <div className="fixed inset-0 z-[55] flex flex-col bg-cream-100/95 backdrop-blur-md animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-[calc(1rem+var(--safe-top))] pb-4 border-b border-ink-100/40 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar ad={arkadas.ad} foto={arkadas.avatar} emoji={arkadas.emoji} renk={arkadas.renk} boyut="sm" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-ink-700 leading-tight truncate">
              {arkadas.ad}
            </h2>
            {arkadas.kullanici_adi && (
              <p className="text-xs text-ink-400 truncate">@{arkadas.kullanici_adi}</p>
            )}
          </div>
        </div>
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
                >
                  {m.metin}
                  {davet && (
                    <DavetKartiSohbet
                      davet={davet}
                      benimId={benimId}
                      onYanit={(kabul) => void davetiYanitla(davet, kabul)}
                    />
                  )}
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

      <div className="px-5 pb-[calc(1rem+var(--safe-bottom))] pt-3 border-t border-ink-100/40 safe-x shrink-0 bg-cream-100">
        <div className="flex items-end gap-2">
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
            className="flex-1 bg-cream-50 border border-ink-100/40 rounded-2xl px-4 py-3 text-ink-700 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral-200 transition-all resize-none max-h-32"
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

// Sohbetteki plan daveti kartı. Baloncuğun içinde durduğu için kendi
// rengini baloncuktan bağımsız tutuyoruz — koyu temada da okunur kalsın.
function DavetKartiSohbet({
  davet,
  benimId,
  onYanit,
}: {
  davet: PlanDaveti
  benimId: string
  onYanit: (kabul: boolean) => void
}) {
  const [isleniyor, setIsleniyor] = useState(false)
  const bana = davet.alan_id === benimId
  const bekliyor = davet.durum === 'bekliyor'

  return (
    <div className="mt-2 rounded-xl bg-cream-50 border border-ink-100/50 p-3 text-ink-700">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon name="CalendarClock" className="w-3.5 h-3.5 text-coral-500 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-coral-600">
          Plan daveti
        </span>
      </div>
      <p className="text-sm font-semibold leading-snug">{davet.baslik}</p>
      <p className="text-xs text-ink-400 mt-0.5">
        {formatDate(davet.tarih) ?? davet.tarih}
        {davet.saat && ` · ${davet.saat.slice(0, 5)}`}
        {davet.sure ? ` · ${davet.sure} dk` : ''}
      </p>
      {davet.konum && (
        <p className="flex items-center gap-1 text-xs text-ink-500 mt-1">
          <Icon name="MapPin" className="w-3 h-3 text-coral-500 shrink-0" />
          {davet.konum}
        </p>
      )}
      {davet.mesaj && <p className="text-xs text-ink-400 mt-1.5">{davet.mesaj}</p>}

      {bekliyor && bana ? (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => {
              setIsleniyor(true)
              onYanit(false)
            }}
            disabled={isleniyor}
            className="flex-1 rounded-xl bg-cream-100 border border-ink-100/40 text-ink-500 text-xs font-semibold py-2 active:scale-95 transition-transform disabled:opacity-50"
          >
            Uymuyor
          </button>
          <button
            onClick={() => {
              setIsleniyor(true)
              onYanit(true)
            }}
            disabled={isleniyor}
            className="flex-1 rounded-xl bg-coral-500 text-white text-xs font-semibold py-2 active:scale-95 transition-transform disabled:opacity-50"
          >
            Geliyorum
          </button>
        </div>
      ) : (
        <p
          className={`text-[11px] mt-2 font-medium ${
            davet.durum === 'kabul'
              ? 'text-teal-600'
              : davet.durum === 'red'
                ? 'text-ink-400'
                : 'text-ink-300'
          }`}
        >
          {davet.durum === 'kabul'
            ? 'Kabul edildi'
            : davet.durum === 'red'
              ? 'Reddedildi'
              : 'Yanıt bekleniyor'}
        </p>
      )}
    </div>
  )
}
