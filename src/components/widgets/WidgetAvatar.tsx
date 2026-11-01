import type { WidgetPerson } from '../../widgets/types'

// A person on a widget: photo, else emoji or initial on their colour. Sized
// by the caller; `ring` is the border that separates stacked avatars.
interface Props {
  person: WidgetPerson
  className?: string
  ring?: string
}

export function WidgetAvatar({ person, className = 'w-8 h-8 text-xs', ring = 'ring-2 ring-white' }: Props) {
  if (person.photo) {
    return <img src={person.photo} alt={person.name} className={`${className} ${ring} rounded-full object-cover shrink-0 bg-white`} />
  }
  const initial = (person.name.trim()[0] ?? '?').toLocaleUpperCase('tr-TR')
  return (
    <div
      aria-label={person.name}
      className={`${className} ${ring} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ background: `linear-gradient(135deg, ${person.color}, color-mix(in srgb, ${person.color} 70%, black))` }}
    >
      {person.emoji || initial}
    </div>
  )
}

// Overlapping avatars that pop in one after another, with "+N" for the rest.
export function AvatarStack({ people, max = 4, size = 'w-8 h-8 text-xs' }: { people: WidgetPerson[]; max?: number; size?: string }) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <div className="flex items-center -space-x-2.5">
      {shown.map((p, i) => (
        <div key={p.id} className="animate-pop-in" style={{ animationDelay: `${120 + i * 70}ms`, animationFillMode: 'both' }}>
          <WidgetAvatar person={p} className={size} ring="ring-2 ring-white/90" />
        </div>
      ))}
      {rest > 0 && (
        <div
          className={`${size} rounded-full ring-2 ring-white/90 bg-white/25 backdrop-blur text-white font-bold flex items-center justify-center animate-pop-in`}
          style={{ animationDelay: `${120 + shown.length * 70}ms`, animationFillMode: 'both' }}
        >
          +{rest}
        </div>
      )}
    </div>
  )
}
