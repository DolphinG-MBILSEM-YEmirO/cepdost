import { createContext, useContext } from 'react'

// True for controls drawn inside a coloured screen header (EkranBasligi),
// so they switch to their light-on-colour look without every caller having
// to say so.
export const BaslikBaglami = createContext(false)

export const useBaslikIcinde = () => useContext(BaslikBaglami)
