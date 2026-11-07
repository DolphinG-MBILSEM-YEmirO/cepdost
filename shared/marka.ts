// The app's name and line, shared by the app, the server functions, the page
// head and the PWA manifest (vite.config.ts), so a rename is this one file
// plus twa-manifest.json and the README.
//
// Turkish text uses the name without suffixes ("Sharloop kullanıcısı",
// "Sharloop uygulamasında") so the sentences stay right whatever it becomes.
// Stored identifiers (the Dexie database, localStorage keys, key labels, the
// Android package) keep "cepdost" on purpose; see the README.

export const UYGULAMA_ADI = 'Sharloop'

export const SLOGAN = 'Paylaş. Planla. Birlikte yaşa.'

// The public address, for absolute links where a relative one won't do
// (link previews in index.html).
export const SITE_ADRESI = 'https://sharloop.vercel.app'
