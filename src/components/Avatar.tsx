import { renkAl } from '../lib/kisisellestirme'

// Profile photo when there is one; otherwise the person's emoji or the
// first letter of their name, on their chosen colour (or one derived from
// the name).

const OLCULER = {
  sm: 'w-9 h-9 text-sm',
  md: 'w-11 h-11 text-base',
  lg: 'w-20 h-20 text-2xl',
} as const

export type AvatarBoyut = keyof typeof OLCULER

interface Props {
  ad: string
  // Data URL of the photo.
  foto?: string | null
  emoji?: string | null
  renk?: string | null
  boyut?: AvatarBoyut
}

export function Avatar({ ad, foto, emoji, renk, boyut = 'md' }: Props) {
  const olcu = OLCULER[boyut]

  if (foto) {
    return <img src={foto} alt={ad} className={`${olcu} rounded-2xl object-cover shrink-0 bg-cream-100`} />
  }

  const harf = (ad.trim()[0] ?? '?').toLocaleUpperCase('tr-TR')
  return (
    <div
      className={`${olcu} ${renkAl(renk, ad).yumusak} rounded-2xl flex items-center justify-center font-bold shrink-0`}
      aria-label={ad}
    >
      {emoji || harf}
    </div>
  )
}
