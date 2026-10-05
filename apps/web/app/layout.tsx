import type { Metadata, Viewport } from "next";

import "./tokens.css";
import "./tokens-motion.css";
import "./globals.css";
import "./motion.css";
import "./glass.css";

import { AppModeRoot } from "@/features/app-mode/app-mode-root";
import { APP_MODE } from "@/lib/app-mode/config";
import { LOCALE_INIT_SCRIPT } from "@/lib/i18n/init-script";
import { I18nProvider } from "@/lib/i18n/provider";

import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  get title() {
    return t("بصائر القرآن");
  },
  get description() {
    return t("مساحة بحث قرآنية للباحث تجمع بين الاستكشاف والقراءة والسياق.");
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    get title() {
    return t("بصائر القرآن");
  },
    statusBarStyle: "black-translucent",
  },
  icons: {
    // The logo (apps/mobile/scripts/make_icons.py): SVG where supported, the .ico elsewhere.
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48 64x64" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

// Edge to edge on phones (under the status bar and home indicator): the CSS
// keeps content clear with the safe-area insets (app/globals.css). The app
// never zooms: it has its own text sizes, and no pinch belongs to a native app.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  ...(APP_MODE ? { maximumScale: 1, userScalable: false } : {}),
};

// iOS Safari zooms into any focused field under 16px and stays zoomed. A
// maximum scale stops that auto-zoom while iOS still lets the reader pinch;
// it is added on iOS only, where pinch-zoom is unaffected (elsewhere it would
// block it).
const IOS_FOCUS_ZOOM_SCRIPT = `(function(){try{var n=navigator;if(!(/iPad|iPhone|iPod/.test(n.userAgent)||(n.platform==='MacIntel'&&n.maxTouchPoints>1)))return;var m=document.querySelector('meta[name=viewport]');if(m&&m.content.indexOf('maximum-scale')<0)m.content+=', maximum-scale=1';}catch(e){}})();`;

// Runs before first paint to apply the saved theme, so light-mode users
// never see a flash of the dark default (FOUC). Mirrors the classes the
// workspace hook applies at runtime (`light` + `light-mode`).
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.body.classList.add('light','light-mode');}if(localStorage.getItem('qb.transparency')==='reduced'){document.documentElement.dataset.transparency='reduced';}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/AmiriQuran-Regular.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        {/* The interface faces every screen draws first (self-hosted, app/tokens.css). */}
        <link rel="preload" href="/fonts/ui/cairo-300-800-arabic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/ui/amiri-400-arabic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <meta name="theme-color" content="#131210" />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: IOS_FOCUS_ZOOM_SCRIPT }} />
        <I18nProvider>
          <AppModeRoot>{children}</AppModeRoot>
        </I18nProvider>
      </body>
    </html>
  );
}
