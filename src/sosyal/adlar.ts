import type { Profil } from './api'

// People's names in a sentence: "Ayşe ve Can", "Ayşe, Can ve 2 kişi daha".
// I'm "Sen"; someone whose profile I can't read is "Bir arkadaşın".
export function adListesi(idler: string[], profiller: Map<string, Profil>, benimId?: string): string {
  const isimler = idler.map((id) => (id === benimId ? 'Sen' : (profiller.get(id)?.ad ?? 'Bir arkadaşın')))
  if (isimler.length <= 2) return isimler.join(' ve ')
  return `${isimler.slice(0, 2).join(', ')} ve ${isimler.length - 2} kişi daha`
}
