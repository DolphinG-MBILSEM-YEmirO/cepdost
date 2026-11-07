import { useState } from 'react'
import { Icon, type IconName } from './Icon'
import { useGeriAdimi } from '../lib/geriTusu'

interface OnboardingProps {
  onDone: () => void
}

// The app in three steps: friends first, then the assistant, then saving
// what you come across (the share menu), which is how the app started.
// Each step has a one-line promise and three concrete things it does, so
// the value is clear even for someone who only skims the intro.
const steps: { bolum: string; icon: IconName; title: string; desc: string; points: string[] }[] = [
  {
    bolum: 'sohbet',
    icon: 'Users',
    title: 'Arkadaşlarınla planla',
    desc: 'Arkadaşlarını kullanıcı adıyla ekle, planı gönder; kimin geldiğini anında gör.',
    points: [
      'Geliyorum / Belki / Gelemem cevapları tek ekranda',
      'Grup kur, grup planı sohbete düşsün',
      'Uygulaması olmayanlar da linkten cevap verebilir',
    ],
  },
  {
    bolum: 'planlar',
    icon: 'CalendarClock',
    title: 'Saati asistan bulsun',
    desc: '"Cumartesi Ayşe\'yle kahvaltı" yaz; herkesin boş olduğu saati bulup planı hazırlar.',
    points: [
      'Arkadaşlarının yalnızca dolu saatlerini görür, ne yaptıklarını değil',
      'Herkese uyan aralıkları sıralar, sen seçersin',
      'Takvimini bağlarsan dolu saatlerin kendiliğinden işlenir',
    ],
  },
  {
    bolum: 'profil',
    icon: 'Share2',
    title: 'Gördüğünü kaydet',
    desc: 'Reel, TikTok, ekran görüntüsü ya da link; paylaş menüsünden gönder, saatiyle yeriyle plana dönüşsün.',
    points: [
      'Konser, mekan, etkinlik: tarih ve yer kendiliğinden doldurulur',
      'Kaydettiklerin Fikirler\'de birikir, arkadaşınla tek dokunuşla planla',
      'Gittiğin yerleri fotoğraf ve puanla arkadaşlarınla paylaş',
    ],
  },
]

export function Onboarding({ onDone }: OnboardingProps) {
  const [step, setStep] = useState(0)
  useGeriAdimi(() => setStep((s) => Math.max(0, s - 1)), step > 0)
  const current = steps[step]
  const isLast = step === steps.length - 1

  // Every step has its own colour; the whole screen fades from one to the
  // next while the icon springs in.
  return (
    <div
      data-bolum={current.bolum}
      className="fixed inset-0 z-40 bg-bolum-canli text-white animate-fade-in transition-colors lg:flex lg:items-center lg:justify-center"
    >
      <div aria-hidden className="pointer-events-none absolute top-[12%] -left-16 w-56 h-56 rounded-full bg-white/10 animate-yuzen" />
      <div aria-hidden className="pointer-events-none absolute bottom-[18%] -right-14 w-64 h-64 rounded-[4rem] bg-white/10 rotate-12 animate-yuzen-yavas" />

      <div className="relative flex flex-col h-full w-full max-w-md mx-auto lg:h-[600px]">
        <div className="flex justify-end px-4 pt-[calc(1rem+var(--safe-top))]">
          <button
            onClick={onDone}
            className="h-10 px-4 rounded-2xl text-callout text-white font-semibold bg-white/15 hover:bg-white/25 basinca"
          >
            Geç
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div key={step} className="relative mb-8 animate-pop-in">
            <div aria-hidden className="absolute inset-0 rounded-[2.5rem] bg-white/30 blur-2xl scale-110" />
            <div className="relative w-28 h-28 rounded-[2.5rem] bg-white flex items-center justify-center shadow-float animate-yuzen">
              <Icon name={current.icon} className="w-14 h-14 text-bolum-koyu" strokeWidth={2} />
            </div>
          </div>

          <h2 key={`title-${step}`} className="text-[1.75rem] leading-9 font-extrabold tracking-tight text-center mb-3 animate-slide-up">
            {current.title}
          </h2>
          <p key={`desc-${step}`} className="text-body text-white/90 text-center max-w-xs animate-slide-up [animation-delay:80ms] [animation-fill-mode:both]">
            {current.desc}
          </p>
          <ul
            key={`points-${step}`}
            className="mt-6 w-full max-w-xs space-y-2.5 animate-slide-up [animation-delay:160ms] [animation-fill-mode:both]"
          >
            {current.points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 rounded-2xl bg-white/15 px-3.5 py-2.5 text-callout font-medium leading-snug">
                <Icon name="Check" className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={2.5} />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-8 pb-[calc(2rem+var(--safe-bottom))]">
          <div className="flex justify-center gap-2 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${i === step ? 'w-8 bg-white' : 'w-2 bg-white/40'}`}
              />
            ))}
          </div>

          <button
            onClick={() => (isLast ? onDone() : setStep(step + 1))}
            className="w-full h-14 rounded-2xl bg-white text-bolum-koyu text-headline font-bold flex items-center justify-center gap-2 shadow-float basinca"
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
