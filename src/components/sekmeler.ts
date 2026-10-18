import type { IconName } from './Icon'

// The app's main tabs, shared by the phone bottom bar and the desktop
// sidebar so both always list the same places.
export type Tab = 'planlar' | 'sohbet' | 'akis' | 'profil'

export interface SekmeTanimi {
  id: Tab
  label: string
  icon: IconName
}

// Left and right of the "+" button in the bottom bar.
export const SOL_TABLAR: SekmeTanimi[] = [
  { id: 'planlar', label: 'Planlar', icon: 'CalendarDays' },
  { id: 'sohbet', label: 'Sohbet', icon: 'MessagesSquare' },
]

export const SAG_TABLAR: SekmeTanimi[] = [
  { id: 'akis', label: 'Akış', icon: 'ImageIcon' },
  // Klasik profil simgesi: yuvarlak baş + gövde.
  { id: 'profil', label: 'Profil', icon: 'UserRound' },
]

export const TABLAR: SekmeTanimi[] = [...SOL_TABLAR, ...SAG_TABLAR]
