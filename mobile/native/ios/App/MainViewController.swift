import Capacitor
import UIKit

// The app's screen (set as the storyboard's class by scripts/apply-native.mjs).
// Registers our own plugins, which aren't npm packages.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SharloopWidgetsPlugin())
        bridge?.registerPluginInstance(SharloopCalendarPlugin())
    }
}
