import type { Metadata } from "next";
import Script from "next/script";

import { YamliInit } from "@/components/yamli-init";
import "./globals.css";

const yamliEnabled = process.env.NEXT_PUBLIC_ENABLE_YAMLI !== "0";

export const metadata: Metadata = {
  title: "بصائر القرآن",
  description: "مساحة بحث قرآنية للباحث تجمع بين الاستكشاف والقراءة والسياق.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Cairo:wght@300;400;700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#1a1a1a" />
      </head>
      <body>
        {children}
        {yamliEnabled ? <Script src="https://api.yamli.com/js/yamli_api.js" strategy="afterInteractive" /> : null}
        {yamliEnabled ? <YamliInit targetId="searchInput" /> : null}
      </body>
    </html>
  );
}
