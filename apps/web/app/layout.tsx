import type { Metadata } from "next";

import "./tokens.css";
import "./tokens-motion.css";
import "./globals.css";
import "./motion.css";
import "./glass.css";

import { AppModeRoot } from "@/features/app-mode/app-mode-root";
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
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

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
        <meta name="theme-color" content="#131210" />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <I18nProvider>
          <AppModeRoot>{children}</AppModeRoot>
        </I18nProvider>
      </body>
    </html>
  );
}
