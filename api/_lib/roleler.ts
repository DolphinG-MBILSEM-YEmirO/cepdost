// The server's own short trips to the Nostr relays, for SharPoint: read a
// few records and write one or two, then hang up. The same free relays as
// the app (shared/roleler.ts).
//
// Settings: SHARPOINT_ROLELERI (comma-separated, only for local testing
// against a relay on this machine).

import { SimplePool } from 'nostr-tools/pool'
import type { Filter } from 'nostr-tools/filter'
import type { Event } from 'nostr-tools/pure'
import { VARSAYILAN_ROLELER } from '../../shared/roleler.js'

// What the SharPoint ledger needs from the relays; tests pass an in-memory
// stand-in.
export interface RoleErisimi {
  sorgula(filtre: Filter): Promise<Event[]>
  yayinla(olay: Event): Promise<number>
}

const BEKLEME_MS = 4000

export function sunucuRoleleri(): string[] {
  const ayar = process.env.SHARPOINT_ROLELERI?.split(',').map((r) => r.trim()).filter((r) => /^wss?:\/\//.test(r))
  return ayar?.length ? ayar : VARSAYILAN_ROLELER
}

export function roleErisimi(roleler = sunucuRoleleri()): RoleErisimi & { kapat(): void } {
  const havuz = new SimplePool()
  return {
    sorgula: (filtre) => havuz.querySync(roleler, filtre, { maxWait: BEKLEME_MS }),
    async yayinla(olay) {
      const sonuclar = await Promise.allSettled(havuz.publish(roleler, olay, { maxWait: BEKLEME_MS }))
      return sonuclar.filter((s) => s.status === 'fulfilled').length
    },
    kapat: () => havuz.close(roleler),
  }
}
