import type { Metadata } from "next";

import "./tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "بصائر القرآن",
  description: "مساحة بحث قرآنية للباحث تجمع بين الاستكشاف والقراءة والسياق.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "بصائر القرآن",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

// Runs before first paint to apply the saved theme, so light-mode users
// never see a flash of the dark default (FOUC). Mirrors the classes the
// ThemeToggle applies at runtime (`light` + `light-mode`).
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.body.classList.add('light','light-mode');}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          rel="preload"
          href="/fonts/AmiriQuran-Regular.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <meta name="theme-color" content="#131210" />
      </head>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
