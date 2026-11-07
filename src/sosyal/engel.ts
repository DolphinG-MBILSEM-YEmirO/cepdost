import { TUR, metinAl, motor, nesneMi } from './cekirdek'

// Blocking: a blocked person's messages, memories and friend requests stop
// showing (see engelle in api.ts, which also ends any friendship). The list
// lives on my own channel, so it follows me to my other devices; the
// blocked person is not told.

export const ENGEL_ONEKI = 'engel:'

export async function engellenenler(): Promise<Set<string>> {
  const m = motor()
  const kayitlar = await m.kayitlar((await m.ben()).konu, TUR.engel)
  return new Set(
    kayitlar
      .filter((k) => k.yazar === m.benimId && nesneMi(k.veri))
      .map((k) => k.anahtar.slice(ENGEL_ONEKI.length)),
  )
}

export async function engelliMi(kisiId: string): Promise<boolean> {
  return (await engellenenler()).has(kisiId)
}

// One person on my block list, with the name they had when I blocked them
// (we may no longer share anything that shows their profile). Blocks made
// before names were kept have none.
export interface EngelliKisi {
  id: string
  ad: string | null
  kullaniciAdi: string | null
  zaman: number
}

export async function engelliListesi(): Promise<EngelliKisi[]> {
  const m = motor()
  const kayitlar = await m.kayitlar((await m.ben()).konu, TUR.engel)
  return kayitlar
    .flatMap((k) => {
      if (k.yazar !== m.benimId || !nesneMi(k.veri)) return []
      const { ad, kullaniciAdi, zaman } = k.veri
      return [
        {
          id: k.anahtar.slice(ENGEL_ONEKI.length),
          ad: metinAl(ad, 80) ?? null,
          kullaniciAdi: metinAl(kullaniciAdi, 40) ?? null,
          zaman: typeof zaman === 'number' ? zaman : 0,
        },
      ]
    })
    .sort((a, b) => b.zaman - a.zaman)
}
