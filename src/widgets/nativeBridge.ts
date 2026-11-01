import type { WidgetSnapshot } from './types'

// The link between the web app and the phone's home-screen widgets.
//
// Inside the native shell (Capacitor, see mobile/README.md) the page gets a
// `window.Capacitor` object with our own plugin, SharloopWidgets:
//   update({ snapshot })  stores the JSON where the widgets read it (Android
//                         SharedPreferences / iOS App Group) and redraws them
//   consumeLaunchTarget() the widget tap that opened the app, once
//   'widgetTap' event     a widget tapped while the app was already open
// In a browser none of this exists and every call here is a quiet no-op, so
// the web app needs no Capacitor dependency.

// Where a widget tap should lead: 'plan:<id>', 'friend:<id>', 'memory:<target>'
// or 'home'.
export type WidgetTarget = string

interface WidgetsPlugin {
  update(options: { snapshot: string }): Promise<void>
  consumeLaunchTarget(): Promise<{ target: WidgetTarget | null }>
  // The bridge returns the handle directly; @capacitor/core wraps it in a
  // promise. Both are handled below.
  addListener(
    event: 'widgetTap',
    cb: (data: { target: WidgetTarget } | null) => void,
  ): { remove: () => unknown } | Promise<{ remove: () => unknown }>
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  Plugins?: { SharloopWidgets?: WidgetsPlugin }
}

function plugin(): WidgetsPlugin | null {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
  if (!cap?.isNativePlatform?.()) return null
  return cap.Plugins?.SharloopWidgets ?? null
}

export function hasNativeWidgets(): boolean {
  return plugin() !== null
}

// Same content written twice in a row is skipped, so a busy sync doesn't
// keep waking the widgets.
let lastWritten = ''

export async function publishSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  const p = plugin()
  if (!p) return
  // updatedAt changes every time; compare everything else.
  const comparable = JSON.stringify({ ...snapshot, updatedAt: 0 })
  if (comparable === lastWritten) return
  lastWritten = comparable
  try {
    await p.update({ snapshot: JSON.stringify(snapshot) })
  } catch (err) {
    lastWritten = ''
    console.warn('widget snapshot could not be saved', err)
  }
}

// The target from the address (?widget=…), used by the web too: a PWA
// shortcut or a shared link can open a widget's screen the same way.
function targetFromAddress(): WidgetTarget | null {
  const params = new URLSearchParams(window.location.search)
  const target = params.get('widget')
  if (!target) return null
  params.delete('widget')
  const query = params.toString()
  window.history.replaceState(window.history.state, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash)
  return target
}

// The tap that launched the app is read once per page load and shared, so
// a listener set up twice (React StrictMode) still gets it.
let launchTarget: Promise<WidgetTarget | null> | null = null

function readLaunchTarget(p: WidgetsPlugin): Promise<WidgetTarget | null> {
  launchTarget ??= p
    .consumeLaunchTarget()
    .then(({ target }) => target)
    .catch(() => null)
  return launchTarget
}

// Calls `open` for the tap that launched the app and for every later tap.
// Returns the unsubscribe function.
export function listenForWidgetTaps(open: (target: WidgetTarget) => void): () => void {
  const fromAddress = targetFromAddress()
  if (fromAddress) open(fromAddress)

  const p = plugin()
  if (!p) return () => {}
  let stopped = false
  let remove: (() => void) | null = null
  void readLaunchTarget(p).then((target) => {
    if (stopped || !target) return
    // Handled: a later listener (or a reload of the app) mustn't open it again.
    launchTarget = Promise.resolve(null)
    open(target)
  })
  void Promise.resolve()
    .then(() =>
      p.addListener('widgetTap', (data) => {
        if (data?.target) open(data.target)
      }),
    )
    .then((handle) => {
      if (stopped) void handle.remove()
      else remove = () => void handle.remove()
    })
    .catch(() => {})
  return () => {
    stopped = true
    remove?.()
  }
}
