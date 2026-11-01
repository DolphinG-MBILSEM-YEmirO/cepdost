import Capacitor
import Foundation
import WidgetKit

// The web app's door to the home-screen widgets (see src/widgets/nativeBridge.ts):
//   update({ snapshot })   writes the JSON into the shared App Group folder
//                          and asks WidgetKit to redraw every widget
//   consumeLaunchTarget()  the widget tap that opened the app, once
//   "widgetTap" event      a widget tapped while the app is open
@objc(SharloopWidgetsPlugin)
public class SharloopWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharloopWidgetsPlugin"
    public let jsName = "SharloopWidgets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeLaunchTarget", returnType: CAPPluginReturnPromise),
    ]

    // Must match the App Group added to both targets in Xcode, and
    // SnapshotStore.appGroup in the widget extension.
    static let appGroup = "group.app.sharloop"
    static let fileName = "widget-snapshot.json"

    private var pendingTarget: String?

    override public func load() {
        if let url = ApplicationDelegateProxy.shared.lastURL {
            pendingTarget = Self.target(of: url)
        }
        NotificationCenter.default.addObserver(
            self, selector: #selector(openedURL(_:)), name: .capacitorOpenURL, object: nil)
    }

    @objc func update(_ call: CAPPluginCall) {
        guard let snapshot = call.getString("snapshot"), let data = snapshot.data(using: .utf8) else {
            call.reject("snapshot is required")
            return
        }
        guard let folder = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroup) else {
            call.reject("App Group \(Self.appGroup) is not set up for this app")
            return
        }
        do {
            try data.write(to: folder.appendingPathComponent(Self.fileName), options: .atomic)
            WidgetCenter.shared.reloadAllTimelines()
            call.resolve()
        } catch {
            call.reject("Could not save the widget snapshot", nil, error)
        }
    }

    @objc func consumeLaunchTarget(_ call: CAPPluginCall) {
        call.resolve(["target": pendingTarget ?? NSNull()])
        pendingTarget = nil
    }

    @objc private func openedURL(_ notification: Notification) {
        guard let info = notification.object as? [String: Any], let url = info["url"] as? URL,
              let target = Self.target(of: url) else { return }
        if hasListeners("widgetTap") {
            notifyListeners("widgetTap", data: ["target": target])
        } else {
            // The page isn't listening yet (cold start): hand it over on request.
            pendingTarget = target
        }
    }

    // sharloop://widget?target=plan:123 → "plan:123"
    static func target(of url: URL) -> String? {
        guard url.scheme == "sharloop", url.host == "widget" else { return nil }
        return URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "target" })?.value
    }
}
