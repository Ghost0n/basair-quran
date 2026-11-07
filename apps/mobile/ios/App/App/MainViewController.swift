import UIKit
import Capacitor

/// The app's bridge view controller: Capacitor's own, plus the plugins that
/// live in this app target rather than in a package (NativeTabBarPlugin).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeTabBarPlugin())
    }
}
