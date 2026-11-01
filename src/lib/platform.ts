// Where the web app is running: a normal browser, or the native iOS/Android
// shell (Capacitor, see mobile/README.md). The shell injects
// `window.Capacitor`; a browser has none of it, so every helper here is a
// quiet "no" there and the web app needs no Capacitor dependency.

interface CalendarPlugin {
  addEvent(options: NativeCalendarEvent): Promise<void>
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: { SharloopCalendar?: CalendarPlugin }
}

function capacitor(): CapacitorGlobal | null {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
  return cap?.isNativePlatform?.() ? cap : null
}

// True inside the store app. Browser-only hints ("add to Home Screen",
// "allow notifications in your browser settings") are hidden there.
export function yerelUygulamada(): boolean {
  return capacitor() !== null
}

// A plan as the phone's own "new event" screen takes it. Times are epoch
// milliseconds; an all-day event starts at local midnight and ends at the
// next one.
export interface NativeCalendarEvent {
  title: string
  location?: string
  notes?: string
  start: number
  end: number
  allDay: boolean
  // Minutes before the start; omitted means no alarm.
  alarmMinutes?: number
}

// Opens the phone's "new event" screen filled with the plan (Android
// calendar intent, iOS event sheet), so the person saves it with one tap.
// Null when the shell is too old to have the plugin or this is a browser;
// the caller then falls back to the .ics download.
export function yerelTakvimEklentisi(): CalendarPlugin | null {
  return capacitor()?.Plugins?.SharloopCalendar ?? null
}
