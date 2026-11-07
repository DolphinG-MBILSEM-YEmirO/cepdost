// Free public relays that accept application data (kind 30078). The app
// syncs through them (src/sosyal/nostr/role.ts) and the server writes
// SharPoint records to them (api/_lib/roleler.ts).
export const VARSAYILAN_ROLELER = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://offchain.pub',
]

// The record kind every Sharloop record uses (NIP-78 application data).
export const OLAY_TURU = 30_078
