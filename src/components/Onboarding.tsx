import { useState } from 'react'
import { Icon, type IconName } from './Icon'
import { useGeriAdimi } from '../lib/geriTusu'

interface OnboardingProps {
  onDone: () => void
}

// The app in three steps: friends first, then the assistant, then saving
// what you come across (the share menu), which is how CepDost started.
const steps = [
  {
    icon: 'Users' as IconName,
    title: 'Arkadaşlarınla planla',
    desc: 'Arkadaşlarını kullanıcı adıyla ekle, planı gönder; kimin geldiğini anında gör.',
  },
  {
    icon: 'CalendarClock' as IconName,
    title: 'Saati asistan bulsun',
    desc: '"Cumartesi Ayşe\'yle kahvaltı" yaz; herkesin boş olduğu saati bulup planı hazırlar.',
  },
  {
    icon: 'Share2' as IconName,
    title: 'Gördüğünü kaydet',
    desc: 'Reel, TikTok, ekran görüntüsü ya da link; telefonun paylaş menüsünden gönder, saatiyle yeriyle plana dönüşsün.',
  },
]

export function Onboarding({ onDone }: OnboardingProps) {
  const [step, setStep] = useState(0)
  useGeriAdimi(() => setStep((s) => Math.max(0, s - 1)), step > 0)
  const current = steps[step]
  const isLast = step === steps.length - 1

  return (
    <div className="fixed inset-0 z-40 bg-uygulama animate-fade-in lg:flex lg:items-center lg:justify-center">
      {/* Desktop: the same steps in a centred card. */}
      <div className="flex flex-col h-full w-full max-w-md mx-auto lg:card lg:h-[600px]">
        <div className="flex justify-end px-4 pt-[calc(1rem+var(--safe-top))]">
          <button
            onClick={onDone}
            className="h-10 px-3 rounded-xl text-callout text-ink-500 font-medium hover:bg-ink-50 active:opacity-80"
          >
            Geç
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div
            key={step}
            className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-8 animate-fade-in"
          >
            <Icon name={current.icon} className="w-8 h-8 text-brand-600" />
          </div>

          <h2 key={`title-${step}`} className="text-title text-ink-900 text-center mb-2 animate-fade-in">
            {current.title}
          </h2>
          <p key={`desc-${step}`} className="text-body text-ink-500 text-center max-w-xs animate-fade-in">
            {current.desc}
          </p>
        </div>

        <div className="px-8 pb-[calc(2rem+var(--safe-bottom))]">
          <div className="flex justify-center gap-2 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${i === step ? 'w-6 bg-ink-800' : 'w-1.5 bg-ink-200'}`}
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
