// The day's discount codes (see api/kupon.ts): shared with api/sharpoint.ts,
// which checks the same codes when a till scans them for points.

import { createHmac } from 'node:crypto'
import { baytlardanKod } from '../../shared/yakinMekanlar.js'

export const ACIK_ANAHTAR = /^[0-9a-f]{64}$/

export function kuponGizlisi(): string | null {
  return process.env.KUPON_GIZLI?.trim() || process.env.EPOSTA_GIZLI?.trim() || null
}

function mac(anahtar: string, metin: string, uzunluk: number): string {
  return baytlardanKod(createHmac('sha256', anahtar).update(metin).digest(), uzunluk)
}

// First half: the person and the day. Second half: the business, the day
// and the first half.
export function kodUret(anahtar: string, isletme: string, kullanici: string, gun: string): string {
  const ilk = mac(anahtar, `kisi|${kullanici}|${gun}`, 4)
  return ilk + mac(anahtar, `kupon|${isletme}|${gun}|${ilk}`, 4)
}

export function kodGecerliMi(anahtar: string, isletme: string, kod: string, gun: string): boolean {
  return kod.slice(4) === mac(anahtar, `kupon|${isletme}|${gun}|${kod.slice(0, 4)}`, 4)
}

// Checking is cheap, so guessing is slowed per address (per instance, best
// effort): a few dozen tries per window is plenty at a till.
const PENCERE_MS = 10 * 60_000
const PENCERE_BASINA = 30
const sayaclar = new Map<string, { sayi: number; bitis: number }>()

export function kuponSayaclariniSifirla(): void {
  sayaclar.clear()
}

export function sinirAsildiMi(request: Request): boolean {
  const anahtar = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'bilinmiyor'
  const simdi = Date.now()
  const sayac = sayaclar.get(anahtar)
  if (!sayac || sayac.bitis < simdi) {
    sayaclar.set(anahtar, { sayi: 1, bitis: simdi + PENCERE_MS })
    return false
  }
  sayac.sayi++
  return sayac.sayi > PENCERE_BASINA
}
