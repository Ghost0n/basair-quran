import UIKit
import Capacitor

/// The iPhone app's tab bar: Apple's own UITabBar (Liquid Glass on iOS 26),
/// drawn over the web view, with the app's own icons. The web app drives it (apps/web/lib/native-tab-bar.ts):
/// `show` with the tabs, the active tab, the gold tint, the interface's
/// direction (`dir`) and the app's theme (`style`); `setActive` as the
/// page changes; `hide` in the Mushaf, wherever the side menu shows and while
/// a sheet is open (no web layer can cover the bar). A tap
/// sends `tabSelected` with the tab's id, and the web app navigates as for a
/// tap on its own bar. The bar steps aside while the keyboard is up.
///
/// `show` answers with the height the bar was drawn at: the web app keeps its
/// own bar hidden only when that height is above zero.
@objc(NativeTabBarPlugin)
public class NativeTabBarPlugin: CAPPlugin, CAPBridgedPlugin, UITabBarDelegate {
    public let identifier = "NativeTabBarPlugin"
    public let jsName = "NativeTabBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setActive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise)
    ]

    private var tabBar: UITabBar?
    private var ids: [String] = []
    private var wanted = false
    private var keyboardUp = false

    override public func load() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(keyboardWillShow), name: UIResponder.keyboardWillShowNotification, object: nil)
        center.addObserver(self, selector: #selector(keyboardWillHide), name: UIResponder.keyboardWillHideNotification, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc func show(_ call: CAPPluginCall) {
        let tabs = call.getArray("tabs", JSObject.self) ?? []
        let active = call.getString("active") ?? ""
        let tint = call.getString("tint") ?? ""
        let rtl = call.getString("dir") == "rtl"
        let light = call.getString("style") == "light"
        DispatchQueue.main.async {
            guard let bar = self.ensureBar() else {
                call.reject("No web view to attach the tab bar to")
                return
            }
            self.ids = tabs.map { $0["id"] as? String ?? "" }
            bar.items = tabs.enumerated().map { index, tab in
                // The app's own icon when the web app could draw it (a
                // template the bar tints, or the logo in its own gold);
                // otherwise the SF Symbol.
                let original = tab["original"] as? Bool ?? false
                let symbol = UIImage(systemName: tab["symbol"] as? String ?? "circle")
                let image = Self.image(tab["image"] as? String, original: original) ?? symbol
                let selected = Self.image(tab["selectedImage"] as? String, original: original) ?? image
                let item = UITabBarItem(title: tab["title"] as? String, image: image, selectedImage: selected)
                item.tag = index
                item.accessibilityIdentifier = self.ids[index]
                return item
            }
            if let color = UIColor(qbHex: tint) {
                bar.tintColor = color
            }
            // The app bundle is English-only, so UIKit would lay the tabs out
            // left to right: the web app's direction decides, and its theme
            // decides light or dark whatever the phone's own appearance.
            bar.semanticContentAttribute = rtl ? .forceRightToLeft : .forceLeftToRight
            bar.overrideUserInterfaceStyle = light ? .light : .dark
            self.select(active)
            self.wanted = true
            self.applyVisibility()
            bar.superview?.layoutIfNeeded()
            call.resolve(["height": Double(bar.frame.height)])
        }
    }

    @objc func setActive(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        DispatchQueue.main.async {
            self.select(id)
            call.resolve()
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.wanted = false
            self.applyVisibility()
            call.resolve()
        }
    }

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard item.tag >= 0, item.tag < ids.count else { return }
        notifyListeners("tabSelected", data: ["id": ids[item.tag]])
    }

    /// A PNG sent as a data URL, drawn at 3x (lib/native-tab-icons.ts).
    private static func image(_ dataURL: String?, original: Bool) -> UIImage? {
        guard let dataURL = dataURL, let comma = dataURL.firstIndex(of: ","),
              let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])),
              let image = UIImage(data: data, scale: 3) else { return nil }
        return image.withRenderingMode(original ? .alwaysOriginal : .alwaysTemplate)
    }

    // MARK: - Layout

    private func ensureBar() -> UITabBar? {
        if let bar = tabBar { return bar }
        guard let host = bridge?.viewController?.view else { return nil }
        let bar = UITabBar()
        bar.delegate = self
        bar.translatesAutoresizingMaskIntoConstraints = false
        bar.isHidden = true
        bar.alpha = 0
        host.addSubview(bar)
        // Pinned to the bottom edge, under the home indicator. A standalone
        // UITabBar has no height of its own under Auto Layout (it came out
        // 0 points tall, so nothing showed): the bar's 49 points sit above
        // the safe area, and its background runs down to the screen's edge.
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: host.bottomAnchor),
            bar.topAnchor.constraint(equalTo: host.safeAreaLayoutGuide.bottomAnchor, constant: -49)
        ])
        tabBar = bar
        return bar
    }

    private func select(_ id: String) {
        guard let bar = tabBar, let index = ids.firstIndex(of: id), let items = bar.items, index < items.count else { return }
        bar.selectedItem = items[index]
    }

    private func applyVisibility() {
        guard let bar = tabBar else { return }
        let visible = wanted && !keyboardUp
        if visible { bar.isHidden = false }
        bar.superview?.bringSubviewToFront(bar)
        UIView.animate(withDuration: 0.2, animations: {
            bar.alpha = visible ? 1 : 0
        }, completion: { _ in
            if !(self.wanted && !self.keyboardUp) { bar.isHidden = true }
        })
    }

    @objc private func keyboardWillShow() {
        DispatchQueue.main.async {
            self.keyboardUp = true
            self.applyVisibility()
        }
    }

    @objc private func keyboardWillHide() {
        DispatchQueue.main.async {
            self.keyboardUp = false
            self.applyVisibility()
        }
    }
}

private extension UIColor {
    /// `#rrggbb`, as the web app sends the gold token.
    convenience init?(qbHex: String) {
        let hex = qbHex.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "#", with: "")
        guard hex.count == 6, let value = UInt32(hex, radix: 16) else { return nil }
        self.init(
            red: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: 1
        )
    }
}
