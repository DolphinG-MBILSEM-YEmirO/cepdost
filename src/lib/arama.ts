// Text search the way people type on a phone: case doesn't matter, and
// Turkish letters match their plain forms ("cay" finds "Çay", "gul" finds
// "Gül"), so a missing Turkish keyboard doesn't hide anything.

const DUZ_HARF: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

// The text folded for comparing. It keeps the length of the original, so a
// match found in it marks the same place in the original.
export function katla(metin: string): string {
  let sonuc = ''
  for (const harf of metin) {
    const kucuk = harf.toLocaleLowerCase('tr-TR')
    const ayniBoy = kucuk.length === harf.length ? kucuk : harf
    sonuc += DUZ_HARF[ayniBoy] ?? ayniBoy
  }
  return sonuc
}

// What was typed, ready to look for; null when there's nothing to look for.
export function aramaSorgusu(girdi: string): string | null {
  const sorgu = katla(girdi.trim().replace(/\s+/g, ' '))
  return sorgu.length > 0 ? sorgu : null
}

export function eslesiyor(metin: string, sorgu: string): boolean {
  return katla(metin).includes(sorgu)
}

export interface MetinParcasi {
  metin: string
  eslesme: boolean
}

// The text cut where it matches, for highlighting.
export function eslesmeParcalari(metin: string, sorgu: string): MetinParcasi[] {
  const katli = katla(metin)
  const parcalar: MetinParcasi[] = []
  let i = 0
  for (let j = katli.indexOf(sorgu); sorgu && j !== -1; j = katli.indexOf(sorgu, i)) {
    if (j > i) parcalar.push({ metin: metin.slice(i, j), eslesme: false })
    parcalar.push({ metin: metin.slice(j, j + sorgu.length), eslesme: true })
    i = j + sorgu.length
  }
  if (i < metin.length) parcalar.push({ metin: metin.slice(i), eslesme: false })
  return parcalar
}

// A line from a long message around its first match.
export function eslesmeOzeti(metin: string, sorgu: string, once = 24, sonra = 80): string {
  const tek = metin.replace(/\s+/g, ' ').trim()
  const j = katla(tek).indexOf(sorgu)
  if (j === -1) return tek.slice(0, once + sonra)
  let bas = Math.max(0, j - once)
  let son = Math.min(tek.length, j + sorgu.length + sonra)
  // Never cut an emoji in half.
  if (/[\uDC00-\uDFFF]/.test(tek[bas] ?? '')) bas++
  if (/[\uD800-\uDBFF]/.test(tek[son - 1] ?? '')) son--
  return `${bas > 0 ? '…' : ''}${tek.slice(bas, son).trimStart()}${son < tek.length ? '…' : ''}`
}
