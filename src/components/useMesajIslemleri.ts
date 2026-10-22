import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSosyalSurum } from '../sosyal/cekirdek'
import type { MesajEkleri, MesajGonderimEki } from '../sosyal/mesajOrtak'
import {
  bendenSil,
  herkestenSil,
  mesajiDuzenle,
  mesajiIlet,
  sabitle,
  sabitMesajId,
  tepkiVer,
  yildizla,
  type SohbetHedefi,
} from '../sosyal/mesajIslemleri'

// State shared by the message actions of one chat screen (see
// MesajIslemleri.tsx for the pieces that draw it). The screen keeps loading
// its messages; this keeps what the person is doing with them: the open
// menu or sheet, the message being answered or edited, the composer's
// text, and the short notes ("Kopyalandı") shown over the chat.

// What both chats' messages have in common.
export type SohbetMesaji = MesajEkleri & {
  id: string
  gonderen_id: string
  metin: string
  olusturulma: string
  davet_id?: string | null
  plan_id?: string | null
  // Direct chats: whether the other person has read my message.
  okundu?: boolean
}

// The reaction bar, as in WhatsApp.
export const HIZLI_TEPKILER = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export const TUM_TEPKILER = [
  '👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉',
  '😍', '🥰', '😘', '😊', '😁', '🤣', '😅', '😉',
  '😎', '🤩', '🥳', '😇', '🤔', '🙄', '😴', '😬',
  '😡', '😭', '😱', '🤯', '🥺', '😤', '🤗', '🤝',
  '👏', '🙌', '💪', '👌', '✌️', '🤞', '👀', '💯',
  '✅', '❌', '⭐', '💙', '💜', '🖤', '☕', '🍕',
]

// Where a menu opened from: the pointer (right-click, options button) or
// null for a long-press, which opens it as a sheet from the bottom.
export type MenuKonumu = { x: number; y: number } | null

const BILDIRI_SURESI_MS = 2200
const VURGU_SURESI_MS = 1600

export function kartliMi(mesaj: SohbetMesaji): boolean {
  return !!(mesaj.davet_id || mesaj.plan_id)
}

// The text a quote or preview shows for a message.
export function mesajOzeti(mesaj: SohbetMesaji): string {
  if (mesaj.silindi) return 'Bu mesaj silindi'
  return mesaj.metin || 'Plan'
}

export function useMesajIslemleri({
  hedef,
  benimId,
  mesajlar,
  adAl,
  gonder,
  onHata,
}: {
  // Memoised by the screen, so effects don't restart on every render.
  hedef: SohbetHedefi
  benimId: string
  mesajlar: SohbetMesaji[]
  // Names for quotes, reactions and read info.
  adAl: (kullaniciId: string) => string
  // Sends a new message (text and its reply or forward fields).
  gonder: (metin: string, ek: MesajGonderimEki) => Promise<void>
  onHata: (mesaj: string | null) => void
}) {
  const [menu, setMenu] = useState<{ mesaj: SohbetMesaji; konum: MenuKonumu } | null>(null)
  const [yanitlanan, setYanitlanan] = useState<SohbetMesaji | null>(null)
  const [duzenlenen, setDuzenlenen] = useState<SohbetMesaji | null>(null)
  const [silinecek, setSilinecek] = useState<SohbetMesaji | null>(null)
  const [iletilen, setIletilen] = useState<SohbetMesaji | null>(null)
  const [bilgisi, setBilgisi] = useState<SohbetMesaji | null>(null)
  // By id: the sheet follows the reactions as they change.
  const [tepkiId, setTepkiId] = useState<string | null>(null)
  const [yildizlilarAcik, setYildizlilarAcik] = useState(false)
  const [vurgulanan, setVurgulanan] = useState<string | null>(null)
  const [bildiri, setBildiri] = useState<string | null>(null)
  const [sabitId, setSabitId] = useState<string | null>(null)
  const [girdi, setGirdi] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const alanRef = useRef<HTMLTextAreaElement>(null)
  // The draft that was in the field when editing started; it comes back after.
  const taslakRef = useRef('')
  const sosyalSurum = useSosyalSurum()

  const harita = useMemo(() => new Map(mesajlar.map((m) => [m.id, m])), [mesajlar])
  const mesajBul = useCallback((id: string) => harita.get(id) ?? null, [harita])
  const kimin = useCallback((id: string) => (id === benimId ? 'Sen' : adAl(id)), [adAl, benimId])

  useEffect(() => {
    let iptal = false
    void sabitMesajId(hedef)
      .then((id) => {
        if (!iptal) setSabitId(id)
      })
      .catch(() => {})
    return () => {
      iptal = true
    }
  }, [hedef, sosyalSurum])

  useEffect(() => {
    if (!bildiri) return
    const t = window.setTimeout(() => setBildiri(null), BILDIRI_SURESI_MS)
    return () => window.clearTimeout(t)
  }, [bildiri])

  useEffect(() => {
    if (!vurgulanan) return
    const t = window.setTimeout(() => setVurgulanan(null), VURGU_SURESI_MS)
    return () => window.clearTimeout(t)
  }, [vurgulanan])

  // Runs an action, showing its error (or a short success note) over the chat.
  const calistir = useCallback(async (is: () => Promise<unknown>, basari?: string) => {
    try {
      await is()
      if (basari) setBildiri(basari)
    } catch (err) {
      setBildiri(err instanceof Error ? err.message : 'Bir şeyler ters gitti.')
    }
  }, [])

  const odakla = () => window.requestAnimationFrame(() => alanRef.current?.focus())

  function yanitla(mesaj: SohbetMesaji) {
    setMenu(null)
    if (duzenlenen) duzenlemeyiBirak()
    setYanitlanan(mesaj)
    odakla()
  }

  function duzenle(mesaj: SohbetMesaji) {
    setMenu(null)
    setYanitlanan(null)
    if (!duzenlenen) taslakRef.current = girdi
    setDuzenlenen(mesaj)
    setGirdi(mesaj.metin)
    odakla()
  }

  function duzenlemeyiBirak() {
    setDuzenlenen(null)
    setGirdi(taslakRef.current)
    taslakRef.current = ''
  }

  // Escape or the bar's close button.
  function yazmaCubugunuKapat() {
    if (duzenlenen) duzenlemeyiBirak()
    setYanitlanan(null)
  }

  async function gonderVeyaKaydet() {
    const metin = girdi.trim()
    if (!metin || gonderiliyor) return
    setGonderiliyor(true)
    onHata(null)
    try {
      if (duzenlenen) {
        await mesajiDuzenle(hedef, duzenlenen.id, metin)
        duzenlemeyiBirak()
      } else {
        setGirdi('')
        const ek: MesajGonderimEki = yanitlanan ? { yanit: { ...yanitlanan, metin: mesajOzeti(yanitlanan) } } : {}
        setYanitlanan(null)
        try {
          await gonder(metin, ek)
        } catch (err) {
          setGirdi(metin)
          setYanitlanan(yanitlanan)
          throw err
        }
      }
    } catch (err) {
      onHata(err instanceof Error ? err.message : 'Mesaj gönderilemedi')
    } finally {
      setGonderiliyor(false)
    }
  }

  // Scrolls to a message and flashes it (quotes, the pinned bar, stars).
  function mesajaGit(id: string) {
    const satir = document.querySelector<HTMLElement>(`[data-mesaj-id="${CSS.escape(id)}"]`)
    if (!satir) {
      setBildiri('Bu mesaj artık sohbette görünmüyor.')
      return
    }
    satir.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setVurgulanan(id)
  }

  return {
    hedef,
    benimId,
    mesajlar,
    mesajBul,
    adAl: kimin,
    menu,
    menuAc: (mesaj: SohbetMesaji, konum: MenuKonumu) => setMenu({ mesaj, konum }),
    menuKapat: () => setMenu(null),
    yanitlanan,
    duzenlenen,
    yanitla,
    duzenle,
    yazmaCubugunuKapat,
    girdi,
    setGirdi,
    gonderiliyor,
    gonderVeyaKaydet,
    alanRef,
    vurgulanan,
    mesajaGit,
    bildiri,
    sabitId,

    tepkiSec: (mesaj: SohbetMesaji, emoji: string | null) => {
      setMenu(null)
      void calistir(() => tepkiVer(hedef, mesaj, emoji))
    },
    kopyala: (mesaj: SohbetMesaji) => {
      setMenu(null)
      // The browser's own errors are in English and say little; one plain sentence instead.
      const kopya = async () => {
        try {
          await navigator.clipboard.writeText(mesaj.metin)
        } catch {
          throw new Error('Kopyalanamadı.')
        }
      }
      void calistir(kopya, 'Kopyalandı')
    },
    sabitDegistir: (mesaj: SohbetMesaji | null) => {
      setMenu(null)
      const id = mesaj && mesaj.id !== sabitId ? mesaj.id : null
      void calistir(() => sabitle(hedef, id), id ? 'Mesaj sabitlendi' : 'Sabitleme kaldırıldı')
    },
    yildizDegistir: (mesaj: SohbetMesaji) => {
      setMenu(null)
      void calistir(() => yildizla(mesaj.id, !mesaj.yildizli), mesaj.yildizli ? 'Yıldız kaldırıldı' : 'Yıldızlandı')
    },

    silinecek,
    silmeyiSor: (mesaj: SohbetMesaji) => {
      setMenu(null)
      setSilinecek(mesaj)
    },
    silmeyiKapat: () => setSilinecek(null),
    sil: (mesaj: SohbetMesaji, herkesten: boolean) => {
      setSilinecek(null)
      if (yanitlanan?.id === mesaj.id) setYanitlanan(null)
      if (duzenlenen?.id === mesaj.id) duzenlemeyiBirak()
      void calistir(() => (herkesten ? herkestenSil(hedef, mesaj.id) : bendenSil(mesaj.id)), 'Mesaj silindi')
    },

    iletilen,
    iletmeyiAc: (mesaj: SohbetMesaji) => {
      setMenu(null)
      setIletilen(mesaj)
    },
    iletmeyiKapat: () => setIletilen(null),
    ilet: async (mesaj: SohbetMesaji, hedefler: SohbetHedefi[]) => {
      try {
        const ulasan = await mesajiIlet(mesaj.metin, hedefler)
        setIletilen(null)
        setBildiri(ulasan === hedefler.length ? 'İletildi' : `${ulasan} sohbete iletildi, ${hedefler.length - ulasan} sohbete iletilemedi`)
      } catch (err) {
        setBildiri(err instanceof Error ? err.message : 'Mesaj iletilemedi.')
      }
    },

    bilgisi,
    bilgiyiAc: (mesaj: SohbetMesaji) => {
      setMenu(null)
      setBilgisi(mesaj)
    },
    bilgiyiKapat: () => setBilgisi(null),

    tepkileri: tepkiId ? (harita.get(tepkiId) ?? null) : null,
    tepkileriAc: (mesaj: SohbetMesaji) => setTepkiId(mesaj.id),
    tepkileriKapat: () => setTepkiId(null),

    yildizlilarAcik,
    yildizlilariAc: () => setYildizlilarAcik(true),
    yildizlilariKapat: () => setYildizlilarAcik(false),
  }
}

export type MesajIslemleri = ReturnType<typeof useMesajIslemleri>
