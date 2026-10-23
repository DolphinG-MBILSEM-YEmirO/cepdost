import { useSyncExternalStore } from 'react'

// True on wide screens (Tailwind's `lg`, 1024px+), where the app shows a
// sidebar and side-by-side panes instead of the phone layout. Use CSS
// (`lg:` classes) when only styling changes; this hook is for the few
// places where the component tree itself differs.
const SORGU = '(min-width: 1024px)'

function dinle(degisti: () => void): () => void {
  const liste = window.matchMedia(SORGU)
  liste.addEventListener('change', degisti)
  return () => liste.removeEventListener('change', degisti)
}

export function useMasaustu(): boolean {
  return useSyncExternalStore(
    dinle,
    () => window.matchMedia(SORGU).matches,
    () => false,
  )
}
