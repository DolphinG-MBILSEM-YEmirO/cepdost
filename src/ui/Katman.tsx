import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Renders a sheet or dialog outside the card or list it belongs to, into
// the nearest element that sets the tab's colours (data-bolum). Inside an
// animated list (.kademeli keeps a transform on every item) a fixed sheet
// would otherwise be placed and clipped by its card.
export function Katman({ children }: { children: ReactNode }) {
  const yerRef = useRef<HTMLSpanElement>(null)
  const [hedef, setHedef] = useState<Element | null>(null)

  useLayoutEffect(() => {
    setHedef(yerRef.current?.closest('[data-bolum]') ?? document.body)
  }, [])

  return hedef ? createPortal(children, hedef) : <span ref={yerRef} hidden />
}
