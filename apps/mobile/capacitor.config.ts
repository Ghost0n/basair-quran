import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The standalone Android app (docs/offline-app.md): the web app's app-mode
 * static export, served from the device at https://localhost.
 */
const config: CapacitorConfig = {
  appId: "app.qbasair.quran",
  appName: "Basair",
  webDir: "../web/out",
  android: {
    // Offline-first: nothing is loaded over plain HTTP.
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
};

export default config;
