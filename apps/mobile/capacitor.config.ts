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
    // Only the plain launch colour (LaunchScreen.storyboard, light or dark
    // with the phone): held until the web app draws its own splash, the
    // home's rosette (apps/web/features/app-mode/launch-splash.tsx), which
    // then stays over the cold start (apps/web/lib/app-mode/boot.ts). No
    // backgroundColor here: it would paint over the storyboard's colour.
    SplashScreen: {
      launchAutoHide: false,
      showSpinner: false,
      launchFadeOutDuration: 300,
    },
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
