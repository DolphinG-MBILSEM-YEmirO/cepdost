import { useEffect, useState } from 'react'

// F18 — sohbet teması. Tamamen cihaza özel bir tercih: sunucuya gitmesinin
// bir anlamı yok, karşı taraf senin temanı görmüyor (WhatsApp/Telegram da
// böyle çalışıyor). Bu yüzden localStorage yeterli — hesap gerektirmiyor,
// çevrimdışı çalışıyor.

export interface SohbetTemasi {
  id: string
  ad: string
  // Baloncuklar
  benim: string
  benimMetin: string
  karsi: string
  karsiMetin: string
  // Sohbet zemini (Tailwind sınıfı) + üstüne binen desen
  zemin: string
  desen: string
  // Küçük önizleme noktası için
  onizleme: string
}

// Desenler saf CSS gradyan — görsel dosyası yok, yani ek ağ isteği ve
// paket boyutu getirmiyor.
const NOKTA_DESENI =
  'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.045) 1px, transparent 0) 0 0 / 18px 18px'
const CIZGI_DESENI =
  'repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 10px)'

// The first theme is the default: the app's own look. Its id stays
// 'orkide' so the choice people already saved keeps working.
export const TEMALAR: SohbetTemasi[] = [
  {
    id: 'orkide',
    ad: 'Sharloop',
    benim: 'bg-gradient-to-br from-violet-600 to-blue-600 shadow-[0_6px_16px_-8px_rgba(79,70,229,0.7)]',
    benimMetin: 'text-white',
    karsi: 'bg-white shadow-soft',
    karsiMetin: 'text-ink-800',
    zemin: 'bg-mist-100',
    desen: NOKTA_DESENI,
    onizleme: 'bg-gradient-to-br from-violet-600 to-blue-600',
  },
  {
    id: 'okyanus',
    ad: 'Okyanus',
    benim: 'bg-sky-600',
    benimMetin: 'text-white',
    karsi: 'bg-white border border-sky-100',
    karsiMetin: 'text-ink-700',
    zemin: 'bg-sky-50',
    desen: NOKTA_DESENI,
    onizleme: 'bg-sky-600',
  },
  {
    id: 'orman',
    ad: 'Orman',
    benim: 'bg-teal-600',
    benimMetin: 'text-white',
    karsi: 'bg-white border border-teal-100',
    karsiMetin: 'text-ink-700',
    zemin: 'bg-teal-50',
    desen: NOKTA_DESENI,
    onizleme: 'bg-teal-600',
  },
  {
    id: 'gunbatimi',
    ad: 'Gün batımı',
    benim: 'bg-amber-500',
    benimMetin: 'text-white',
    karsi: 'bg-white border border-amber-100',
    karsiMetin: 'text-ink-700',
    zemin: 'bg-amber-50',
    desen: NOKTA_DESENI,
    onizleme: 'bg-amber-500',
  },
  {
    id: 'gece',
    ad: 'Gece',
    benim: 'bg-brand-600',
    benimMetin: 'text-white',
    karsi: 'bg-ink-700/90 border border-ink-500/40',
    karsiMetin: 'text-mist-50',
    zemin: 'bg-ink-800',
    desen: CIZGI_DESENI,
    onizleme: 'bg-ink-800',
  },
  // The app's earlier look, kept for those who picked it.
  {
    id: 'mercan',
    ad: 'Mercan',
    benim: 'bg-coral-500',
    benimMetin: 'text-white',
    karsi: 'bg-white border border-ink-100/70',
    karsiMetin: 'text-ink-700',
    zemin: 'bg-coral-50',
    desen: NOKTA_DESENI,
    onizleme: 'bg-coral-500',
  },
]

const ANAHTAR = 'cepdost_sohbet_tema'
const VARSAYILAN = TEMALAR[0]

export function temayiOku(): SohbetTemasi {
  try {
    const id = localStorage.getItem(ANAHTAR)
    return TEMALAR.find((t) => t.id === id) ?? VARSAYILAN
  } catch {
    return VARSAYILAN
  }
}

// Tema iki ayrı ekranda (grup sohbeti + birebir sohbet) kullanılıyor ve
// ayarlar üçüncü bir ekranda değişiyor. Basit bir olay yayını, her ekranın
// kendi state'ini senkron tutmanın en ucuz yolu.
const OLAY = 'cepdost-sohbet-tema-degisti'

export function temayiYaz(id: string): void {
  localStorage.setItem(ANAHTAR, id)
  window.dispatchEvent(new CustomEvent(OLAY))
}

export function useSohbetTemasi(): SohbetTemasi {
  const [tema, setTema] = useState<SohbetTemasi>(() => temayiOku())

  useEffect(() => {
    const guncelle = () => setTema(temayiOku())
    window.addEventListener(OLAY, guncelle)
    // Başka bir sekmede değiştiyse de yakala.
    window.addEventListener('storage', guncelle)
    return () => {
      window.removeEventListener(OLAY, guncelle)
      window.removeEventListener('storage', guncelle)
    }
  }, [])

  return tema
}
