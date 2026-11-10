"use client";

import { useEffect, useState } from "react";

import { APP_MODE } from "@/lib/app-mode/config";
import { useAuthSession } from "@/lib/auth-session-context";
import { t } from "@/lib/i18n";

/**
 * «النسخ الاحتياطي» (Settings, standalone app, without an account): a guest's
 * data goes with the phone's own backup, tied to the reader's Apple or Google
 * account — nothing to press. iPhone: the device store lives in the app's
 * Documents, which the iCloud backup keeps (downloads and the Quran databases
 * are kept out of it). Android: Auto Backup keeps the device store only
 * (res/xml/backup_rules.xml, data_extraction_rules.xml). In-app iCloud Drive /
 * Google Drive sync needs the developer accounts: docs/cloud-backup.md. With an
 * account, sync already keeps it, and nothing shows; nothing shows on the web.
 */
export function BackupSettings() {
  const { user } = useAuthSession();
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  useEffect(() => {
    const classes = document.documentElement.classList;
    setPlatform(classes.contains("qb-ios") ? "ios" : classes.contains("qb-android") ? "android" : null);
  }, []);
  if (!APP_MODE || user || !platform) return null;
  return (
    <section className="qb-setting-card">
      <h3>{t("النسخ الاحتياطي")}</h3>
      <p className="card-sub">
        {platform === "ios"
          ? t("بلا حساب، تُحفظ بياناتك (الآيات المثبّتة والمواضيع وجلسات الدراسة والجذور والأبحاث والتفضيلات) مع نسخة iPhone الاحتياطية على iCloud، وتعود حين يُستعاد الهاتف منها.")
          : t("بلا حساب، تُحفظ بياناتك (الآيات المثبّتة والمواضيع وجلسات الدراسة والجذور والأبحاث والتفضيلات) مع نسخة هاتفك الاحتياطية على Google، وتعود على هاتف جديد أو عند إعادة تثبيت التطبيق.")}
      </p>
      <p className="card-sub">{t("التنزيلات لا تدخل فيها، فهي تُنزَّل من جديد. لتزامن بياناتك بين أجهزتك، سجّل الدخول.")}</p>
    </section>
  );
}
