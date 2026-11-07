"use client";

import { useEffect, useState, type ReactNode } from "react";

import { APP_MODE } from "@/lib/app-mode/config";
import { t } from "@/lib/i18n";

import "./app-mode.css";

/** navigator.onLine, kept current. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * Studio (the research agent) and Community run on the server. In the
 * standalone app, offline, they say so plainly instead of failing; everything
 * Quran-side keeps working. On the web this renders its children unchanged.
 */
export function OnlineOnly({ children }: { children: ReactNode }) {
  const online = useOnline();
  if (!APP_MODE || online) return <>{children}</>;
  return (
    <div className="qb-online-only" role="status">
      <h3>{t("يتطلّب هذا القسم اتصالًا بالإنترنت.")}</h3>
      <p>{t("يعمل القرآن والبحث والدفتر دون اتصال؛ أما الاستوديو والمجتمع والحساب فتحتاج إلى الشبكة.")}</p>
    </div>
  );
}
