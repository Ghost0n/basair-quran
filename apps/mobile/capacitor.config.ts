import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The standalone Android and iOS app (docs/offline-app.md): the web app's
 * app-mode static export, served from the device (https://localhost on
 * Android, capacitor://localhost on iOS).
 */
const config: CapacitorConfig = {
  appId: "app.qbasair.quran",
  appName: "Basair",
  webDir: "../web/out",
  // The app's dark background behind the webview, so launch never flashes white.
  backgroundColor: "#131210",
  android: {
    // Offline-first: nothing is loaded over plain HTTP.
    allowMixedContent: false,
  },
  ios: {
    contentInset: "never",
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
      iosIsEncryption: false,
      // Out of Documents: this folder is excluded from iCloud backup (the core
      // and installed packs can always be restored from the app and the server).
      iosDatabaseLocation: "Library/CapacitorDatabase",
    },
  },
};

export default config;
