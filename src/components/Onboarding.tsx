import { useState } from 'react'
import { Icon, type IconName } from './Icon'

interface OnboardingProps {
  onDone: () => void
}

const steps = [
  {
    icon: 'Share2' as IconName,
    title: 'Paylaş, planla',
    desc: 'Bir reel, TikTok, ekran görüntüsü veya link — telefonun paylaş menüsünden direkt buraya gönder.',
    color: 'bg-coral-100',
    iconColor: 'text-coral-500',
  },
  {
    icon: 'Sparkles' as IconName,
    title: 'Otomatik planla',
    desc: 'İçeriği okuyup kategori, başlık, tarih, saat ve öncelik çıkarırım. Sen hiçbir alanı elle doldurmazsın.',
    color: 'bg-teal-100',
    iconColor: 'text-teal-600',
  },
  {
    icon: 'CalendarDays' as IconName,
    title: 'Günü gör, hallet',
    desc: 'Bugünün zaman çizelgesinde ne varsa gör. Öncelik sırasına göre ilerle, bitenleri işaretle.',
    color: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
]

export function Onboarding({ onDone }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const current = steps[step]
  const isLast = step === steps.length - 1

  return (
    <div className="fixed inset-0 z-40 bg-cream-100 animate-fade-in lg:flex lg:items-center lg:justify-center">
      {/* Desktop: the same steps in a centred card. */}
      <div className="flex flex-col h-full w-full max-w-md mx-auto lg:card lg:h-[600px]">
        <div className="flex justify-end px-5 pt-[calc(1rem+var(--safe-top))]">
          <button
            onClick={onDone}
            className="text-sm text-ink-400 font-medium active:scale-95 transition-transform"
          >
            Geç
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div
            key={step}
            className={`w-24 h-24 rounded-3xl ${current.color} flex items-center justify-center mb-8 animate-bounce-soft`}
          >
            <Icon name={current.icon} className={`w-12 h-12 ${current.iconColor}`} />
          </div>

          <h2 key={`title-${step}`} className="font-display text-2xl font-bold text-ink-700 text-center mb-3 animate-slide-up">
            {current.title}
          </h2>
          <p key={`desc-${step}`} className="text-ink-400 text-center max-w-xs leading-relaxed animate-slide-up">
            {current.desc}
          </p>
        </div>

        <div className="px-8 pb-[calc(2rem+var(--safe-bottom))]">
          <div className="flex justify-center gap-2 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-coral-500' : 'w-2 bg-ink-200'}`}
              />
            ))}
          </div>

          <button
            onClick={() => (isLast ? onDone() : setStep(step + 1))}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            {isLast ? (
              <>
                <Icon name="Check" className="w-5 h-5" />
                Başla
              </>
            ) : (
              <>
                Devam
                <Icon name="ChevronRight" className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
