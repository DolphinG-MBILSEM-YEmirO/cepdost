# Sharloop mobile (Android + iOS)

A Capacitor shell around the live web app (https://sharloop.vercel.app) that
adds three home-screen widgets: **Sıradaki plan**, **Şu an boşta** and
**Bugün geçmişte**. Setup steps (in Turkish): [KURULUM.md](KURULUM.md).

```
capacitor.config.json   app id app.sharloop, loads the live site
www/                    offline fallback page only
native/android/         MainActivity, widget providers (Java), layouts, drawables
native/ios/App/         SharloopWidgetsPlugin + MainViewController (app target)
native/ios/SharloopWidgets/  the WidgetKit extension (SwiftUI)
scripts/apply-native.mjs     copies native/ into android/ and ios/ and wires it up
```

How data flows: the web app gathers the widget data (`src/widgets/`) and,
when it runs inside this shell, hands a JSON snapshot to the
`SharloopWidgets` plugin. Android keeps it in SharedPreferences, iOS in the
App Group `group.app.sharloop`; the widgets read it from there and redraw.
Countdowns, "free now" and plan changes are worked out on the phone between
app launches. Widget taps open the app with `sharloop://widget?target=…`.

The snapshot format is `src/widgets/types.ts`; the free-now / countdown logic
in `src/widgets/widgetData.ts` is mirrored in `WidgetTime.java` and
`Snapshot.swift`. Change them together.
