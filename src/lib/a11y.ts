import type { KeyboardEvent } from 'react'

// Props that make a non-button element behave like a button for keyboard
// and screen-reader users. Used where a card has its own buttons inside it,
// since a <button> can't contain another <button>.
export function tiklanabilir(onClick: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    },
  }
}
