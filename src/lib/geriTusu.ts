import { useEffect, useRef } from 'react'

// Everything the phone's back button should undo before it leaves the app:
// open sheets, panels and dialogs, a wizard's later steps, a tab other than
// Planlar. Each one is a layer on a single stack, the newest on top.
//
// Every layer is mirrored by one browser history entry, so Android's back
// button, the back gesture and the browser's back button take the top layer
// away instead of leaving the site. The entries keep the address as it is
// and carry their depth above the page's own entry (`DERINLIK_ANAHTARI`),
// which tells a back press apart from the app's own steps.
//
// Layers come and go from React effects; the history catches up a moment
// later in one go (`esitle`), so closing one sheet and opening the next in
// the same tap leaves the history as it was.
//
// Overlays (`useGeriIleKapat`) also close with Escape; navigation steps
// (`useGeriAdimi`) only answer to the back button.
//
// The native Android app (mobile/) doesn't rely on the WebView's history:
// its back button asks `window.sharloopGeri()` (see `geriTusunaBas`), which
// takes the top layer away and says whether there was one. Only when there
// is none, on the root screen, does the app leave.

interface Katman {
  geri: () => void
  escape: boolean
}

const DERINLIK_ANAHTARI = 'sharloopDerinlik'

const yigin: Katman[] = []
// How many of the app's entries sit under the current one (0 = the page's
// own entry).
let derinlik = 0
// A history.go() of ours is on its way; the history is left alone until
// its popstate arrives.
let gidiliyor = false
let planli = false

function girdiDerinligi(state: unknown): number {
  const deger = state && typeof state === 'object' ? (state as Record<string, unknown>)[DERINLIK_ANAHTARI] : 0
  return typeof deger === 'number' && Number.isInteger(deger) && deger > 0 ? deger : 0
}

// One history entry per layer: missing ones are added, extra ones (layers
// closed with a button or Escape) are stepped back over.
function esitle() {
  planli = false
  if (gidiliyor) return
  const istenen = yigin.length
  if (derinlik < istenen) {
    while (derinlik < istenen) {
      derinlik++
      window.history.pushState({ [DERINLIK_ANAHTARI]: derinlik }, '')
    }
  } else if (derinlik > istenen) {
    gidiliyor = true
    window.history.go(istenen - derinlik)
  }
}

function planla() {
  if (planli) return
  planli = true
  setTimeout(esitle, 0)
}

if (typeof window !== 'undefined') {
  // A page reloaded or restored on one of the app's entries starts with no
  // layers open, so it steps back to its own entry first.
  derinlik = girdiDerinligi(window.history.state)
  if (derinlik > 0) planla()

  window.addEventListener('popstate', (e) => {
    const yeniDerinlik = girdiDerinligi(e.state)
    if (gidiliyor) {
      gidiliyor = false
      derinlik = yeniDerinlik
      planla()
      return
    }
    // The person went back: one entry is one layer, the top ones first. A
    // layer that stays open (a wizard going back one step) gets its entry
    // again from `esitle`; going forward only puts the history back in line.
    const geriAdim = derinlik - yeniDerinlik
    derinlik = yeniDerinlik
    if (geriAdim > 0) {
      for (const katman of yigin.slice(-geriAdim).reverse()) katman.geri()
    }
    planla()
  })

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    // The newest overlay; navigation steps above it don't take Escape.
    for (let i = yigin.length - 1; i >= 0; i--) {
      if (!yigin[i].escape) continue
      e.preventDefault()
      yigin[i].geri()
      return
    }
  })
}

/**
 * One press of the back button, for the native shell. Takes the top layer
 * away the same way the browser's back does and returns true, or returns
 * false when nothing is open (the root screen), so the app may close.
 */
export function geriTusunaBas(): boolean {
  if (yigin.length === 0) return false
  if (derinlik > 0 && !gidiliyor) {
    // Through the history, so the entries stay one per layer.
    window.history.back()
  } else {
    // The history hasn't caught up yet: close the layer directly.
    yigin[yigin.length - 1].geri()
    planla()
  }
  return true
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { sharloopGeri?: () => boolean }).sharloopGeri = geriTusunaBas
}

function useKatman(geri: () => void, etkin: boolean, escape: boolean) {
  const geriRef = useRef(geri)
  useEffect(() => {
    geriRef.current = geri
  })
  useEffect(() => {
    if (!etkin) return
    const katman: Katman = { geri: () => geriRef.current(), escape }
    yigin.push(katman)
    planla()
    return () => {
      const i = yigin.indexOf(katman)
      if (i >= 0) yigin.splice(i, 1)
      planla()
    }
  }, [etkin, escape])
}

/** An overlay (sheet, panel, dialog, menu): Escape and the back button close it. */
export function useGeriIleKapat(kapat: () => void, etkin = true) {
  useKatman(kapat, etkin, true)
}

/** A step inside a screen (a wizard step, a tab other than Planlar) that the back button undoes. */
export function useGeriAdimi(geriDon: () => void, etkin = true) {
  useKatman(geriDon, etkin, false)
}
