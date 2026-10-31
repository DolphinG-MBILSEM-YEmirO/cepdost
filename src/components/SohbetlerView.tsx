import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { BosDurum } from '../ui/BosDurum'
import { Avatar, GrupAvatari } from './Avatar'
import { DirektSohbet } from './DirektSohbet'
import { BildirimBandi } from './BildirimAyarlari'
import { GrupDetay } from './GrupDetay'
import { MesajSonucuSatiri } from './MesajArama'
import { useAuth } from '../sosyal/auth'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { sohbetleriGetir, type Sohbet } from '../sosyal/mesajlar'
import { arkadaslariGetir, type Arkadas, type Profil } from '../sosyal/api'
import type { Grup } from '../sosyal/gruplar'
import { formatRelativeTime } from '../lib/format'
import { aramaSorgusu, eslesiyor } from '../lib/arama'
import { mesajlardaAra, type MesajSonucu } from '../sosyal/mesajArama'
import { useMasaustu } from '../lib/useMasaustu'

// Arkadaşlarla birebir yazışmalar ve grup sohbetleri tek listede.
// Henüz yazışılmamış arkadaş/grup da listede kalıyor — yoksa yeni bir
// sohbet başlatmanın yolu olmazdı.
// Phone: the list, with a chat opening over it. Desktop: the list on the
// left and the open chat beside it.
interface Props {
  onDegisti?: () => void
  // The Sohbetler/Arkadaşlar switch, shown as the page header.
  ust: ReactNode
  // Opens the friends side, from the empty state.
  onArkadasEkle: () => void
  // Opened from a notification: this chat (a friend's or a group's id).
  acilacak?: string | null
  onAcildi?: () => void
}

export function SohbetlerView({ onDegisti, ust, onArkadasEkle, acilacak, onAcildi }: Props) {
  const { kullanici } = useAuth()
  const sosyalSurum = useSosyalSurum()
  const [sohbetler, setSohbetler] = useState<Sohbet[] | null>(null)
  const [arkadaslar, setArkadaslar] = useState<Arkadas[]>([])
  const [hata, setHata] = useState<string | null>(null)
  const [acikArkadas, setAcikArkadas] = useState<Profil | null>(null)
  const [acikGrup, setAcikGrup] = useState<Grup | null>(null)
  // The message to bring into view when a chat opens from a search.
  const [odakMesaj, setOdakMesaj] = useState<string | null>(null)
  const [arama, setArama] = useState('')
  const [mesajSonuclari, setMesajSonuclari] = useState<MesajSonucu[] | null>(null)
  const masaustu = useMasaustu()
  const sorgu = aramaSorgusu(arama)

  const tazele = useCallback(async () => {
    setHata(null)
    try {
      const [liste, ark] = await Promise.all([sohbetleriGetir(), arkadaslariGetir()])
      setSohbetler(liste)
      // With pending requests too: a group's members show where each stands.
      setArkadaslar(ark)
      onDegisti?.()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Sohbetler alınamadı')
      setSohbetler((eski) => eski ?? [])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDegisti, sosyalSurum])

  useEffect(() => {
    void tazele()
  }, [tazele])

  // Messages are searched a moment after typing stops.
  useEffect(() => {
    if (!sorgu || !sohbetler) {
      setMesajSonuclari(null)
      return
    }
    let iptal = false
    const t = window.setTimeout(() => {
      void mesajlardaAra(sorgu, sohbetler)
        .then((r) => !iptal && setMesajSonuclari(r))
        .catch(() => !iptal && setMesajSonuclari([]))
    }, 200)
    return () => {
      iptal = true
      window.clearTimeout(t)
    }
  }, [sorgu, sohbetler])

  const eslesenSohbetler = useMemo(
    () => (sorgu && sohbetler ? sohbetler.filter((s) => eslesiyor(s.ad, sorgu) || (!!s.kullaniciAdi && eslesiyor(s.kullaniciAdi, sorgu))) : []),
    [sorgu, sohbetler],
  )

  useEffect(() => {
    if (!acilacak || sohbetler === null) return
    const s = sohbetler.find((x) => x.id === acilacak)
    if (s?.tur === 'grup') {
      setAcikArkadas(null)
      setAcikGrup(s.grup!)
    } else if (s) {
      setAcikGrup(null)
      setAcikArkadas(s.profil!)
    }
    onAcildi?.()
  }, [acilacak, sohbetler, onAcildi])

  // The app gate only renders this screen after sign-in.
  if (!kullanici) return null

  const yazisilmis = sohbetler?.filter((s) => s.sonZaman) ?? []
  const bos = sohbetler?.filter((s) => !s.sonZaman) ?? []
  const aciksa = (s: Sohbet) => (s.tur === 'grup' ? acikGrup?.id === s.id : acikArkadas?.id === s.id)

  function ac(s: Sohbet, mesajId: string | null = null) {
    setOdakMesaj(mesajId)
    if (s.tur === 'grup') {
      setAcikArkadas(null)
      setAcikGrup(s.grup!)
    } else {
      setAcikGrup(null)
      setAcikArkadas(s.profil!)
    }
  }

  const sohbetPenceresi = acikArkadas ? (
    <DirektSohbet
      key={`${acikArkadas.id}:${odakMesaj ?? ''}`}
      arkadas={acikArkadas}
      benimId={kullanici.id}
      gomulu={masaustu}
      odakMesajId={odakMesaj}
      onClose={() => {
        setAcikArkadas(null)
        void tazele()
      }}
    />
  ) : acikGrup ? (
    <GrupDetay
      key={`${acikGrup.id}:${odakMesaj ?? ''}`}
      grup={acikGrup}
      benimId={kullanici.id}
      arkadaslar={arkadaslar}
      gomulu={masaustu}
      odakMesajId={odakMesaj}
      onClose={() => {
        setAcikGrup(null)
        void tazele()
      }}
      onAyrildi={async () => {
        setAcikGrup(null)
        await tazele()
      }}
    />
  ) : null

  return (
    <div className="flex flex-col h-full lg:flex-row lg:h-screen">
      <div className="flex flex-col h-full min-h-0 lg:w-[360px] lg:shrink-0 lg:border-r lg:border-ink-100">
        <div className="lg:px-4">{ust}</div>

        <div className="flex-1 overflow-y-auto px-4 pb-24 lg:pb-6">
          {hata && (
            <div role="alert" className="flex items-start gap-2.5 bg-white border border-rose-200 rounded-xl px-4 py-3 mb-4">
              <Icon name="AlertCircle" className="w-5 h-5 text-rose-600 shrink-0" />
              <p className="text-callout font-normal text-ink-700">{hata}</p>
            </div>
          )}

          {sohbetler && sohbetler.length > 0 && <BildirimBandi />}

          {sohbetler && sohbetler.length > 0 && (
            <div className="relative mb-3" role="search">
              <Icon name="Search" className="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={arama}
                onChange={(e) => setArama(e.target.value)}
                placeholder="Sohbetlerde ara"
                aria-label="Sohbetlerde ara"
                enterKeyHint="search"
                className="input-field pl-10 py-2.5 text-sm"
              />
            </div>
          )}

          {sorgu && sohbetler ? (
            <AramaSonuclari
              sorgu={sorgu}
              sohbetler={eslesenSohbetler}
              mesajlar={mesajSonuclari}
              secili={(s) => masaustu && aciksa(s)}
              onSohbet={(s) => ac(s)}
              onMesaj={(r) => ac(r.sohbet, r.mesajId)}
            />
          ) : sohbetler === null ? (
            <div className="card divide-y divide-ink-100/70 overflow-hidden kademeli">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="skeleton w-11 h-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3.5 w-1/2 rounded-md" />
                    <div className="skeleton h-3 w-3/4 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : sohbetler.length === 0 ? (
            <BosDurum
              ikon="MessagesSquare"
              baslik="Henüz sohbet yok"
              aciklama="Arkadaş ekle ya da grup kur; sohbetlerin burada görünür."
              eylem={{ etiket: 'Arkadaş ekle', ikon: 'UserPlus', onClick: onArkadasEkle }}
            />
          ) : (
            <div className="space-y-5">
              {yazisilmis.length > 0 && (
              <div className="card divide-y divide-ink-100/70 overflow-hidden kademeli">
              {yazisilmis.map((s) => (
                <SohbetSatiri
                  key={`${s.tur}-${s.id}`}
                  sohbet={s}
                  secili={masaustu && aciksa(s)}
                  onAc={() => ac(s)}
                />
              ))}
              </div>
              )}

              {bos.length > 0 && (
                <section>
                  {yazisilmis.length > 0 && <h2 className="text-label text-ink-500 px-1 mb-2">Yeni sohbet başlat</h2>}
                  <div className="card divide-y divide-ink-100/70 overflow-hidden kademeli">
                  {bos.map((s) => (
                    <SohbetSatiri
                      key={`${s.tur}-${s.id}`}
                      sohbet={s}
                      secili={masaustu && aciksa(s)}
                      onAc={() => ac(s)}
                    />
                  ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

      </div>

      {masaustu ? (
        <section className="flex-1 min-w-0 flex flex-col">{sohbetPenceresi ?? <SohbetSecilmedi />}</section>
      ) : (
        sohbetPenceresi
      )}
    </div>
  )
}

// While searching: chats whose name matches, then messages, newest first.
function AramaSonuclari({
  sorgu,
  sohbetler,
  mesajlar,
  secili,
  onSohbet,
  onMesaj,
}: {
  sorgu: string
  sohbetler: Sohbet[]
  mesajlar: MesajSonucu[] | null
  secili: (s: Sohbet) => boolean
  onSohbet: (s: Sohbet) => void
  onMesaj: (r: MesajSonucu) => void
}) {
  const baslik = 'text-label text-ink-500 pt-2 pb-1 px-1'
  if (sohbetler.length === 0 && mesajlar?.length === 0) {
    return <p className="text-sm text-ink-400 text-center py-10">Bir şey bulunamadı.</p>
  }
  return (
    <div className="space-y-2">
      {sohbetler.length > 0 && (
        <>
          <p className={baslik}>Sohbetler</p>
          <div className="card divide-y divide-ink-100/70 overflow-hidden kademeli">
            {sohbetler.map((s) => (
              <SohbetSatiri key={`${s.tur}-${s.id}`} sohbet={s} secili={secili(s)} onAc={() => onSohbet(s)} />
            ))}
          </div>
        </>
      )}
      <p className={baslik}>Mesajlar</p>
      {mesajlar === null ? (
        <div className="flex justify-center py-4">
          <Icon name="Loader2" className="w-5 h-5 animate-spin text-ink-400" />
        </div>
      ) : mesajlar.length === 0 ? (
        <p className="text-sm text-ink-400 px-1 py-2">Mesajlarda geçmiyor.</p>
      ) : (
        <div className="card divide-y divide-ink-100/70 overflow-hidden kademeli">
          {mesajlar.map((r) => (
            <MesajSonucuSatiri key={`${r.sohbet.id}-${r.mesajId}`} sonuc={r} sorgu={sorgu} onAc={() => onMesaj(r)} />
          ))}
        </div>
      )}
    </div>
  )
}

function SohbetSecilmedi() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <BosDurum ikon="MessagesSquare" baslik="Bir sohbet seç" aciklama="Soldan bir arkadaşını ya da grubunu seç; mesajlar ve planlar burada açılır." />
    </div>
  )
}

function SohbetSatiri({ sohbet, secili = false, onAc }: { sohbet: Sohbet; secili?: boolean; onAc: () => void }) {
  return (
    <button
      onClick={onAc}
      aria-current={secili ? 'true' : undefined}
      className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
        secili ? 'bg-brand-50' : 'hover:bg-ink-50/60 active:bg-ink-50'
      }`}
    >
      {sohbet.tur === 'grup' && sohbet.grup ? (
        <GrupAvatari grup={sohbet.grup} />
      ) : (
        <Avatar ad={sohbet.ad} foto={sohbet.avatar} emoji={sohbet.profil?.emoji} renk={sohbet.profil?.renk} />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-body font-semibold text-ink-800 truncate flex-1">{sohbet.ad}</p>
          {sohbet.sonZaman && (
            <span className={`text-caption shrink-0 tabular-nums ${sohbet.okunmamis > 0 ? 'text-bolum-koyu font-bold' : 'text-ink-400 font-normal'}`}>
              {formatRelativeTime(new Date(sohbet.sonZaman).getTime())}
            </span>
          )}
        </div>
        <p
          className={`text-callout truncate mt-0.5 ${
            sohbet.okunmamis > 0 ? 'text-ink-700 font-medium' : 'text-ink-400 font-normal'
          }`}
        >
          {sohbet.sonMesaj ?? (sohbet.tur === 'grup' ? 'Grup sohbeti' : 'Yeni sohbet')}
        </p>
      </div>

      {sohbet.okunmamis > 0 && (
        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-bolum text-white text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums shadow-glow animate-pop-in">
          {sohbet.okunmamis > 9 ? '9+' : sohbet.okunmamis}
        </span>
      )}
    </button>
  )
}
