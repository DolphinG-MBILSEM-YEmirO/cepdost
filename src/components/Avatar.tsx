import { useEffect, useState } from 'react'
import { avatarUrlleri } from '../sosyal/avatar'

// Profil fotoğrafı yoksa ada göre sabit renkli baş harf. Fotoğraf varsa
// imzalı URL ile gösteriliyor (kova özel — bkz. sosyal/avatar.ts).

const OLCULER = {
  sm: 'w-9 h-9 text-sm',
  md: 'w-11 h-11 text-base',
  lg: 'w-20 h-20 text-2xl',
} as const

export type AvatarBoyut = keyof typeof OLCULER

const PALETLER = [
  'bg-coral-100 text-coral-700',
  'bg-teal-100 text-teal-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
]

function adaGoreRenk(ad: string): string {
  let toplam = 0
  for (let i = 0; i < ad.length; i++) toplam += ad.charCodeAt(i)
  return PALETLER[toplam % PALETLER.length]
}

// İmzalı URL'i çözer. avatarUrlleri kendi içinde önbellekli ve aynı yolu
// isteyen eşzamanlı çağrıları tek isteğe indiriyor — bu yüzden her satırda
// ayrı ayrı çağırmak sorun değil.
export function useAvatarUrl(yol: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!yol) {
      setUrl(null)
      return
    }
    let iptal = false
    avatarUrlleri([yol])
      .then((harita) => {
        if (!iptal) setUrl(harita.get(yol) ?? null)
      })
      .catch(() => {
        // İmza alınamadıysa baş harfe düşüyoruz — hata göstermeye değmez.
        if (!iptal) setUrl(null)
      })
    return () => {
      iptal = true
    }
  }, [yol])

  return url
}

interface Props {
  ad: string
  avatarYol?: string | null
  boyut?: AvatarBoyut
}

export function Avatar({ ad, avatarYol, boyut = 'md' }: Props) {
  const url = useAvatarUrl(avatarYol)
  const harf = (ad.trim()[0] ?? '?').toLocaleUpperCase('tr-TR')
  const olcu = OLCULER[boyut]

  if (url) {
    return (
      // Avatarlar 256px/~2 KB — loading="lazy" burada kazanç sağlamıyor,
      // sadece görünürlüğe bağlı bir yükleme riski ekliyor.
      <img
        src={url}
        alt={ad}
        className={`${olcu} rounded-2xl object-cover shrink-0 bg-cream-100`}
      />
    )
  }

  return (
    <div
      className={`${olcu} ${adaGoreRenk(ad)} rounded-2xl flex items-center justify-center font-bold shrink-0`}
    >
      {harf}
    </div>
  )
}
