import Capacitor
import UIKit

// The app's screen (set as the storyboard's class by scripts/apply-native.mjs).
// Registers our own plugin, which isn't an npm package.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SharloopWidgetsPlugin())
    }
}
