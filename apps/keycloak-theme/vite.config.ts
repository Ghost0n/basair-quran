import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { keycloakify } from "keycloakify/vite-plugin";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../web");

/**
 * The Keycloak login theme «qbasair» (docs/keycloak.md). It reuses the web's
 * design straight from apps/web — tokens, fonts, the auth screens' CSS, the
 * rosette, the logo glyph, the locale list and the interface strings — so the
 * sign-in pages follow the app instead of a copy of it.
 */
export default defineConfig({
  plugins: [
    react(),
    keycloakify({
      themeName: "qbasair",
      accountThemeImplementation: "none",
      // One JAR for Keycloak 26 (the pinned version, scripts/keycloak_dev.sh).
      keycloakVersionTargets: { "22-to-25": false, "all-other-versions": "qbasair-keycloak-theme.jar" },
      artifactId: "qbasair-keycloak-theme",
      groupId: "app.basair.keycloak",
    }),
  ],
  resolve: {
    alias: [
      // tokens.css asks the self-hosted fonts at /fonts/…: bundle them from the web's public/.
      { find: /^\/fonts\/(.*)$/, replacement: `${web}/public/fonts/$1` },
      { find: /^@web\/(.*)$/, replacement: `${web}/$1` },
      // The web's own modules import each other as @/… (apps/web/tsconfig.json).
      { find: /^@\/(.*)$/, replacement: `${web}/$1` },
    ],
    dedupe: ["react", "react-dom"],
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // The web's client components open with Next's "use client": meaningless here.
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        warn(warning);
      },
    },
  },
});
