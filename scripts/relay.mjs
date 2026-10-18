// A small in-memory Nostr relay (NIP-01 subset) for local development and
// tests: EVENT, REQ with several filters (kinds, authors, ids, #<tag>,
// since, until, limit), CLOSE, replaceable events (kinds 30000-39999) and
// NIP-40 expiration.
//
//   node scripts/relay.mjs [port]        -> ws://localhost:7777
//   open http://localhost:5173/?relays=ws://localhost:7777

import { WebSocketServer } from 'ws'
import { verifyEvent } from 'nostr-tools/pure'

export function startRelay(port = 7777) {
  const events = new Map()
  const subscriptions = new Map() // socket -> Map(subId -> filters)

  const tag = (event, name) => event.tags.find((t) => t[0] === name)?.[1]
  const isExpired = (event) => {
    const expiration = Number(tag(event, 'expiration'))
    return Boolean(expiration) && expiration < Date.now() / 1000
  }

  function matches(event, filter) {
    if (filter.kinds && !filter.kinds.includes(event.kind)) return false
    if (filter.authors && !filter.authors.includes(event.pubkey)) return false
    if (filter.ids && !filter.ids.includes(event.id)) return false
    if (filter.since && event.created_at < filter.since) return false
    if (filter.until && event.created_at > filter.until) return false
    for (const [key, values] of Object.entries(filter)) {
      if (!key.startsWith('#')) continue
      const name = key.slice(1)
      if (!event.tags.some((t) => t[0] === name && values.includes(t[1]))) return false
    }
    return true
  }

  function store(event) {
    if (events.has(event.id)) return false
    if (event.kind >= 30000 && event.kind < 40000) {
      const d = tag(event, 'd') ?? ''
      for (const [id, existing] of events) {
        if (existing.kind !== event.kind || existing.pubkey !== event.pubkey || (tag(existing, 'd') ?? '') !== d) continue
        const newer =
          existing.created_at > event.created_at || (existing.created_at === event.created_at && existing.id < event.id)
        if (newer) return false
        events.delete(id)
      }
    }
    events.set(event.id, event)
    return true
  }

  const server = new WebSocketServer({ port })
  server.on('connection', (socket) => {
    subscriptions.set(socket, new Map())
    const send = (message) => socket.send(JSON.stringify(message))

    socket.on('message', (raw) => {
      let message
      try {
        message = JSON.parse(raw)
      } catch {
        return send(['NOTICE', 'invalid json'])
      }
      const [type, ...rest] = message

      if (type === 'EVENT') {
        const event = rest[0]
        if (!event || !verifyEvent(event)) return send(['OK', event?.id, false, 'invalid: bad signature'])
        if (isExpired(event)) return send(['OK', event.id, false, 'invalid: expired'])
        const stored = store(event)
        send(['OK', event.id, true, stored ? '' : 'duplicate:'])
        if (!stored) return
        for (const [client, subs] of subscriptions) {
          for (const [subId, filters] of subs) {
            if (filters.some((f) => matches(event, f))) client.send(JSON.stringify(['EVENT', subId, event]))
          }
        }
      } else if (type === 'REQ') {
        const [subId, ...filters] = rest
        subscriptions.get(socket).set(subId, filters)
        const found = new Map()
        for (const filter of filters) {
          const list = [...events.values()]
            .filter((event) => !isExpired(event) && matches(event, filter))
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, filter.limit ?? 500)
          for (const event of list) found.set(event.id, event)
        }
        for (const event of found.values()) send(['EVENT', subId, event])
        send(['EOSE', subId])
      } else if (type === 'CLOSE') {
        subscriptions.get(socket).delete(rest[0])
      }
    })
    socket.on('close', () => subscriptions.delete(socket))
  })

  return {
    port,
    url: `ws://localhost:${port}`,
    events,
    close: () =>
      new Promise((resolve) => {
        for (const client of server.clients) client.terminate()
        server.close(resolve)
      }),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2]) || 7777
  startRelay(port)
  console.log(`relay listening on ws://localhost:${port}`)
}
