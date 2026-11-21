import AuthenticationServices
import Capacitor
import Security
import UIKit

/// The app's Keycloak sign-in on iPhone (apps/web/lib/app-mode/keycloak.ts,
/// docs/keycloak.md → "App"):
///
/// - `authenticate` opens Keycloak's page in an ASWebAuthenticationSession —
///   the system's sign-in sheet, sharing Safari's cookies, so a reader already
///   signed in to Keycloak (or Google) there is not asked again — and resolves
///   with the `qbasair://auth/callback?…` URL Keycloak redirects to. Closing
///   the sheet rejects with the code "cancelled".
/// - `secureGet` / `secureSet` / `secureRemove` keep the account's tokens in
///   the Keychain, readable after the first unlock and only on this device
///   (never in a backup, never moved to another phone).
@objc(QbAuthPlugin)
public class QbAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "QbAuthPlugin"
    public let jsName = "QbAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureRemove", returnType: CAPPluginReturnPromise)
    ]

    /// Kept alive while the sheet is up (the system drops an unreferenced session).
    private var session: ASWebAuthenticationSession?
    private let service = "app.qbasair.quran.auth"

    @objc func authenticate(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw),
              let scheme = call.getString("callbackScheme"), !scheme.isEmpty else {
            call.reject("url and callbackScheme are required", "invalid")
            return
        }
        DispatchQueue.main.async {
            self.session?.cancel()
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callbackURL, error in
                self?.session = nil
                if let callbackURL = callbackURL {
                    call.resolve(["url": callbackURL.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.reject("cancelled", "cancelled")
                } else {
                    call.reject(error?.localizedDescription ?? "sign-in failed", "failed")
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("the sign-in sheet could not open", "failed")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    private func query(_ key: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
    }

    @objc func secureGet(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key is required", "invalid")
            return
        }
        var lookup = query(key)
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) {
            call.resolve(["value": value])
        } else if status == errSecItemNotFound {
            call.resolve(["value": NSNull()])
        } else {
            call.reject("keychain read failed (\(status))", "failed")
        }
    }

    @objc func secureSet(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            call.reject("key and value are required", "invalid")
            return
        }
        SecItemDelete(query(key) as CFDictionary)
        var item = query(key)
        item[kSecValueData as String] = Data(value.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("keychain write failed (\(status))", "failed")
        }
    }

    @objc func secureRemove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key is required", "invalid")
            return
        }
        let status = SecItemDelete(query(key) as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("keychain delete failed (\(status))", "failed")
        }
    }
}
