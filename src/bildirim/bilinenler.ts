import { sha256Hex } from '../sosyal/nostr/kodlama'

// Who may put their own words on my lock screen. A notification is signed
// by its sender; it shows its text only when the sender is someone I know
// (a friend, someone I asked, a member of my group), or, for an answer to
// one of my plan links, when it names that link's secret key. Anything else
// (someone who only found my username) gets a fixed sentence. The app keeps
// the lists in Cache Storage, where the service worker can read them.

const ONBELLEK = 'cepdost-bildirim'
const ANAHTAR = '/__bildirim/bilinenler'

export interface Bilinenler {
  kisiler: Set<string>
  // SHA-256 (hex) of my plan links' keys; the keys themselves stay out.
  linkler: Set<string>
}

export function linkOzeti(anahtar: string): Promise<string> {
  return sha256Hex(`cepdost/link/${anahtar}`)
}

export async function bilinenleriYaz(kisiler: Iterable<string>, linkAnahtarlari: Iterable<string>): Promise<void> {
  if (!('caches' in globalThis)) return
  const linkler = await Promise.all([...new Set(linkAnahtarlari)].map(linkOzeti))
  const veri = { kisiler: [...new Set(kisiler)].sort(), linkler: linkler.sort() }
  const onbellek = await caches.open(ONBELLEK)
  const eski = await onbellek.match(ANAHTAR)
  const yeni = JSON.stringify(veri)
  if (eski && (await eski.text()) === yeni) return
  await onbellek.put(ANAHTAR, new Response(yeni))
}

export async function bilinenleriOku(): Promise<Bilinenler> {
  const bos = { kisiler: new Set<string>(), linkler: new Set<string>() }
  try {
    const cevap = await (await caches.open(ONBELLEK)).match(ANAHTAR)
    if (!cevap) return bos
    const veri = (await cevap.json()) as { kisiler?: unknown; linkler?: unknown }
    const liste = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : [])
    return { kisiler: new Set(liste(veri.kisiler)), linkler: new Set(liste(veri.linkler)) }
  } catch {
    return bos
  }
}

export async function bilinenleriSil(): Promise<void> {
  if ('caches' in globalThis) await caches.delete(ONBELLEK).catch(() => false)
}
