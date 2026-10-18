import { Icon } from './Icon'
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
    return <img src={foto} alt={ad} className={`${olcu} rounded-2xl object-cover shrink-0 bg-mist-100`} />
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

const IKON_OLCULERI: Record<AvatarBoyut, string> = {
  sm: 'w-[18px] h-[18px]',
  md: 'w-5 h-5',
  lg: 'w-9 h-9',
}

// A group's picture: its emoji (or a people icon) on its colour, so a
// group looks the same in the chat list, its own screen and every picker.
export function GrupAvatari({
  grup,
  boyut = 'md',
}: {
  grup: { ad: string; emoji: string | null; renk: string | null }
  boyut?: AvatarBoyut
}) {
  return (
    <div
      className={`${OLCULER[boyut]} ${renkAl(grup.renk, grup.ad).yumusak} rounded-2xl flex items-center justify-center shrink-0`}
      aria-label={grup.ad}
    >
      {grup.emoji ? (
        <span className={boyut === 'lg' ? 'text-4xl' : 'text-lg'}>{grup.emoji}</span>
      ) : (
        <Icon name="Users" className={IKON_OLCULERI[boyut]} />
      )}
    </div>
  )
}
