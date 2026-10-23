import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
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
        <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3 lg:pt-8">{ust}</div>

        <div className="flex-1 overflow-y-auto px-5 pb-24 lg:pb-6">
          {hata && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mb-4">
              <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700">{hata}</p>
            </div>
          )}

          {sohbetler && sohbetler.length > 0 && <BildirimBandi />}

          {sohbetler && sohbetler.length > 0 && (
            <div className="relative mb-3" role="search">
              <Icon name="Search" className="w-4 h-4 text-ink-300 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-2xl" />
              ))}
            </div>
          ) : sohbetler.length === 0 ? (
            <div className="card p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-orchid-100 flex items-center justify-center mx-auto mb-3">
                <Icon name="MessagesSquare" className="w-7 h-7 text-orchid-500" />
              </div>
              <p className="font-semibold text-ink-600 mb-1">Henüz sohbet yok</p>
              <p className="text-sm text-ink-400 mb-4">
                Arkadaş ekle ya da grup kur, sohbetler burada görünsün.
              </p>
              <button
                onClick={onArkadasEkle}
                className="btn-primary text-sm px-4 py-2.5 inline-flex items-center gap-2"
              >
                <Icon name="UserPlus" className="w-4 h-4" />
                Arkadaş ekle
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {yazisilmis.map((s) => (
                <SohbetSatiri
                  key={`${s.tur}-${s.id}`}
                  sohbet={s}
                  secili={masaustu && aciksa(s)}
                  onAc={() => ac(s)}
                />
              ))}

              {bos.length > 0 && (
                <>
                  {yazisilmis.length > 0 && (
                    <p className="text-xs font-semibold text-ink-300 uppercase tracking-wide pt-4 pb-1 px-1">
                      Yeni sohbet başlat
                    </p>
                  )}
                  {bos.map((s) => (
                    <SohbetSatiri
                      key={`${s.tur}-${s.id}`}
                      sohbet={s}
                      secili={masaustu && aciksa(s)}
                      onAc={() => ac(s)}
                    />
                  ))}
                </>
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
  const baslik = 'text-xs font-semibold text-ink-300 uppercase tracking-wide pt-2 pb-1 px-1'
  if (sohbetler.length === 0 && mesajlar?.length === 0) {
    return <p className="text-sm text-ink-400 text-center py-10">Bir şey bulunamadı.</p>
  }
  return (
    <div className="space-y-2">
      {sohbetler.length > 0 && (
        <>
          <p className={baslik}>Sohbetler</p>
          {sohbetler.map((s) => (
            <SohbetSatiri key={`${s.tur}-${s.id}`} sohbet={s} secili={secili(s)} onAc={() => onSohbet(s)} />
          ))}
        </>
      )}
      <p className={baslik}>Mesajlar</p>
      {mesajlar === null ? (
        <div className="flex justify-center py-4">
          <Icon name="Loader2" className="w-5 h-5 animate-spin text-ink-300" />
        </div>
      ) : mesajlar.length === 0 ? (
        <p className="text-sm text-ink-400 px-1 py-2">Mesajlarda geçmiyor.</p>
      ) : (
        mesajlar.map((r) => <MesajSonucuSatiri key={`${r.sohbet.id}-${r.mesajId}`} sonuc={r} sorgu={sorgu} onAc={() => onMesaj(r)} />)
      )}
    </div>
  )
}

function SohbetSecilmedi() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div className="w-16 h-16 rounded-3xl bg-orchid-100 flex items-center justify-center mb-4">
        <Icon name="MessagesSquare" className="w-8 h-8 text-orchid-500" />
      </div>
      <p className="font-semibold text-ink-600 mb-1">Bir sohbet seç</p>
      <p className="text-sm text-ink-400 max-w-xs">
        Soldan bir arkadaşını ya da grubunu seç; mesajlar ve planlar burada açılır.
      </p>
    </div>
  )
}

function SohbetSatiri({ sohbet, secili = false, onAc }: { sohbet: Sohbet; secili?: boolean; onAc: () => void }) {
  return (
    <button
      onClick={onAc}
      aria-current={secili ? 'true' : undefined}
      className={`w-full card p-3 flex items-center gap-3 text-left active:scale-[0.98] transition-all lg:hover:border-orchid-200 ${
        secili ? 'ring-2 ring-orchid-300 border-transparent' : ''
      }`}
    >
      {sohbet.tur === 'grup' && sohbet.grup ? (
        <GrupAvatari grup={sohbet.grup} />
      ) : (
        <Avatar ad={sohbet.ad} foto={sohbet.avatar} emoji={sohbet.profil?.emoji} renk={sohbet.profil?.renk} />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-ink-700 truncate flex-1">{sohbet.ad}</p>
          {sohbet.sonZaman && (
            <span className="text-[11px] text-ink-300 shrink-0">
              {formatRelativeTime(new Date(sohbet.sonZaman).getTime())}
            </span>
          )}
        </div>
        <p
          className={`text-xs truncate mt-0.5 ${
            sohbet.okunmamis > 0 ? 'text-ink-600 font-medium' : 'text-ink-400'
          }`}
        >
          {sohbet.sonMesaj ?? (sohbet.tur === 'grup' ? 'Grup sohbeti' : 'Yeni sohbet')}
        </p>
      </div>

      {sohbet.okunmamis > 0 && (
        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
          {sohbet.okunmamis > 9 ? '9+' : sohbet.okunmamis}
        </span>
      )}
    </button>
  )
}
