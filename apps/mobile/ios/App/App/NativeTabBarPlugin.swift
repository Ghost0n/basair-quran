import UIKit
import Capacitor

/// The iPhone app's tab bar: Apple's own UITabBar (Liquid Glass on iOS 26),
/// drawn over the web view, with the app's own icons. The web app drives it (apps/web/lib/native-tab-bar.ts):
/// `show` with the tabs, the active tab, the gold tint, the interface's
/// direction (`dir`) and the app's theme (`style`); `setActive` as the
/// page changes; `dock` in the Mushaf; `hide` in focus mode, wherever the
/// side menu shows and while a sheet is open (no web layer can cover the
/// bar). A tap sends `tabSelected` with the tab's id, and the web app
/// navigates as for a tap on its own bar. The bar steps aside while the
/// keyboard is up.
///
/// `dock` (iOS 26): in the Mushaf the bar changes shape into the reader's
/// dock (GlassDock below) — its Home part pulls away as a drop of glass,
/// the round button, and the rest draws in to become the toolbox; leaving
/// the Mushaf they flow back together into the bar. The dock's buttons are
/// the web dock's own (apps/web/lib/native-dock.ts): a tap sends
/// `dockTapped` with the button's key and the web app presses its button.
/// Before iOS 26 `dock` answers `shown: false` and the web dock is used.
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
        CAPPluginMethod(name: "dock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise)
    ]

    /// What is on screen: the tabs, the reader's dock, or nothing.
    private enum Face { case none, tabs, dock }

    private var tabBar: UITabBar?
    /// The reader's dock (a GlassDock, iOS 26 only).
    private var dockView: UIView?
    private var ids: [String] = []
    private var wanted: Face = .none
    private var shown: Face = .none
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
            self.setTabs(tabs, active: active, tint: tint, rtl: rtl, light: light)
            self.wanted = .tabs
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

    @objc func dock(_ call: CAPPluginCall) {
        guard #available(iOS 26.0, *) else {
            call.resolve(["shown": false])
            return
        }
        let tabs = call.getArray("tabs", JSObject.self) ?? []
        let active = call.getString("active") ?? ""
        let tint = call.getString("tint") ?? ""
        let rtl = call.getString("dir") == "rtl"
        let light = call.getString("style") == "light"
        let view = call.getString("view") ?? "tools"
        let lead = call.getObject("lead") ?? [:]
        let items = call.getArray("items", JSObject.self) ?? []
        DispatchQueue.main.async {
            guard self.ensureBar() != nil, let dock = self.ensureDock() else {
                call.resolve(["shown": false])
                return
            }
            // The tabs it turns back into on the way out of the Mushaf.
            if !tabs.isEmpty {
                self.setTabs(tabs, active: active, tint: tint, rtl: rtl, light: light)
            }
            dock.apply(
                view: view,
                lead: GlassDock.Lead(
                    title: lead["title"] as? String ?? "",
                    image: Self.image(lead["image"] as? String, original: lead["original"] as? Bool ?? false)
                ),
                items: items.map { item in
                    GlassDock.Item(
                        key: item["key"] as? String ?? "",
                        title: item["title"] as? String ?? "",
                        accessibility: item["accessibility"] as? String ?? "",
                        image: Self.image(item["image"] as? String, original: false),
                        on: item["on"] as? Bool ?? false,
                        disabled: item["disabled"] as? Bool ?? false,
                        prominent: item["prominent"] as? Bool ?? false,
                        badge: item["badge"] as? Bool ?? false
                    )
                },
                tint: UIColor(qbHex: tint) ?? .systemYellow,
                rtl: rtl,
                light: light,
                animated: self.shown == .dock
            )
            self.wanted = .dock
            self.applyVisibility()
            call.resolve(["shown": true])
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.wanted = .none
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

    // MARK: - Tabs

    private func setTabs(_ tabs: [JSObject], active: String, tint: String, rtl: Bool, light: Bool) {
        guard let bar = tabBar else { return }
        ids = tabs.map { $0["id"] as? String ?? "" }
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
            item.accessibilityIdentifier = ids[index]
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
        select(active)
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

    @available(iOS 26.0, *)
    private func ensureDock() -> GlassDock? {
        if let dock = dockView as? GlassDock { return dock }
        guard let host = bridge?.viewController?.view else { return nil }
        let dock = GlassDock()
        dock.translatesAutoresizingMaskIntoConstraints = false
        dock.isHidden = true
        dock.alpha = 0
        dock.onTap = { [weak self] key in
            self?.notifyListeners("dockTapped", data: ["key": key])
        }
        host.addSubview(dock)
        // Exactly where the tab bar's capsule floats (iOS 26: 62 points tall,
        // 21 from the bottom and from each side), so the two hand over at
        // the same shape.
        NSLayoutConstraint.activate([
            dock.leadingAnchor.constraint(equalTo: host.safeAreaLayoutGuide.leadingAnchor, constant: GlassDock.inset),
            dock.trailingAnchor.constraint(equalTo: host.safeAreaLayoutGuide.trailingAnchor, constant: -GlassDock.inset),
            dock.bottomAnchor.constraint(equalTo: host.bottomAnchor, constant: -GlassDock.inset),
            dock.heightAnchor.constraint(equalToConstant: GlassDock.height)
        ])
        dockView = dock
        return dock
    }

    private func select(_ id: String) {
        guard let bar = tabBar, let index = ids.firstIndex(of: id), let items = bar.items, index < items.count else { return }
        bar.selectedItem = items[index]
    }

    /// Brings what is wanted on screen: the tabs and the dock change shape
    /// into each other; anything else fades.
    private func applyVisibility() {
        let target: Face = keyboardUp ? .none : wanted
        if let bar = tabBar { bar.superview?.bringSubviewToFront(bar) }
        if let dock = dockView { dock.superview?.bringSubviewToFront(dock) }
        guard target != shown else { return }
        let from = shown
        shown = target
        if #available(iOS 26.0, *), let dock = dockView as? GlassDock, let bar = tabBar {
            if from == .tabs && target == .dock {
                morph(bar: bar, dock: dock, toDock: true)
                return
            }
            if from == .dock && target == .tabs {
                morph(bar: bar, dock: dock, toDock: false)
                return
            }
        }
        fade(tabBar, visible: target == .tabs, face: .tabs)
        fade(dockView, visible: target == .dock, face: .dock)
    }

    private func fade(_ view: UIView?, visible: Bool, face: Face) {
        guard let view = view else { return }
        if visible {
            view.isHidden = false
            if #available(iOS 26.0, *), let dock = view as? GlassDock {
                dock.setSplit(true, animated: false)
                dock.setContentVisible(true, animated: false)
            }
        }
        UIView.animate(withDuration: 0.2, animations: {
            view.alpha = visible ? 1 : 0
        }, completion: { _ in
            if self.shown != face { view.isHidden = true }
        })
    }

    /// The tab bar and the dock hand over at the bar's own capsule (the same
    /// glass, the same place) while the dock's Home part pulls away as a
    /// drop and the rest draws in to the toolbox; the way back reverses it.
    /// Every step overlaps the next — the tabs' icons give way to the
    /// toolbox's as the glass changes shape, never an empty capsule between
    /// them — and the tabs come back while the shapes are still flowing
    /// together, not once the spring has settled.
    @available(iOS 26.0, *)
    private func morph(bar: UITabBar, dock: GlassDock, toDock: Bool) {
        let reduce = UIAccessibility.isReduceMotionEnabled
        dock.isHidden = false
        bar.isHidden = false
        if toDock {
            dock.setSplit(false, animated: false)
            dock.setContentVisible(false, animated: false)
            UIView.animate(withDuration: 0.12, delay: 0, options: [.beginFromCurrentState, .curveEaseOut], animations: {
                bar.alpha = 0
                dock.alpha = 1
            }, completion: { _ in
                if self.shown != .tabs { bar.isHidden = true }
            })
            dock.setSplit(true, animated: !reduce)
            dock.setContentVisible(true, animated: true, delay: 0.05)
        } else {
            dock.setContentVisible(false, animated: true)
            dock.setSplit(false, animated: !reduce)
            UIView.animate(withDuration: 0.18, delay: reduce ? 0 : 0.14, options: [.beginFromCurrentState, .curveEaseInOut], animations: {
                bar.alpha = 1
                dock.alpha = 0
            }, completion: { _ in
                if self.shown != .dock { dock.isHidden = true }
            })
        }
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

/// The reader's dock in Liquid Glass (iOS 26): a capsule (the toolbox) and a
/// round button (the logo back Home, or an arrow back), two glass shapes in
/// one glass container, so that close together they flow into one — the tab
/// bar's capsule — and drawn apart they part like drops of water.
@available(iOS 26.0, *)
final class GlassDock: UIView {
    struct Lead {
        let title: String
        let image: UIImage?
    }

    struct Item {
        let key: String
        let title: String
        let accessibility: String
        let image: UIImage?
        let on: Bool
        let disabled: Bool
        let prominent: Bool
        let badge: Bool
    }

    static let height: CGFloat = 62
    static let inset: CGFloat = 21
    /// Between the round button and the capsule once apart.
    static let gap: CGFloat = 8

    var onTap: ((String) -> Void)?

    private let container: UIVisualEffectView
    private let capsule: UIVisualEffectView
    private let circle: UIVisualEffectView
    private let stack = UIStackView()
    private let leadButton = UIButton(type: .system)
    private var split = true
    private var rtl = true
    private var view = ""

    override init(frame: CGRect) {
        let containerEffect = UIGlassContainerEffect()
        // Within this distance the two shapes reach for each other and merge.
        containerEffect.spacing = 18
        container = UIVisualEffectView(effect: containerEffect)
        let capsuleGlass = UIGlassEffect(style: .regular)
        capsuleGlass.isInteractive = true
        capsule = UIVisualEffectView(effect: capsuleGlass)
        let circleGlass = UIGlassEffect(style: .regular)
        circleGlass.isInteractive = true
        circle = UIVisualEffectView(effect: circleGlass)
        super.init(frame: frame)

        addSubview(container)
        container.contentView.addSubview(capsule)
        container.contentView.addSubview(circle)
        capsule.cornerConfiguration = .capsule()
        circle.cornerConfiguration = .capsule()

        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.alignment = .fill
        capsule.contentView.addSubview(stack)

        leadButton.addAction(UIAction { [weak self] _ in self?.tapped("lead") }, for: .touchUpInside)
        circle.contentView.addSubview(leadButton)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    /// Only the glass takes touches; the page shows (and is touched) around it.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        capsule.frame.contains(point) || circle.frame.contains(point)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        container.frame = bounds
        let side = Self.height
        let width = bounds.width
        // The round button stands where the bar's Home tab is: at the side
        // the interface reads from.
        let circleX = rtl ? width - side : 0
        circle.frame = CGRect(x: circleX, y: 0, width: side, height: side)
        if split {
            let capsuleWidth = max(side, width - side - Self.gap)
            capsule.frame = CGRect(x: rtl ? 0 : side + Self.gap, y: 0, width: capsuleWidth, height: side)
        } else {
            capsule.frame = bounds
        }
        let capsuleBounds = capsule.bounds
        let inner = CGRect(x: 4, y: 0, width: max(0, capsuleBounds.width - 8), height: capsuleBounds.height)
        stack.frame = inner
        leadButton.frame = circle.bounds
    }

    /// Apart (the dock) or together (the tab bar's capsule).
    func setSplit(_ value: Bool, animated: Bool, delay: TimeInterval = 0, completion: (() -> Void)? = nil) {
        split = value
        setNeedsLayout()
        guard animated else {
            layoutIfNeeded()
            completion?()
            return
        }
        UIView.animate(
            springDuration: value ? 0.5 : 0.36,
            bounce: value ? 0.2 : 0,
            initialSpringVelocity: 0,
            delay: delay,
            options: [.beginFromCurrentState, .allowUserInteraction],
            animations: { self.layoutIfNeeded() },
            completion: { _ in completion?() }
        )
    }

    func setContentVisible(_ visible: Bool, animated: Bool, delay: TimeInterval = 0) {
        let apply = {
            self.stack.alpha = visible ? 1 : 0
            self.leadButton.alpha = visible ? 1 : 0
        }
        guard animated else {
            apply()
            return
        }
        UIView.animate(withDuration: visible ? 0.22 : 0.1, delay: delay, options: [.beginFromCurrentState, .curveEaseInOut], animations: apply)
    }

    func apply(view: String, lead: Lead, items: [Item], tint: UIColor, rtl: Bool, light: Bool, animated: Bool) {
        overrideUserInterfaceStyle = light ? .light : .dark
        let swapped = animated && view != self.view
        self.view = view
        if self.rtl != rtl {
            self.rtl = rtl
            setNeedsLayout()
        }
        // The page's order runs from the side it reads from.
        stack.semanticContentAttribute = rtl ? .forceRightToLeft : .forceLeftToRight

        var leadConfig = UIButton.Configuration.plain()
        leadConfig.image = lead.image
        leadConfig.baseForegroundColor = .label
        leadConfig.contentInsets = .zero
        leadButton.configuration = leadConfig
        leadButton.accessibilityLabel = lead.title

        let rebuild = {
            self.stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
            for item in items {
                self.stack.addArrangedSubview(self.cell(for: item, tint: tint))
            }
        }
        if swapped {
            // Reading ⇄ recitation: the toolbox's contents cross-fade.
            UIView.transition(with: stack, duration: 0.25, options: [.transitionCrossDissolve, .allowUserInteraction], animations: rebuild)
        } else {
            rebuild()
        }
    }

    private func cell(for item: Item, tint: UIColor) -> UIView {
        let cell = UIView()
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        var config: UIButton.Configuration
        if item.prominent {
            // The recitation's play: a gold disc, its sign in the page's ink.
            config = .filled()
            config.cornerStyle = .capsule
            config.baseBackgroundColor = tint
            config.baseForegroundColor = UIColor(white: 0.08, alpha: 1)
            config.image = item.image
            config.contentInsets = .zero
        } else {
            config = .plain()
            config.image = item.image
            config.imagePlacement = .top
            config.imagePadding = 3
            config.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 2, bottom: 4, trailing: 2)
            config.baseForegroundColor = item.on ? tint : .label
            if !item.title.isEmpty {
                var title = AttributedString(item.title)
                title.font = UIFont.systemFont(ofSize: 10.5, weight: item.on ? .semibold : .medium)
                config.attributedTitle = title
                config.titleLineBreakMode = .byTruncatingTail
            }
        }
        button.configuration = config
        button.isEnabled = !item.disabled
        button.accessibilityLabel = item.accessibility.isEmpty ? item.title : item.accessibility
        let key = item.key
        button.addAction(UIAction { [weak self] _ in self?.tapped(key) }, for: .touchUpInside)
        cell.addSubview(button)
        if item.prominent {
            NSLayoutConstraint.activate([
                button.centerXAnchor.constraint(equalTo: cell.centerXAnchor),
                button.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
                button.widthAnchor.constraint(equalToConstant: 50),
                button.heightAnchor.constraint(equalToConstant: 50)
            ])
        } else {
            NSLayoutConstraint.activate([
                button.leadingAnchor.constraint(equalTo: cell.leadingAnchor),
                button.trailingAnchor.constraint(equalTo: cell.trailingAnchor),
                button.topAnchor.constraint(equalTo: cell.topAnchor),
                button.bottomAnchor.constraint(equalTo: cell.bottomAnchor)
            ])
        }
        if item.badge {
            // A changed setting: a small gold dot by the sign.
            let dot = UIView()
            dot.translatesAutoresizingMaskIntoConstraints = false
            dot.backgroundColor = tint
            dot.layer.cornerRadius = 3.5
            dot.isUserInteractionEnabled = false
            cell.addSubview(dot)
            NSLayoutConstraint.activate([
                dot.widthAnchor.constraint(equalToConstant: 7),
                dot.heightAnchor.constraint(equalToConstant: 7),
                dot.centerXAnchor.constraint(equalTo: cell.centerXAnchor, constant: 11),
                dot.centerYAnchor.constraint(equalTo: cell.centerYAnchor, constant: -11)
            ])
        }
        return cell
    }

    private func tapped(_ key: String) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        onTap?(key)
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
