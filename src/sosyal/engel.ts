import { TUR, motor, nesneMi } from './cekirdek'

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
