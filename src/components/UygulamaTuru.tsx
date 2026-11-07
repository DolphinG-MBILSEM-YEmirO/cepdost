import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { useGeriIleKapat } from '../lib/geriTusu'
import { UYGULAMA_ADI } from '../../shared/marka'

// A look inside the app before signing up: real screens from a demo group
// (the store screenshots, made from the app itself), one per page with a
// caption baked in. Swipe or use the arrows; the last page leads to sign-up.
// Images live in public/tur and are loaded only when the tour opens.
const SAYFALAR = [
  { src: '/tur/1.webp', alt: 'Planlar ekranı: bugün, yarın ve bu haftaki planlar tek listede.' },
  { src: '/tur/2.webp', alt: 'Plan ayrıntısı: davet edilenler ve kimlerin geldiği.' },
  { src: '/tur/3.webp', alt: 'Grup sohbeti: grup planı sohbete düşer, herkes tek dokunuşla yanıtlar.' },
  { src: '/tur/4.webp', alt: 'Arkadaşlar: kimin ne zaman müsait olduğu ve herkese uyan saat.' },
  { src: '/tur/5.webp', alt: 'Akış: arkadaşlarının gittiği yerlerin fotoğrafları, puanları ve notları.' },
  { src: '/tur/6.webp', alt: 'Profil: ayın özeti, kaç plan yaptığın ve en çok kiminle buluştuğun.' },
] as const

interface Props {
  onKapat: () => void
  // Shown on the last page; usually "create an account".
  onBasla: () => void
}

export function UygulamaTuru({ onKapat, onBasla }: Props) {
  const [sayfa, setSayfa] = useState(0)
  const seritRef = useRef<HTMLDivElement>(null)
  useGeriIleKapat(onKapat)
  const son = sayfa === SAYFALAR.length - 1

  // Keep the dots in step with swiping: the page whose centre is closest
  // to the strip's centre is the current one.
  useEffect(() => {
    const serit = seritRef.current
    if (!serit) return
    function guncelle() {
      if (!serit) return
      const genislik = serit.clientWidth || 1
      setSayfa(Math.min(SAYFALAR.length - 1, Math.max(0, Math.round(serit.scrollLeft / genislik))))
    }
    serit.addEventListener('scroll', guncelle, { passive: true })
    return () => serit.removeEventListener('scroll', guncelle)
  }, [])

  function git(hedef: number) {
    const serit = seritRef.current
    if (!serit) return
    const i = Math.min(SAYFALAR.length - 1, Math.max(0, hedef))
    serit.scrollTo({ left: i * serit.clientWidth, behavior: 'smooth' })
    setSayfa(i)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${UYGULAMA_ADI} turu`}
      className="fixed inset-0 z-[70] bg-ink-900 text-white flex flex-col animate-fade-in"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') git(sayfa + 1)
        else if (e.key === 'ArrowLeft') git(sayfa - 1)
        else if (e.key === 'Escape') onKapat()
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-[calc(1rem+var(--safe-top))] pb-3">
        <div className="min-w-0">
          <p className="text-headline font-bold">Uygulamaya göz at</p>
          <p className="text-caption text-white/70">Örnek bir arkadaş grubunun gerçek ekranları</p>
        </div>
        <button
          onClick={onKapat}
          aria-label="Turu kapat"
          autoFocus
          className="w-10 h-10 rounded-2xl bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 basinca"
        >
          <Icon name="X" className="w-5 h-5" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0">
        <div
          ref={seritRef}
          className="h-full flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SAYFALAR.map((s, i) => (
            <div key={s.src} className="w-full h-full shrink-0 snap-center flex items-center justify-center px-6 py-2">
              <img
                src={s.src}
                alt={s.alt}
                width={540}
                height={1080}
                loading={i < 2 ? 'eager' : 'lazy'}
                draggable={false}
                className="max-h-full w-auto max-w-full rounded-[1.75rem] shadow-float object-contain select-none"
              />
            </div>
          ))}
        </div>

        {/* Arrows for mouse users; on a phone, swiping does the same. */}
        <button
          onClick={() => git(sayfa - 1)}
          disabled={sayfa === 0}
          aria-label="Önceki ekran"
          className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 items-center justify-center disabled:opacity-0 transition-opacity"
        >
          <Icon name="ChevronLeft" className="w-6 h-6" />
        </button>
        <button
          onClick={() => git(sayfa + 1)}
          disabled={son}
          aria-label="Sonraki ekran"
          className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 items-center justify-center disabled:opacity-0 transition-opacity"
        >
          <Icon name="ChevronRight" className="w-6 h-6" />
        </button>
      </div>

      <div className="px-6 pt-3 pb-[calc(1.5rem+var(--safe-bottom))] w-full max-w-md mx-auto">
        <div className="flex justify-center gap-2 mb-4" aria-hidden>
          {SAYFALAR.map((s, i) => (
            <span
              key={s.src}
              className={`h-2 rounded-full transition-all duration-300 ${i === sayfa ? 'w-8 bg-white' : 'w-2 bg-white/35'}`}
            />
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {sayfa + 1} / {SAYFALAR.length}: {SAYFALAR[sayfa].alt}
        </p>
        {son ? (
          <button
            onClick={onBasla}
            className="w-full h-14 rounded-2xl bg-white text-ink-900 text-headline font-bold flex items-center justify-center gap-2 shadow-float basinca"
          >
            <Icon name="UserPlus" className="w-5 h-5" />
            Ücretsiz hesap oluştur
          </button>
        ) : (
          <button
            onClick={() => git(sayfa + 1)}
            className="w-full h-14 rounded-2xl bg-white/15 hover:bg-white/25 text-headline font-bold flex items-center justify-center gap-2 basinca"
          >
            Sonraki ekran
            <Icon name="ChevronRight" className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}
