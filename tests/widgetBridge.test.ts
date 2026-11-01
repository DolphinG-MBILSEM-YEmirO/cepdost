// Tests for the bridge to the native widgets (src/widgets/nativeBridge.ts),
// with a stand-in for what Capacitor injects into the page.
//
//   npm test

import assert from 'node:assert/strict'
import { test } from 'node:test'

type Listener = (data: { target: string } | null) => void

const calls: string[] = []
let listener: Listener | null = null
let launch: string | null = 'plan:42'
let address = '/?widget=memory:grup:g1&x=1'

const fakeWindow = {
  location: {
    get search() {
      return address.slice(address.indexOf('?'))
    },
    pathname: '/',
    hash: '',
  },
  history: {
    state: null,
    replaceState: (_s: unknown, _t: string, url: string) => {
      address = url
    },
  },
  Capacitor: {
    isNativePlatform: () => true,
    Plugins: {
      SharloopWidgets: {
        update: async ({ snapshot }: { snapshot: string }) => {
          calls.push(snapshot)
        },
        consumeLaunchTarget: async () => {
          const target = launch
          launch = null
          return { target }
        },
        // Like the raw bridge: the handle comes back directly, not in a promise.
        addListener: (_event: string, cb: Listener) => {
          listener = cb
          return { remove: () => (listener = null) }
        },
      },
    },
  },
}
Object.assign(globalThis, { window: fakeWindow })

const { hasNativeWidgets, listenForWidgetTaps, publishSnapshot } = await import('../src/widgets/nativeBridge')

const tick = () => new Promise((r) => setTimeout(r, 0))

test('widget taps: from the address, the launch, and later taps', async () => {
  const opened: string[] = []
  const stop = listenForWidgetTaps((t) => opened.push(t))
  await tick()
  await tick()
  assert.deepEqual(opened, ['memory:grup:g1', 'plan:42'])
  assert.equal(address, '/?x=1')

  listener?.({ target: 'friend:7' })
  assert.deepEqual(opened.at(-1), 'friend:7')
  stop()
  assert.equal(listener, null)
})

test('the launch tap is handed over once, even to a second listener', async () => {
  launch = 'plan:1'
  const opened: string[] = []
  listenForWidgetTaps((t) => opened.push(t))()
  const stop = listenForWidgetTaps((t) => opened.push(t))
  await tick()
  await tick()
  // The launch target was already read (and handled) in the first test.
  assert.deepEqual(opened, [])
  stop()
})

test('snapshots: written in the app, skipped when nothing changed', async () => {
  assert.equal(hasNativeWidgets(), true)
  const snapshot = { version: 1 as const, updatedAt: 1, plans: [], friends: [], memory: null }
  await publishSnapshot(snapshot)
  await publishSnapshot({ ...snapshot, updatedAt: 2 })
  assert.equal(calls.length, 1)
  await publishSnapshot({ ...snapshot, updatedAt: 3, plans: [{ id: 'p' } as never] })
  assert.equal(calls.length, 2)
})
