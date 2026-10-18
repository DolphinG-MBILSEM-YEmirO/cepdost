import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { DirektSohbet } from './DirektSohbet'
import { GrupDetay } from './GrupDetay'
import { GirisEkrani } from './GirisEkrani'
import { useAuth } from '../sosyal/auth'
import { sohbetleriGetir, type Sohbet } from '../sosyal/mesajlar'
import { arkadaslariGetir, type Arkadas, type Profil } from '../sosyal/api'
import type { Grup } from '../sosyal/gruplar'
import { formatRelativeTime } from '../lib/format'

// Arkadaşlarla birebir yazışmalar ve grup sohbetleri tek listede.
// Henüz yazışılmamış arkadaş/grup da listede kalıyor — yoksa yeni bir
// sohbet başlatmanın yolu olmazdı.
export function SohbetlerView({ onDegisti }: { onDegisti?: () => void }) {
  const { kullanici, yukleniyor: authYukleniyor } = useAuth()
  const [sohbetler, setSohbetler] = useState<Sohbet[] | null>(null)
  const [arkadaslar, setArkadaslar] = useState<Arkadas[]>([])
  const [hata, setHata] = useState<string | null>(null)
  const [acikArkadas, setAcikArkadas] = useState<Profil | null>(null)
  const [acikGrup, setAcikGrup] = useState<Grup | null>(null)

  const tazele = useCallback(async () => {
    setHata(null)
    try {
      const [liste, ark] = await Promise.all([sohbetleriGetir(), arkadaslariGetir()])
      setSohbetler(liste)
      setArkadaslar(ark.filter((a) => a.durum === 'kabul'))
      onDegisti?.()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Sohbetler alınamadı')
      setSohbetler([])
    }
  }, [onDegisti])

  useEffect(() => {
    if (kullanici) void tazele()
  }, [kullanici, tazele])

  if (authYukleniyor) {
    return (
      <div className="flex items-center justify-center h-full">
        <Icon name="Loader2" className="w-6 h-6 animate-spin text-ink-300" />
      </div>
    )
  }

  if (!kullanici) {
    return (
      <GirisEkrani
        baslik="Sohbet"
        altBaslik="Arkadaşların ve grupların"
        tanitimBaslik="Konuşmaya devam et"
        tanitimMetin="Arkadaşlarınla birebir yazış, gruplarında planı konuş — hepsi tek yerde."
      />
    )
  }

  const yazisilmis = sohbetler?.filter((s) => s.sonZaman) ?? []
  const bos = sohbetler?.filter((s) => !s.sonZaman) ?? []

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
        <h1 className="font-display text-2xl font-bold text-ink-700">Sohbet</h1>
        <p className="text-sm text-ink-400 mt-0.5">Arkadaşların ve grupların</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mb-4">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        {sohbetler === null ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-2xl" />
            ))}
          </div>
        ) : sohbetler.length === 0 ? (
          <div className="card p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-coral-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="MessagesSquare" className="w-7 h-7 text-coral-500" />
            </div>
            <p className="font-semibold text-ink-600 mb-1">Henüz sohbet yok</p>
            <p className="text-sm text-ink-400">
              Profil sekmesinden arkadaş ekle ya da grup kur, sohbetler burada görünsün.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {yazisilmis.map((s) => (
              <SohbetSatiri
                key={`${s.tur}-${s.id}`}
                sohbet={s}
                onAc={() => (s.tur === 'grup' ? setAcikGrup(s.grup!) : setAcikArkadas(s.profil!))}
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
                    onAc={() => (s.tur === 'grup' ? setAcikGrup(s.grup!) : setAcikArkadas(s.profil!))}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {acikArkadas && (
        <DirektSohbet
          arkadas={acikArkadas}
          benimId={kullanici.id}
          onClose={() => {
            setAcikArkadas(null)
            void tazele()
          }}
        />
      )}

      {acikGrup && (
        <GrupDetay
          grup={acikGrup}
          benimId={kullanici.id}
          arkadaslar={arkadaslar}
          onClose={() => {
            setAcikGrup(null)
            void tazele()
          }}
          onAyrildi={async () => {
            setAcikGrup(null)
            await tazele()
          }}
        />
      )}
    </div>
  )
}

function SohbetSatiri({ sohbet, onAc }: { sohbet: Sohbet; onAc: () => void }) {
  return (
    <button
      onClick={onAc}
      className="w-full card p-3 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
    >
      {sohbet.tur === 'grup' ? (
        <div className="w-11 h-11 rounded-2xl bg-sky-100 flex items-center justify-center shrink-0">
          <Icon name="Users" className="w-5 h-5 text-sky-600" />
        </div>
      ) : (
        <Avatar ad={sohbet.ad} avatarYol={sohbet.avatarYol} />
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
