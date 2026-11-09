"use client";

import { useEffect, useRef, useState } from "react";

import { APP_MODE } from "@/lib/app-mode/config";
import { BackupError, currentCounts, parseBackup, restoreBackup, saveBackup, type Backup, type BackupCounts } from "@/lib/app-mode/backup";
import { useAuthSession } from "@/lib/auth-session-context";
import { useNumerals } from "@/lib/preferences-context";
import { t, tn } from "@/lib/i18n";

import "./app-mode.css";

type Target = "icloud" | "drive";
type Pending = { backup: Backup } | null;

/**
 * «النسخ الاحتياطي» (Settings, standalone app, without an account): the
 * guest's data saved to iCloud Drive or Google Drive and restored from there
 * (lib/app-mode/backup.ts). With an account, sync already keeps it: nothing
 * shows. Nothing shows on the web either.
 */
export function BackupSettings() {
  const { user } = useAuthSession();
  if (!APP_MODE || user) return null;
  return <Backups />;
}

function isIos(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("qb-ios");
}

function Backups() {
  const formatNumber = useNumerals();
  const fileRef = useRef<HTMLInputElement>(null);
  const [counts, setCounts] = useState<BackupCounts | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(isIos());
    currentCounts().then(setCounts, () => setCounts(null));
  }, []);

  const summary = (value: BackupCounts | null) =>
    value
      ? [
          tn("{0} آية مُثبَّتة", value.notebook, { 0: formatNumber(value.notebook) }),
          tn("{0} جلسة بحث", value.sessions, { 0: formatNumber(value.sessions) }),
          tn("{0} جذر محفوظ", value.roots, { 0: formatNumber(value.roots) }),
        ].join(" · ")
      : "";

  async function save(target: Target) {
    setBusy(true);
    setMessage(
      target === "icloud"
        ? t("في القائمة اختر «حفظ في الملفات» ثم iCloud Drive.")
        : t("في القائمة اختر Drive لحفظها في Google Drive."),
    );
    try {
      const done = await saveBackup(t("نسخة احتياطية من بصائر"));
      if (done === "saved") setMessage(t("حُفظت النسخة."));
    } catch {
      setMessage(t("تعذّر حفظ النسخة. حاول مرة أخرى."));
    } finally {
      setBusy(false);
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      setPending({ backup: parseBackup(await file.text()) });
    } catch (error) {
      setMessage(
        error instanceof BackupError && error.message === "newer-version"
          ? t("هذه النسخة من إصدار أحدث من التطبيق. حدّث التطبيق ثم أعد المحاولة.")
          : t("هذا الملف ليس نسخة احتياطية من بصائر."),
      );
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function restore() {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending.backup);
      setMessage(t("استُعيدت النسخة."));
      // Every screen reads the restored data from the start.
      window.setTimeout(() => window.location.reload(), 700);
    } catch {
      setMessage(t("تعذّرت الاستعادة. بقيت بياناتك كما كانت."));
      setBusy(false);
    }
  }

  return (
    <div className="qb-downloads-group qb-backups">
      <h4>{t("النسخ الاحتياطي")}</h4>
      <p className="qb-offline-note">
        {t("بلا حساب، تبقى بياناتك على هذا الجهاز وحده. احفظ نسخة منها في iCloud Drive أو Google Drive، واستعدها عند تغيير الهاتف.")}
      </p>
      {counts ? <p className="qb-offline-note">{summary(counts)}</p> : null}

      {ios ? (
        <div className="qb-download-row">
          <div className="name">
            <div>iCloud Drive</div>
            <div className="meta">{t("عبر «حفظ في الملفات»")}</div>
          </div>
          <button type="button" className="qb-btn ghost sm" disabled={busy} onClick={() => void save("icloud")}>
            {t("حفظ نسخة")}
          </button>
        </div>
      ) : null}
      <div className="qb-download-row">
        <div className="name">
          <div>Google Drive</div>
          <div className="meta">{t("يتطلّب تطبيق Google Drive")}</div>
        </div>
        <button type="button" className="qb-btn ghost sm" disabled={busy} onClick={() => void save("drive")}>
          {t("حفظ نسخة")}
        </button>
      </div>

      <div className="qb-download-row">
        <div className="name">
          <div>{t("استعادة نسخة")}</div>
          <div className="meta">
            {pending
              ? t("ستحلّ محلّ بياناتك الحالية: {0}", { 0: summary(pending.backup.counts) })
              : t("اختر الملف من iCloud Drive أو Google Drive.")}
          </div>
        </div>
        {pending ? (
          <>
            <button type="button" className="qb-btn ghost sm" disabled={busy} onClick={() => void restore()}>
              {t("تأكيد الاستعادة")}
            </button>
            <button type="button" className="qb-btn ghost sm" disabled={busy} onClick={() => setPending(null)}>
              {t("إلغاء")}
            </button>
          </>
        ) : (
          <button type="button" className="qb-btn ghost sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {t("اختيار ملف")}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void pick(event.target.files?.[0])}
        />
      </div>

      {message ? (
        <p className="qb-offline-note" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
