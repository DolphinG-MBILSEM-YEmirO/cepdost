import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { ConfirmDialog } from './ConfirmDialog'
import { bilinenProfiller, engeliKaldir } from '../sosyal/api'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { engelliListesi, type EngelliKisi } from '../sosyal/engel'

// The people I blocked, with a way to unblock each one (App Store and Play
// both expect a block to be undoable). Unblocking only lets their messages
// and requests show again; it doesn't bring back the friendship.
export function EngelliKisiler() {
  const [liste, setListe] = useState<EngelliKisi[] | null>(null)
  const [adlar, setAdlar] = useState<Map<string, string>>(new Map())
  const [onay, setOnay] = useState<EngelliKisi | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const surum = useSosyalSurum()

  useEffect(() => {
    let iptal = false
    void Promise.all([engelliListesi(), bilinenProfiller()])
      .then(([kisiler, profiller]) => {
        if (iptal) return
        setListe(kisiler)
        // A fellow group member's card can still name an old block.
        setAdlar(new Map([...profiller].map(([id, p]) => [id, p.ad])))
      })
      .catch(() => !iptal && setListe([]))
    return () => {
      iptal = true
    }
  }, [surum])

  if (!liste || liste.length === 0) return null

  const adi = (k: EngelliKisi) => k.ad ?? adlar.get(k.id) ?? 'Engellenen kişi'

  async function kaldir(kisi: EngelliKisi) {
    setOnay(null)
    setHata(null)
    try {
      await engeliKaldir(kisi.id)
      setListe((l) => l?.filter((k) => k.id !== kisi.id) ?? null)
    } catch {
      setHata('Engel kaldırılamadı. İnternet bağlantını kontrol edip tekrar dene.')
    }
  }

  return (
    <div className="mb-5">
      <p className="text-sm text-ink-500 mb-1 font-medium">Engellediklerin</p>
      <p className="text-xs text-ink-400 leading-relaxed mb-3">
        Bu kişilerin mesajları, anıları ve istekleri sana görünmez. Engellendiklerini bilmezler.
      </p>
      <ul className="flex flex-col gap-2">
        {liste.map((k) => (
          <li key={k.id} className="flex items-center gap-3 rounded-2xl bg-mist-50 border border-ink-100 px-3 py-2">
            <Icon name="Ban" className="w-4 h-4 text-ink-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink-600 truncate">{adi(k)}</p>
              {k.kullaniciAdi && <p className="text-xs text-ink-400 truncate">@{k.kullaniciAdi}</p>}
            </div>
            <button onClick={() => setOnay(k)} className="chip bg-white border border-ink-100 text-ink-600 text-xs">
              Engeli kaldır
            </button>
          </li>
        ))}
      </ul>
      {hata && <p className="text-xs text-rose-600 mt-2">{hata}</p>}

      {onay && (
        <ConfirmDialog
          title={`${adi(onay)} için engel kaldırılsın mı?`}
          message="Mesajları ve istekleri yeniden görünür. Arkadaşlığınız geri gelmez; istersen yeniden ekleyebilirsin."
          confirmLabel="Engeli kaldır"
          onConfirm={() => void kaldir(onay)}
          onCancel={() => setOnay(null)}
        />
      )}
    </div>
  )
}
